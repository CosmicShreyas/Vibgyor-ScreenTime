import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';
import { Employee } from '../database/schemas';
import { ActivityLog } from '../database/schemas';
import mongoose from 'mongoose';

interface EmployeeInsight {
  name: string;
  productiveHours: number;
  idleHours: number;
  totalHours: number;
  productivityRate: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
  topApplications: Array<{ name: string; duration: number }>;
}

interface WeeklyReportData {
  weekStart: Date;
  weekEnd: Date;
  totalEmployees: number;
  activeEmployees: number;
  totalProductiveHours: number;
  totalIdleHours: number;
  averageProductivity: number;
  mostProductiveEmployee: EmployeeInsight | null;
  leastProductiveEmployee: EmployeeInsight | null;
  employeeInsights: EmployeeInsight[];
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  /**
   * Initialize email transporter with Gmail SMTP
   */
  private async initializeTransporter(): Promise<void> {
    const emailUser = process.env.SMTP_EMAIL;
    const emailPassword = process.env.SMTP_APP_PASSWORD;

    if (!emailUser || !emailPassword) {
      throw new Error('SMTP credentials not configured. Please set SMTP_EMAIL and SMTP_APP_PASSWORD in environment variables.');
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    });

    // Verify connection
    try {
      await this.transporter.verify();
      logger.info('✅ Email service initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to verify email service:', error);
      throw new Error('Failed to initialize email service. Please check SMTP credentials.');
    }
  }

  /**
   * Generate weekly report data from database
   */
  private async generateWeeklyReportData(): Promise<WeeklyReportData> {
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setHours(23, 59, 59, 999);
    
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    logger.info(`📊 Generating weekly report from ${weekStart.toISOString()} to ${weekEnd.toISOString()}`);

    // Get all employees
    const employees = await Employee.find({}).lean();
    const employeeInsights: EmployeeInsight[] = [];

    for (const employee of employees) {
      const logs = await ActivityLog.find({
        employeeId: employee._id,
        timestamp: { $gte: weekStart, $lte: weekEnd },
      }).lean();

      if (logs.length === 0) {
        continue; // Skip employees with no activity
      }

      const productiveSeconds = logs.reduce((sum, log) => sum + log.workSeconds, 0);
      const idleSeconds = logs.reduce((sum, log) => sum + log.idleSeconds, 0);
      const totalSeconds = productiveSeconds + idleSeconds;

      // Aggregate application usage
      const appUsage = new Map<string, number>();
      logs.forEach(log => {
        log.applications.forEach(app => {
          const current = appUsage.get(app.name) || 0;
          appUsage.set(app.name, current + (app.duration || 0));
        });
      });

      const topApplications = Array.from(appUsage.entries())
        .map(([name, duration]) => ({ name, duration }))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5);

      const timestamps = logs.map(log => log.timestamp).sort((a, b) => a.getTime() - b.getTime());

      employeeInsights.push({
        name: employee.name,
        productiveHours: productiveSeconds / 3600,
        idleHours: idleSeconds / 3600,
        totalHours: totalSeconds / 3600,
        productivityRate: totalSeconds > 0 ? (productiveSeconds / totalSeconds) * 100 : 0,
        firstActivity: timestamps[0] || null,
        lastActivity: timestamps[timestamps.length - 1] || null,
        topApplications,
      });
    }

    // Sort by productivity rate
    employeeInsights.sort((a, b) => b.productivityRate - a.productivityRate);

    const totalProductiveHours = employeeInsights.reduce((sum, e) => sum + e.productiveHours, 0);
    const totalIdleHours = employeeInsights.reduce((sum, e) => sum + e.idleHours, 0);
    const averageProductivity = employeeInsights.length > 0
      ? employeeInsights.reduce((sum, e) => sum + e.productivityRate, 0) / employeeInsights.length
      : 0;

    return {
      weekStart,
      weekEnd,
      totalEmployees: employees.length,
      activeEmployees: employeeInsights.length,
      totalProductiveHours,
      totalIdleHours,
      averageProductivity,
      mostProductiveEmployee: employeeInsights[0] || null,
      leastProductiveEmployee: employeeInsights[employeeInsights.length - 1] || null,
      employeeInsights,
    };
  }

  /**
   * Generate HTML email template
   */
  private generateEmailHTML(data: WeeklyReportData): string {
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const formatHours = (hours: number) => {
      const h = Math.floor(hours);
      const m = Math.floor((hours - h) * 60);
      return `${h}h ${m}m`;
    };

    const formatDateTime = (date: Date | null) => {
      if (!date) return 'N/A';
      return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    };

    const getProductivityColor = (rate: number) => {
      if (rate >= 80) return '#10b981'; // green
      if (rate >= 60) return '#3b82f6'; // blue
      if (rate >= 40) return '#f59e0b'; // orange
      return '#ef4444'; // red
    };

    const getProductivityLabel = (rate: number) => {
      if (rate >= 80) return 'Excellent';
      if (rate >= 60) return 'Good';
      if (rate >= 40) return 'Fair';
      return 'Needs Improvement';
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Team Productivity Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                📊 Team Productivity Snapshot
              </h1>
              <p style="margin: 10px 0 0 0; color: #e0e7ff; font-size: 16px;">
                ${formatDate(data.weekStart)} - ${formatDate(data.weekEnd)}
              </p>
            </td>
          </tr>

          <!-- Summary Stats -->
          <tr>
            <td style="padding: 30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="padding: 15px; background-color: #f9fafb; border-radius: 8px;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">Active Employees</p>
                    <p style="margin: 5px 0 0 0; font-size: 32px; font-weight: 700; color: #111827;">
                      ${data.activeEmployees}<span style="font-size: 18px; color: #6b7280;">/${data.totalEmployees}</span>
                    </p>
                  </td>
                  <td width="10"></td>
                  <td width="50%" style="padding: 15px; background-color: #f9fafb; border-radius: 8px;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">Total Time Tracked</p>
                    <p style="margin: 5px 0 0 0; font-size: 32px; font-weight: 700; color: #111827;">
                      ${formatHours(data.totalProductiveHours + data.totalIdleHours)}
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 10px;">
                <tr>
                  <td width="50%" style="padding: 15px; background-color: #ecfdf5; border-radius: 8px;">
                    <p style="margin: 0; font-size: 14px; color: #059669;">Productive Hours</p>
                    <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: 700; color: #047857;">
                      ${formatHours(data.totalProductiveHours)}
                    </p>
                  </td>
                  <td width="10"></td>
                  <td width="50%" style="padding: 15px; background-color: #fef3c7; border-radius: 8px;">
                    <p style="margin: 0; font-size: 14px; color: #d97706;">Idle Hours</p>
                    <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: 700; color: #b45309;">
                      ${formatHours(data.totalIdleHours)}
                    </p>
                  </td>
                </tr>
              </table>

              <div style="margin-top: 20px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; text-align: center;">
                <p style="margin: 0; font-size: 14px; color: #e0e7ff;">Average Team Productivity</p>
                <p style="margin: 5px 0 0 0; font-size: 42px; font-weight: 700; color: #ffffff;">
                  ${data.averageProductivity.toFixed(1)}%
                </p>
              </div>
            </td>
          </tr>

          <!-- Top Performers -->
          ${data.mostProductiveEmployee ? `
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #111827; font-weight: 600;">
                🏆 Top Performer
              </h2>
              <div style="padding: 20px; background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 8px;">
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">
                  ${data.mostProductiveEmployee.name}
                </p>
                <p style="margin: 8px 0 0 0; font-size: 14px; color: #6b7280;">
                  Productivity Rate: <span style="color: #10b981; font-weight: 600;">${data.mostProductiveEmployee.productivityRate.toFixed(1)}%</span>
                </p>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #6b7280;">
                  Productive Hours: ${formatHours(data.mostProductiveEmployee.productiveHours)} | 
                  Idle: ${formatHours(data.mostProductiveEmployee.idleHours)}
                </p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Employee Details -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #111827; font-weight: 600;">
                👥 Employee Insights
              </h2>
              ${data.employeeInsights.map(emp => `
                <div style="margin-bottom: 15px; padding: 20px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">
                          ${emp.name}
                        </p>
                        <p style="margin: 5px 0 0 0; font-size: 13px; color: #6b7280;">
                          ${formatDateTime(emp.firstActivity)} - ${formatDateTime(emp.lastActivity)}
                        </p>
                      </td>
                      <td align="right">
                        <div style="display: inline-block; padding: 6px 12px; background-color: ${getProductivityColor(emp.productivityRate)}; color: #ffffff; border-radius: 20px; font-size: 13px; font-weight: 600;">
                          ${emp.productivityRate.toFixed(1)}%
                        </div>
                      </td>
                    </tr>
                  </table>
                  
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 12px;">
                    <tr>
                      <td width="33%" style="padding-right: 10px;">
                        <p style="margin: 0; font-size: 12px; color: #6b7280;">Productive</p>
                        <p style="margin: 3px 0 0 0; font-size: 14px; font-weight: 600; color: #10b981;">
                          ${formatHours(emp.productiveHours)}
                        </p>
                      </td>
                      <td width="33%" style="padding-right: 10px;">
                        <p style="margin: 0; font-size: 12px; color: #6b7280;">Idle</p>
                        <p style="margin: 3px 0 0 0; font-size: 14px; font-weight: 600; color: #f59e0b;">
                          ${formatHours(emp.idleHours)}
                        </p>
                      </td>
                      <td width="33%">
                        <p style="margin: 0; font-size: 12px; color: #6b7280;">Total</p>
                        <p style="margin: 3px 0 0 0; font-size: 14px; font-weight: 600; color: #111827;">
                          ${formatHours(emp.totalHours)}
                        </p>
                      </td>
                    </tr>
                  </table>

                  ${emp.topApplications.length > 0 ? `
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">Top Applications:</p>
                      ${emp.topApplications.slice(0, 3).map(app => `
                        <span style="display: inline-block; margin: 0 8px 8px 0; padding: 4px 10px; background-color: #f3f4f6; color: #374151; border-radius: 12px; font-size: 11px;">
                          ${app.name} (${formatHours(app.duration / 3600)})
                        </span>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 14px; color: #6b7280;">
                This is an automated weekly report from your monitoring system
              </p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #9ca3af;">
                Generated on ${new Date().toLocaleString('en-US', { 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  /**
   * Send weekly report to specified email addresses
   */
  async sendWeeklyReport(recipients: string[]): Promise<void> {
    if (!recipients || recipients.length === 0) {
      throw new Error('No recipients specified');
    }

    if (recipients.length > 5) {
      throw new Error('Maximum 5 recipients allowed');
    }

    logger.info(`📧 Preparing to send weekly report to ${recipients.length} recipient(s)`);

    // Initialize transporter if not already done
    if (!this.transporter) {
      await this.initializeTransporter();
    }

    // Generate report data
    const reportData = await this.generateWeeklyReportData();
    const htmlContent = this.generateEmailHTML(reportData);

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const subject = `📊 Weekly Team Productivity Report - ${formatDate(reportData.weekStart)} to ${formatDate(reportData.weekEnd)}`;

    // Send email
    try {
      const info = await this.transporter!.sendMail({
        from: `"Team Monitoring System" <${process.env.SMTP_EMAIL}>`,
        to: recipients.join(', '),
        subject,
        html: htmlContent,
      });

      logger.info(`✅ Weekly report sent successfully. Message ID: ${info.messageId}`);
    } catch (error) {
      logger.error('❌ Failed to send weekly report:', error);
      throw new Error('Failed to send email. Please check SMTP configuration.');
    }
  }

  /**
   * Send EOD (End of Day) report to employee
   */
  async sendEODReport(recipient: string, data: any): Promise<void> {
    logger.info(`📧 Sending EOD report to ${recipient}`);

    if (!this.transporter) {
      await this.initializeTransporter();
    }

    const formatHours = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    };

    const formatDateTime = (date: Date | null) => {
      if (!date) return 'N/A';
      return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    };

    const getProductivityColor = (rate: number) => {
      if (rate >= 80) return '#10b981';
      if (rate >= 60) return '#3b82f6';
      if (rate >= 40) return '#f59e0b';
      return '#ef4444';
    };

    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Progress Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                📊 Your Daily Progress Report
              </h1>
              <p style="margin: 10px 0 0 0; color: #e0e7ff; font-size: 16px;">
                ${today}
              </p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 30px 30px 20px 30px;">
              <p style="margin: 0; font-size: 16px; color: #374151;">
                Hi <strong>${data.employeeName}</strong>,
              </p>
              <p style="margin: 10px 0 0 0; font-size: 14px; color: #6b7280;">
                Here's a summary of your productivity for today.
              </p>
            </td>
          </tr>

          <!-- Productivity Score -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <div style="padding: 25px; background: linear-gradient(135deg, ${getProductivityColor(data.productivityRate)} 0%, ${getProductivityColor(data.productivityRate)}dd 100%); border-radius: 12px; text-align: center;">
                <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 1px;">
                  Productivity Score
                </p>
                <p style="margin: 8px 0 0 0; font-size: 48px; font-weight: 700; color: #ffffff;">
                  ${data.productivityRate.toFixed(1)}%
                </p>
              </div>
            </td>
          </tr>

          <!-- Time Breakdown -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #111827; font-weight: 600;">
                ⏱️ Time Breakdown
              </h2>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="padding: 15px; background-color: #ecfdf5; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #059669; text-transform: uppercase;">Work Time</p>
                    <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: 700; color: #047857;">
                      ${formatHours(data.workTime)}
                    </p>
                  </td>
                  <td width="2%"></td>
                  <td width="33%" style="padding: 15px; background-color: #fef3c7; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #d97706; text-transform: uppercase;">Idle Time</p>
                    <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: 700; color: #b45309;">
                      ${formatHours(data.idleTime)}
                    </p>
                  </td>
                  <td width="2%"></td>
                  <td width="33%" style="padding: 15px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">Offline</p>
                    <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: 700; color: #374151;">
                      ${formatHours(data.offlineTime)}
                    </p>
                  </td>
                </tr>
              </table>

              <div style="margin-top: 15px; padding: 15px; background-color: #f9fafb; border-radius: 8px; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #6b7280;">Total Tracked Time</p>
                <p style="margin: 5px 0 0 0; font-size: 20px; font-weight: 600; color: #111827;">
                  ${formatHours(data.totalTime)}
                </p>
              </div>
            </td>
          </tr>

          <!-- Activity Window -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #111827; font-weight: 600;">
                🕐 Activity Window
              </h2>
              <div style="padding: 15px; background-color: #f9fafb; border-radius: 8px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%">
                      <p style="margin: 0; font-size: 12px; color: #6b7280;">First Activity</p>
                      <p style="margin: 5px 0 0 0; font-size: 14px; font-weight: 600; color: #111827;">
                        ${formatDateTime(data.firstActivity)}
                      </p>
                    </td>
                    <td width="50%" align="right">
                      <p style="margin: 0; font-size: 12px; color: #6b7280;">Last Activity</p>
                      <p style="margin: 5px 0 0 0; font-size: 14px; font-weight: 600; color: #111827;">
                        ${formatDateTime(data.lastActivity)}
                      </p>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Top Applications -->
          ${data.topApplications.length > 0 ? `
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #111827; font-weight: 600;">
                💻 Most Used Applications
              </h2>
              <div style="padding: 20px; background-color: #f9fafb; border-radius: 8px;">
                ${data.topApplications.map((app: any, index: number) => `
                  <div style="margin-bottom: ${index < data.topApplications.length - 1 ? '12px' : '0'}; padding-bottom: ${index < data.topApplications.length - 1 ? '12px' : '0'}; border-bottom: ${index < data.topApplications.length - 1 ? '1px solid #e5e7eb' : 'none'};">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #111827;">
                            ${index + 1}. ${app.name}
                          </p>
                        </td>
                        <td align="right">
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #3b82f6;">
                            ${formatHours(app.duration)}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </div>
                `).join('')}
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Top Browser Tabs -->
          ${data.topBrowserTabs.length > 0 ? `
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #111827; font-weight: 600;">
                🌐 Most Visited Websites
              </h2>
              <div style="padding: 20px; background-color: #f9fafb; border-radius: 8px;">
                ${data.topBrowserTabs.map((tab: any, index: number) => `
                  <div style="margin-bottom: ${index < data.topBrowserTabs.length - 1 ? '12px' : '0'}; padding-bottom: ${index < data.topBrowserTabs.length - 1 ? '12px' : '0'}; border-bottom: ${index < data.topBrowserTabs.length - 1 ? '1px solid #e5e7eb' : 'none'};">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #111827;">
                            ${index + 1}. ${tab.title}
                          </p>
                        </td>
                        <td align="right">
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #3b82f6;">
                            ${formatHours(tab.duration)}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </div>
                `).join('')}
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 14px; color: #6b7280;">
                Keep up the great work! 🎉
              </p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #9ca3af;">
                This is an automated daily report from your monitoring system
              </p>
              <p style="margin: 5px 0 0 0; font-size: 12px; color: #9ca3af;">
                Generated on ${new Date().toLocaleString('en-US', { 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    try {
      const info = await this.transporter!.sendMail({
        from: `"Team Monitoring System" <${process.env.SMTP_EMAIL}>`,
        to: recipient,
        subject: `📊 Your Daily Progress Report - ${today}`,
        html: htmlContent,
      });

      logger.info(`✅ EOD report sent successfully. Message ID: ${info.messageId}`);
    } catch (error) {
      logger.error('❌ Failed to send EOD report:', error);
      throw new Error('Failed to send EOD report. Please check SMTP configuration.');
    }
  }

  /**
   * Send test email to verify configuration
   */
  async sendTestEmail(recipient: string): Promise<void> {
    logger.info(`📧 Sending test email to ${recipient}`);

    if (!this.transporter) {
      await this.initializeTransporter();
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Test Email</title>
</head>
<body style="margin: 0; padding: 40px; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <h1 style="margin: 0 0 20px 0; color: #111827; font-size: 24px;">✅ Email Configuration Test</h1>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">
      Your email configuration is working correctly!
    </p>
    <p style="margin: 0; color: #6b7280; font-size: 14px;">
      This is a test email from your monitoring system. Weekly reports will be sent to this address.
    </p>
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
        Sent on ${new Date().toLocaleString()}
      </p>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: `"Team Monitoring System" <${process.env.SMTP_EMAIL}>`,
        to: recipient,
        subject: '✅ Email Configuration Test - Monitoring System',
        html: htmlContent,
      });

      logger.info(`✅ Test email sent successfully. Message ID: ${info.messageId}`);
    } catch (error) {
      logger.error('❌ Failed to send test email:', error);
      throw new Error('Failed to send test email. Please check SMTP configuration.');
    }
  }
}

export const emailService = new EmailService();
