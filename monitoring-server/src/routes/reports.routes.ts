import { Router, Request, Response } from 'express';
import { reportsService } from '../services/reports.service';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';
import { validateJwtToken } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/reports/config
 * Get reports configuration
 */
router.get('/config', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const config = await reportsService.getConfig();
    res.json(config);
  } catch (error) {
    logger.error('Error fetching reports config:', error);
    res.status(500).json({ error: 'Failed to fetch reports configuration' });
  }
});

/**
 * PUT /api/reports/config
 * Update reports configuration
 */
router.put('/config', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const config = await reportsService.updateConfig(updates);
    res.json({ message: 'Reports configuration updated successfully', config });
  } catch (error: any) {
    logger.error('Error updating reports config:', error);
    res.status(400).json({ error: error.message || 'Failed to update reports configuration' });
  }
});

/**
 * POST /api/reports/recipients
 * Add recipient email
 */
router.post('/recipients', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const config = await reportsService.addRecipient(email);
    res.json({ message: 'Recipient added successfully', config });
  } catch (error: any) {
    logger.error('Error adding recipient:', error);
    res.status(400).json({ error: error.message || 'Failed to add recipient' });
  }
});

/**
 * DELETE /api/reports/recipients/:email
 * Remove recipient email
 */
router.delete('/recipients/:email', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const config = await reportsService.removeRecipient(email);
    res.json({ message: 'Recipient removed successfully', config });
  } catch (error: any) {
    logger.error('Error removing recipient:', error);
    res.status(400).json({ error: error.message || 'Failed to remove recipient' });
  }
});

/**
 * POST /api/reports/send-now
 * Send weekly report immediately
 */
router.post('/send-now', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const config = await reportsService.getConfig();
    
    if (config.recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients configured' });
    }

    await emailService.sendWeeklyReport(config.recipients);
    res.json({ message: 'Weekly report sent successfully' });
  } catch (error: any) {
    logger.error('Error sending weekly report:', error);
    res.status(500).json({ error: error.message || 'Failed to send weekly report' });
  }
});

/**
 * POST /api/reports/test-email
 * Send test email to verify configuration
 */
router.post('/test-email', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    await emailService.sendTestEmail(email);
    res.json({ message: 'Test email sent successfully' });
  } catch (error: any) {
    logger.error('Error sending test email:', error);
    res.status(500).json({ error: error.message || 'Failed to send test email' });
  }
});

/**
 * GET /api/reports/smtp-config
 * Get SMTP configuration status
 */
router.get('/smtp-config', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const smtpEmail = process.env.SMTP_EMAIL || '';
    const smtpPassword = process.env.SMTP_APP_PASSWORD || '';
    
    // Return masked email and password status
    const maskedEmail = smtpEmail ? smtpEmail.replace(/(.{2})(.*)(@.*)/, '$1••••$3') : '';
    
    res.json({
      configured: !!(smtpEmail && smtpPassword),
      email: smtpEmail, // Return full email for editing
      maskedEmail: maskedEmail, // Return masked version for display
      hasPassword: !!smtpPassword,
    });
  } catch (error) {
    logger.error('Error fetching SMTP config:', error);
    res.status(500).json({ error: 'Failed to fetch SMTP configuration' });
  }
});

/**
 * PUT /api/reports/smtp-config
 * Update SMTP configuration in .env file
 */
router.put('/smtp-config', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { email, appPassword } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Update environment variables
    process.env.SMTP_EMAIL = email;
    
    // Only update password if provided
    if (appPassword) {
      process.env.SMTP_APP_PASSWORD = appPassword;
    }

    // Update .env file
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(process.cwd(), '.env');
    
    let envContent = '';
    try {
      envContent = fs.readFileSync(envPath, 'utf-8');
    } catch (error) {
      // File doesn't exist, create new content
    }

    const lines = envContent.split('\n');
    const updatedLines: string[] = [];
    let emailFound = false;
    let passwordFound = false;

    for (const line of lines) {
      if (line.startsWith('SMTP_EMAIL=')) {
        updatedLines.push(`SMTP_EMAIL=${email}`);
        emailFound = true;
      } else if (line.startsWith('SMTP_APP_PASSWORD=') && appPassword) {
        updatedLines.push(`SMTP_APP_PASSWORD=${appPassword}`);
        passwordFound = true;
      } else {
        updatedLines.push(line);
      }
    }

    if (!emailFound) {
      updatedLines.push(`SMTP_EMAIL=${email}`);
    }
    if (!passwordFound && appPassword) {
      updatedLines.push(`SMTP_APP_PASSWORD=${appPassword}`);
    }

    fs.writeFileSync(envPath, updatedLines.join('\n'), 'utf-8');

    res.json({ 
      message: appPassword 
        ? 'SMTP configuration updated successfully' 
        : 'SMTP email updated successfully (password unchanged)'
    });
  } catch (error: any) {
    logger.error('Error updating SMTP config:', error);
    res.status(500).json({ error: error.message || 'Failed to update SMTP configuration' });
  }
});

export default router;
