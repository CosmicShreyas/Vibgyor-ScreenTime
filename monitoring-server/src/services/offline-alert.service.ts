import cron from 'node-cron';
import { ConnectedClient } from '../database/schemas';
import { dashboardConfigService } from './dashboard-config.service';
import { emailService } from './email.service';
import { logger } from '../utils/logger';

const OFFLINE_THRESHOLD_MINUTES = 60;

export class OfflineAlertService {
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  start(): void {
    if (this.cronJob) {
      logger.warn('Offline alert service is already running');
      return;
    }

    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.checkOfflineClients();
    });

    logger.info('Offline alert service started - checking every minute');
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Offline alert service stopped');
    }
  }

  async checkOfflineClients(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Offline alert scan skipped because a previous scan is still running');
      return;
    }

    this.isRunning = true;

    try {
      const now = new Date();
      const offlineCutoff = new Date(now.getTime() - OFFLINE_THRESHOLD_MINUTES * 60000);
      const candidates = await ConnectedClient.find({
        lastSeen: { $lte: offlineCutoff },
        $or: [
          { status: { $ne: 'offline' } },
          { lastOfflineAlertSentAt: { $exists: false } },
          { lastOfflineAlertSentAt: null },
        ],
      }).lean();

      if (candidates.length === 0) {
        return;
      }

      const dashboardConfig = await dashboardConfigService.loadConfig();
      const recipients = dashboardConfig.adminEmails || [];

      for (const client of candidates) {
        const employeeName = client.employeeName || client.clientId;

        try {
          if (recipients.length > 0) {
            await emailService.sendClientOfflineAlert(recipients, {
              clientId: client.clientId,
              employeeName,
              employeeId: client.employeeId,
              hostname: client.systemInfo?.hostname,
              osName: client.systemInfo?.osName,
              osVersion: client.systemInfo?.osVersion,
              offlineSince: new Date(client.lastSeen),
              detectedAt: now,
            });
          } else {
            logger.warn('Skipping offline alert email because no admin emails are configured', {
              clientId: client.clientId,
              employeeName,
            });
          }

          await ConnectedClient.updateOne(
            { _id: client._id },
            {
              $set: {
                status: 'offline',
                ...(recipients.length > 0 ? { lastOfflineAlertSentAt: now } : {}),
              },
            }
          );

          logger.info('Marked client as offline', {
            clientId: client.clientId,
            employeeName,
            emailSent: recipients.length > 0,
          });
        } catch (error) {
          logger.error('Failed to process offline client alert', {
            clientId: client.clientId,
            employeeName,
            error: error instanceof Error ? error.message : error,
          });
        }
      }
    } catch (error) {
      logger.error('Offline alert scan failed', error);
    } finally {
      this.isRunning = false;
    }
  }
}

export const offlineAlertService = new OfflineAlertService();
