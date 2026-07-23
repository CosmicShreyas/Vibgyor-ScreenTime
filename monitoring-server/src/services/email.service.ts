import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';
import { Employee } from '../database/schemas';
import { ActivityLog } from '../database/schemas';
import mongoose from 'mongoose';
import { config } from '../config';
import { startOfDay as tzStartOfDay, endOfDay as tzEndOfDay, toDateStr, addDaysStr } from '../utils/timezone';

// All report emails render dates/times in the business timezone (IST by default),
// since the underlying timestamps are stored as UTC instants.
const TZ = config.appTimezone;

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

interface OfflineAlertData {
  clientId: string;
  employeeName: string;
  employeeId?: string;
  hostname?: string;
  osName?: string;
  osVersion?: string;
  offlineSince: Date;
  detectedAt: Date;
}

/** A single threshold alert (mirrors alerts.service Alert). */
export interface AlertEmailItem {
  employee_name: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  value?: number;
  threshold?: number;
}

/** A single at-risk employee row (mirrors wellbeing burnout radar). */
export interface BurnoutEmailItem {
  employee_name: string;
  risk_score: number;
  level: 'high' | 'moderate' | 'low';
  avg_daily_hours: number;
  after_hours_hours: number;
  weekend_hours: number;
  longest_no_break_minutes: number;
  reasons: string[];
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

  // ---------------------------------------------------------------------------
  // Shared, dark/light-mode-aware email shell + helpers
  //
  // Email dark mode is a mess: Apple Mail / iOS respect `prefers-color-scheme`
  // and `color-scheme`; Gmail (app) and Outlook.com AGGRESSIVELY auto-invert
  // colours unless told the message is dark-mode-ready. Strategy used here:
  //   1. Declare `color-scheme: light dark` + supported-color-schemes meta so
  //      capable clients stop force-inverting and honour our own dark styles.
  //   2. Ship a LIGHT baseline (works everywhere, even in clients that ignore
  //      all of this), then override via `@media (prefers-color-scheme: dark)`
  //      classes for clients that support embedded <style>.
  //   3. Add Outlook.com `[data-ogsc]`/`[data-ogsb]` overrides for its inverter.
  //   4. Use solid hex colours (no gradients relied on for legibility) and put
  //      light text only on dark brand panels that stay dark in both modes.
  // ---------------------------------------------------------------------------

  private escapeHtml(value?: string | number | null): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatHoursFromSeconds(seconds: number): string {
    const h = Math.floor(Math.max(0, seconds) / 3600);
    const m = Math.floor((Math.max(0, seconds) % 3600) / 60);
    return `${h}h ${m}m`;
  }

  private formatHoursFromHours(hours: number): string {
    const h = Math.floor(Math.max(0, hours));
    const m = Math.floor((Math.max(0, hours) - h) * 60);
    return `${h}h ${m}m`;
  }

  /**
   * Wrap body HTML in the responsive, dark/light-aware shell. `preheader` is the
   * hidden inbox-preview snippet; `body` is the inner content (already escaped).
   */
  private wrapEmail(opts: {
    title: string;
    preheader?: string;
    eyebrow?: string;
    heading: string;
    subheading?: string;
    /** Brand header accent — a solid colour that reads on white text. */
    accent?: string;
    body: string;
    footerNote?: string;
  }): string {
    const accent = opts.accent || '#2563eb';
    const generatedOn = new Date().toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ,
    });
    return `<!DOCTYPE html>
<html lang="en" style="margin:0;padding:0;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${this.escapeHtml(opts.title)}</title>
  <style>
    /* Base */
    body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; }
    img { border:0; line-height:100%; outline:none; text-decoration:none; }
    a { color:${accent}; }
    /* Dark-mode overrides for clients that honour prefers-color-scheme + <style> */
    @media (prefers-color-scheme: dark) {
      .st-bg      { background-color:#0b1220 !important; }
      .st-card    { background-color:#111a2e !important; border-color:#22314f !important; }
      .st-text    { color:#e8eef9 !important; }
      .st-muted   { color:#8ca0bf !important; }
      .st-soft    { background-color:#0f1a2e !important; border-color:#22314f !important; }
      .st-hr      { border-color:#22314f !important; }
      .st-chip    { background-color:#17253c !important; color:#cbd5e1 !important; }
      .st-footer  { background-color:#0b1220 !important; border-color:#22314f !important; }
      /* tinted stat tiles → subtle dark tints */
      .st-good    { background-color:#0e2a20 !important; }
      .st-good-t  { color:#5eead4 !important; }
      .st-warn    { background-color:#2b2410 !important; }
      .st-warn-t  { color:#fcd34d !important; }
      .st-neutral { background-color:#131c2e !important; }
    }
    /* Outlook.com dark mode */
    [data-ogsc] .st-text  { color:#e8eef9 !important; }
    [data-ogsc] .st-muted { color:#8ca0bf !important; }
    [data-ogsb] .st-bg    { background-color:#0b1220 !important; }
    [data-ogsb] .st-card  { background-color:#111a2e !important; }
    [data-ogsb] .st-soft  { background-color:#0f1a2e !important; }
    [data-ogsb] .st-footer{ background-color:#0b1220 !important; }
  </style>
</head>
<body class="st-bg" style="margin:0;padding:0;background-color:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${this.escapeHtml(opts.preheader || opts.subheading || opts.heading)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="st-bg" style="background-color:#eef2f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="st-card" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.10);">
          <!-- Brand header (stays dark in both modes) -->
          <tr>
            <td style="padding:32px 30px;background-color:${accent};background-image:linear-gradient(135deg,${accent} 0%,#1e3a8a 100%);">
              ${opts.eyebrow ? `<div style="display:inline-block;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,0.18);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${this.escapeHtml(opts.eyebrow)}</div>` : ''}
              <h1 style="margin:${opts.eyebrow ? '14px' : '0'} 0 0 0;color:#ffffff;font-size:26px;line-height:1.25;font-weight:800;">${this.escapeHtml(opts.heading)}</h1>
              ${opts.subheading ? `<p style="margin:8px 0 0 0;color:#dbeafe;font-size:15px;line-height:1.5;">${this.escapeHtml(opts.subheading)}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td class="st-card" style="padding:28px 30px;background-color:#ffffff;">
              ${opts.body}
            </td>
          </tr>
          <tr>
            <td class="st-footer" style="padding:22px 30px;background-color:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
              <p class="st-muted" style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">${this.escapeHtml(opts.footerNote || 'Automated message from the ScreenTime monitoring system.')}</p>
              <p class="st-muted" style="margin:8px 0 0 0;color:#9ca3af;font-size:12px;">Generated on ${generatedOn}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Generate weekly report data from database
   */
  private async generateWeeklyReportData(): Promise<WeeklyReportData> {
    // Business-timezone week window: last 7 completed days up to today.
    const todayStr = toDateStr(new Date());
    const weekEnd = tzEndOfDay(todayStr);
    const weekStart = tzStartOfDay(addDaysStr(todayStr, -7));

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
   * Generate natural-language insights from the weekly report data.
   * Deterministic/template-based — surfaces the same kind of takeaways an
   * analyst would call out (top performer, idle trends, participation).
   */
  private generateWeeklyInsights(data: WeeklyReportData): string[] {
    const insights: string[] = [];
    if (data.activeEmployees === 0) {
      return ['No employee activity was recorded during this period.'];
    }

    insights.push(
      `${data.activeEmployees} of ${data.totalEmployees} employees were active this week, averaging ${data.averageProductivity.toFixed(0)}% productivity.`
    );

    if (data.mostProductiveEmployee) {
      insights.push(
        `Top performer: ${data.mostProductiveEmployee.name} at ${data.mostProductiveEmployee.productivityRate.toFixed(0)}% productivity.`
      );
    }

    if (
      data.leastProductiveEmployee &&
      data.leastProductiveEmployee.name !== data.mostProductiveEmployee?.name &&
      data.leastProductiveEmployee.productivityRate < 50
    ) {
      insights.push(
        `${data.leastProductiveEmployee.name} had the lowest productivity (${data.leastProductiveEmployee.productivityRate.toFixed(0)}%) and may need support.`
      );
    }

    const totalTracked = data.totalProductiveHours + data.totalIdleHours;
    if (totalTracked > 0) {
      const idlePct = (data.totalIdleHours / totalTracked) * 100;
      if (idlePct > 30) {
        insights.push(`Team idle time was high this week at ${idlePct.toFixed(0)}% of tracked time.`);
      }
    }

    return insights;
  }

  /**
   * Generate HTML email template
   */
  private generateEmailHTML(data: WeeklyReportData): string {
    const insights = this.generateWeeklyInsights(data);
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ });
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
        minute: '2-digit',
        timeZone: TZ,
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

    const esc = (v: any) => this.escapeHtml(v);
    const body = `
      <!-- Summary stat tiles -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" class="st-soft" style="padding:15px;background-color:#f9fafb;border:1px solid #eef1f5;border-radius:10px;">
            <p class="st-muted" style="margin:0;font-size:13px;color:#6b7280;">Active Employees</p>
            <p class="st-text" style="margin:5px 0 0 0;font-size:30px;font-weight:800;color:#111827;">
              ${data.activeEmployees}<span class="st-muted" style="font-size:17px;color:#6b7280;">/${data.totalEmployees}</span>
            </p>
          </td>
          <td width="12"></td>
          <td width="50%" class="st-soft" style="padding:15px;background-color:#f9fafb;border:1px solid #eef1f5;border-radius:10px;">
            <p class="st-muted" style="margin:0;font-size:13px;color:#6b7280;">Total Time Tracked</p>
            <p class="st-text" style="margin:5px 0 0 0;font-size:30px;font-weight:800;color:#111827;">
              ${formatHours(data.totalProductiveHours + data.totalIdleHours)}
            </p>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr>
          <td width="50%" class="st-good" style="padding:15px;background-color:#ecfdf5;border-radius:10px;">
            <p class="st-good-t" style="margin:0;font-size:13px;color:#059669;">Productive Hours</p>
            <p class="st-good-t" style="margin:5px 0 0 0;font-size:26px;font-weight:800;color:#047857;">${formatHours(data.totalProductiveHours)}</p>
          </td>
          <td width="12"></td>
          <td width="50%" class="st-warn" style="padding:15px;background-color:#fef3c7;border-radius:10px;">
            <p class="st-warn-t" style="margin:0;font-size:13px;color:#d97706;">Idle Hours</p>
            <p class="st-warn-t" style="margin:5px 0 0 0;font-size:26px;font-weight:800;color:#b45309;">${formatHours(data.totalIdleHours)}</p>
          </td>
        </tr>
      </table>

      <div style="margin-top:18px;padding:20px;background-color:#2563eb;background-image:linear-gradient(135deg,#2563eb 0%,#1e3a8a 100%);border-radius:12px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#dbeafe;letter-spacing:0.04em;">Average Team Productivity</p>
        <p style="margin:6px 0 0 0;font-size:40px;font-weight:800;color:#ffffff;">${data.averageProductivity.toFixed(1)}%</p>
      </div>

      <!-- Insights -->
      <div class="st-soft" style="margin-top:18px;padding:18px 20px;background-color:#f5f3ff;border:1px solid #e6e0fb;border-radius:12px;">
        <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#6d28d9;">💡 Key Insights</p>
        <ul class="st-text" style="margin:0;padding-left:18px;color:#4c1d95;font-size:14px;line-height:1.7;">
          ${insights.map((i) => `<li>${esc(i)}</li>`).join('')}
        </ul>
      </div>

      ${data.mostProductiveEmployee ? `
      <h2 class="st-text" style="margin:26px 0 12px 0;font-size:18px;color:#111827;font-weight:700;">🏆 Top Performer</h2>
      <div class="st-soft" style="padding:18px 20px;background-color:#f0fdf4;border-left:4px solid #10b981;border-radius:10px;">
        <p class="st-text" style="margin:0;font-size:17px;font-weight:700;color:#111827;">${esc(data.mostProductiveEmployee.name)}</p>
        <p class="st-muted" style="margin:6px 0 0 0;font-size:14px;color:#6b7280;">Productivity: <span style="color:#10b981;font-weight:700;">${data.mostProductiveEmployee.productivityRate.toFixed(1)}%</span> · Productive ${formatHours(data.mostProductiveEmployee.productiveHours)} · Idle ${formatHours(data.mostProductiveEmployee.idleHours)}</p>
      </div>` : ''}

      <h2 class="st-text" style="margin:26px 0 12px 0;font-size:18px;color:#111827;font-weight:700;">👥 Employee Insights</h2>
      ${data.employeeInsights.map(emp => `
        <div class="st-soft" style="margin-bottom:12px;padding:18px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p class="st-text" style="margin:0;font-size:16px;font-weight:700;color:#111827;">${esc(emp.name)}</p>
                <p class="st-muted" style="margin:4px 0 0 0;font-size:12px;color:#6b7280;">${esc(formatDateTime(emp.firstActivity))} – ${esc(formatDateTime(emp.lastActivity))}</p>
              </td>
              <td align="right">
                <span style="display:inline-block;padding:6px 12px;background-color:${getProductivityColor(emp.productivityRate)};color:#ffffff;border-radius:999px;font-size:13px;font-weight:700;">${emp.productivityRate.toFixed(0)}%</span>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
            <tr>
              <td width="33%"><p class="st-muted" style="margin:0;font-size:12px;color:#6b7280;">Productive</p><p style="margin:2px 0 0 0;font-size:14px;font-weight:700;color:#10b981;">${formatHours(emp.productiveHours)}</p></td>
              <td width="33%"><p class="st-muted" style="margin:0;font-size:12px;color:#6b7280;">Idle</p><p style="margin:2px 0 0 0;font-size:14px;font-weight:700;color:#f59e0b;">${formatHours(emp.idleHours)}</p></td>
              <td width="33%"><p class="st-muted" style="margin:0;font-size:12px;color:#6b7280;">Total</p><p class="st-text" style="margin:2px 0 0 0;font-size:14px;font-weight:700;color:#111827;">${formatHours(emp.totalHours)}</p></td>
            </tr>
          </table>
          ${emp.topApplications.length > 0 ? `
          <div class="st-hr" style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;">
            <p class="st-muted" style="margin:0 0 8px 0;font-size:12px;color:#6b7280;">Top Applications</p>
            ${emp.topApplications.slice(0, 3).map(app => `<span class="st-chip" style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;background-color:#f3f4f6;color:#374151;border-radius:999px;font-size:11px;">${esc(app.name)} (${formatHours(app.duration / 3600)})</span>`).join('')}
          </div>` : ''}
        </div>
      `).join('')}
    `;

    return this.wrapEmail({
      title: 'Weekly Team Productivity Report',
      eyebrow: 'ScreenTime · Weekly report',
      heading: '📊 Team Productivity Snapshot',
      subheading: `${formatDate(data.weekStart)} – ${formatDate(data.weekEnd)}`,
      preheader: `Team averaged ${data.averageProductivity.toFixed(0)}% productivity this week.`,
      accent: '#2563eb',
      body,
      footerNote: 'Automated weekly report from the ScreenTime monitoring system.',
    });
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
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ });
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
        minute: '2-digit',
        timeZone: TZ,
      });
    };

    const getProductivityColor = (rate: number) => {
      if (rate >= 80) return '#10b981';
      if (rate >= 60) return '#3b82f6';
      if (rate >= 40) return '#f59e0b';
      return '#ef4444';
    };

    // Header reflects the day the report actually covers (business timezone),
    // not the send date — a report emailed at midnight covers the previous day.
    const reportDay = data.reportDate
      ? tzStartOfDay(data.reportDate)
      : new Date();
    const today = reportDay.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: TZ,
    });

    // A short, data-driven takeaway for the day.
    const eodInsight = (() => {
      if (data.productivityRate >= 80) {
        return `Great focus today — ${data.productivityRate.toFixed(0)}% productive with ${formatHours(data.workTime)} of work.`;
      }
      if (data.idleTime > data.workTime && data.idleTime > 3600) {
        return `Idle time (${formatHours(data.idleTime)}) exceeded active work today — consider fewer interruptions tomorrow.`;
      }
      if (data.topApplications && data.topApplications.length > 0) {
        return `Most-used app today: ${data.topApplications[0].name} (${formatHours(data.topApplications[0].duration)}).`;
      }
      return `You logged ${formatHours(data.workTime)} of work today.`;
    })();

    const esc = (v: any) => this.escapeHtml(v);
    const scoreColor = getProductivityColor(data.productivityRate);
    const listBlock = (title: string, items: any[], valueKey: 'duration', labelKey: string) =>
      items && items.length > 0 ? `
        <h2 class="st-text" style="margin:24px 0 12px 0;font-size:17px;color:#111827;font-weight:700;">${title}</h2>
        <div class="st-soft" style="padding:16px 18px;background-color:#f9fafb;border:1px solid #eef1f5;border-radius:12px;">
          ${items.map((it: any, i: number) => `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${i < items.length - 1 ? 'border-bottom:1px solid #e5e7eb;' : ''}">
              <tr>
                <td style="padding:9px 0;"><p class="st-text" style="margin:0;font-size:14px;font-weight:600;color:#111827;">${i + 1}. ${esc(it[labelKey])}</p></td>
                <td align="right" style="padding:9px 0;"><p style="margin:0;font-size:14px;font-weight:700;color:#2563eb;">${formatHours(it[valueKey])}</p></td>
              </tr>
            </table>`).join('')}
        </div>` : '';

    const body = `
      <p class="st-text" style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(data.employeeName)}</strong>,</p>
      <p class="st-muted" style="margin:8px 0 0 0;font-size:14px;color:#6b7280;">Here's a summary of your productivity for the day.</p>
      <div class="st-soft" style="margin-top:14px;padding:14px 16px;background-color:#f5f3ff;border-left:4px solid #7c3aed;border-radius:8px;">
        <p class="st-text" style="margin:0;font-size:14px;color:#4c1d95;">💡 ${esc(eodInsight)}</p>
      </div>

      <div style="margin-top:20px;padding:24px;background-color:${scoreColor};border-radius:14px;text-align:center;">
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.92);text-transform:uppercase;letter-spacing:0.08em;">Productivity Score</p>
        <p style="margin:6px 0 0 0;font-size:46px;font-weight:800;color:#ffffff;">${data.productivityRate.toFixed(1)}%</p>
      </div>

      <h2 class="st-text" style="margin:24px 0 12px 0;font-size:17px;color:#111827;font-weight:700;">⏱️ Time Breakdown</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="33%" class="st-good" style="padding:14px;background-color:#ecfdf5;border-radius:10px;text-align:center;">
            <p class="st-good-t" style="margin:0;font-size:11px;color:#059669;text-transform:uppercase;">Work</p>
            <p class="st-good-t" style="margin:4px 0 0 0;font-size:22px;font-weight:800;color:#047857;">${formatHours(data.workTime)}</p>
          </td>
          <td width="2%"></td>
          <td width="33%" class="st-warn" style="padding:14px;background-color:#fef3c7;border-radius:10px;text-align:center;">
            <p class="st-warn-t" style="margin:0;font-size:11px;color:#d97706;text-transform:uppercase;">Idle</p>
            <p class="st-warn-t" style="margin:4px 0 0 0;font-size:22px;font-weight:800;color:#b45309;">${formatHours(data.idleTime)}</p>
          </td>
          <td width="2%"></td>
          <td width="33%" class="st-neutral" style="padding:14px;background-color:#f3f4f6;border-radius:10px;text-align:center;">
            <p class="st-muted" style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;">Offline</p>
            <p class="st-text" style="margin:4px 0 0 0;font-size:22px;font-weight:800;color:#374151;">${formatHours(data.offlineTime)}</p>
          </td>
        </tr>
      </table>
      <div class="st-soft" style="margin-top:12px;padding:14px;background-color:#f9fafb;border:1px solid #eef1f5;border-radius:10px;text-align:center;">
        <p class="st-muted" style="margin:0;font-size:12px;color:#6b7280;">Total Tracked Time</p>
        <p class="st-text" style="margin:4px 0 0 0;font-size:20px;font-weight:700;color:#111827;">${formatHours(data.totalTime)}</p>
      </div>

      <h2 class="st-text" style="margin:24px 0 12px 0;font-size:17px;color:#111827;font-weight:700;">🕐 Activity Window</h2>
      <div class="st-soft" style="padding:15px;background-color:#f9fafb;border:1px solid #eef1f5;border-radius:10px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%"><p class="st-muted" style="margin:0;font-size:12px;color:#6b7280;">First Activity</p><p class="st-text" style="margin:4px 0 0 0;font-size:14px;font-weight:700;color:#111827;">${esc(formatDateTime(data.firstActivity))}</p></td>
            <td width="50%" align="right"><p class="st-muted" style="margin:0;font-size:12px;color:#6b7280;">Last Activity</p><p class="st-text" style="margin:4px 0 0 0;font-size:14px;font-weight:700;color:#111827;">${esc(formatDateTime(data.lastActivity))}</p></td>
          </tr>
        </table>
      </div>

      ${listBlock('💻 Most Used Applications', data.topApplications || [], 'duration', 'name')}
      ${listBlock('🌐 Most Visited Websites', data.topBrowserTabs || [], 'duration', 'title')}
    `;

    const htmlContent = this.wrapEmail({
      title: 'Daily Progress Report',
      eyebrow: 'ScreenTime · Daily report',
      heading: '📊 Your Daily Progress',
      subheading: today,
      preheader: `${data.productivityRate.toFixed(0)}% productive · ${formatHours(data.workTime)} of work today.`,
      accent: scoreColor,
      body,
      footerNote: 'Keep up the great work! 🎉 Automated daily report from ScreenTime.',
    });

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
   * Send offline alert to admin recipients
   */
  async sendClientOfflineAlert(recipients: string[], data: OfflineAlertData): Promise<void> {
    if (!recipients || recipients.length === 0) {
      throw new Error('No recipients specified');
    }

    if (!this.transporter) {
      await this.initializeTransporter();
    }

    const esc = (v: any) => this.escapeHtml(v);
    const formatDateTime = (date: Date) => date.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ,
    });

    const offlineMinutes = Math.max(
      0,
      Math.round((data.detectedAt.getTime() - data.offlineSince.getTime()) / 60000)
    );
    const offlineLabel = this.formatHoursFromSeconds(offlineMinutes * 60);

    const detailRow = (label: string, value: string, last = false) => `
      <tr>
        <td class="st-muted st-hr" style="padding:10px 0;color:#64748b;font-size:13px;${last ? '' : 'border-bottom:1px solid #e2e8f0;'}">${esc(label)}</td>
        <td class="st-text st-hr" style="padding:10px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;${last ? '' : 'border-bottom:1px solid #e2e8f0;'}">${esc(value)}</td>
      </tr>`;

    const body = `
      <div class="st-soft" style="padding:18px 20px;border-radius:14px;background-color:#fff1f2;border:1px solid #fecdd3;">
        <p style="margin:0 0 4px 0;color:#be123c;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">Status</p>
        <p class="st-text" style="margin:0;color:#0f172a;font-size:22px;font-weight:800;">${esc(data.employeeName)} is offline</p>
        <p class="st-muted" style="margin:10px 0 0 0;color:#475569;font-size:14px;line-height:1.6;">Last check-in ${esc(formatDateTime(data.offlineSince))} · alert raised ${esc(formatDateTime(data.detectedAt))}.</p>
      </div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
        <tr>
          <td width="50%" style="padding:0 8px 0 0;">
            <div class="st-soft" style="padding:16px;border-radius:12px;background-color:#f8fafc;border:1px solid #e2e8f0;">
              <p class="st-muted" style="margin:0 0 4px 0;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;">Offline For</p>
              <p class="st-text" style="margin:0;color:#0f172a;font-size:24px;font-weight:800;">${offlineLabel}</p>
            </div>
          </td>
          <td width="50%" style="padding:0 0 0 8px;">
            <div class="st-soft" style="padding:16px;border-radius:12px;background-color:#f8fafc;border:1px solid #e2e8f0;">
              <p class="st-muted" style="margin:0 0 4px 0;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;">Client ID</p>
              <p class="st-text" style="margin:0;color:#0f172a;font-size:14px;font-weight:700;word-break:break-word;">${esc(data.clientId)}</p>
            </div>
          </td>
        </tr>
      </table>

      <div class="st-soft" style="margin-top:18px;padding:20px 22px;border-radius:14px;background-color:#ffffff;border:1px solid #e2e8f0;">
        <p class="st-text" style="margin:0 0 12px 0;color:#0f172a;font-size:16px;font-weight:700;">Client Details</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailRow('Employee', data.employeeName)}
          ${detailRow('Employee ID', data.employeeId || 'Not available')}
          ${detailRow('Hostname', data.hostname || 'Not available')}
          ${detailRow('Operating System', [data.osName, data.osVersion].filter(Boolean).join(' ') || 'Not available', true)}
        </table>
      </div>
    `;

    const htmlContent = this.wrapEmail({
      title: 'Client Offline Alert',
      eyebrow: 'ScreenTime · Alert',
      heading: '🔴 Client Offline Alert',
      subheading: 'A monitored client has crossed the offline threshold.',
      preheader: `${data.employeeName} has been offline for ${offlineLabel}.`,
      accent: '#dc2626',
      body,
      footerNote: 'Automated alert from the ScreenTime dashboard notification system.',
    });

    const subject = `🔴 Client Offline Alert - ${data.employeeName}`;

    try {
      const info = await this.transporter.sendMail({
        from: `"Team Monitoring System" <${process.env.SMTP_EMAIL}>`,
        to: recipients.join(', '),
        subject,
        html: htmlContent,
      });

      logger.info(`Offline alert sent successfully. Message ID: ${info.messageId}`, {
        clientId: data.clientId,
        employeeName: data.employeeName,
        recipients: recipients.length,
      });
    } catch (error) {
      logger.error('Failed to send offline alert email:', error);
      throw new Error('Failed to send offline alert email. Please check SMTP configuration.');
    }
  }

  /**
   * Send a digest of active threshold alerts (high idle, low productivity,
   * suspected fake activity, etc.) to admin recipients. Dark/light aware.
   */
  async sendAlertsDigest(recipients: string[], alerts: AlertEmailItem[]): Promise<void> {
    if (!recipients || recipients.length === 0) throw new Error('No recipients specified');
    if (!alerts || alerts.length === 0) {
      logger.info('No alerts to email; skipping alerts digest.');
      return;
    }
    if (!this.transporter) await this.initializeTransporter();

    const esc = (v: any) => this.escapeHtml(v);
    const sevMeta: Record<string, { color: string; label: string; tint: string; tintText: string }> = {
      critical: { color: '#dc2626', label: 'Critical', tint: '#fff1f2', tintText: '#be123c' },
      warning: { color: '#d97706', label: 'Warning', tint: '#fffbeb', tintText: '#b45309' },
      info: { color: '#2563eb', label: 'Info', tint: '#eff6ff', tintText: '#1d4ed8' },
    };
    const typeLabels: Record<string, string> = {
      high_idle: 'High idle time',
      low_productivity: 'Low productivity',
      offline_during_shift: 'Offline during shift',
      unproductive_overuse: 'Unproductive overuse',
      suspected_fake_activity: 'Suspected fake activity',
      idle_explanation: 'Idle explanation',
    };

    const rank = (s: string) => (s === 'critical' ? 0 : s === 'warning' ? 1 : 2);
    const sorted = [...alerts].sort((a, b) => rank(a.severity) - rank(b.severity));
    const criticalCount = sorted.filter((a) => a.severity === 'critical').length;
    const warningCount = sorted.filter((a) => a.severity === 'warning').length;

    const card = (a: AlertEmailItem) => {
      const m = sevMeta[a.severity] || sevMeta.info;
      const typeLabel = typeLabels[a.type] || a.type;
      return `
        <div class="st-soft" style="margin-bottom:10px;padding:16px 18px;border-radius:12px;background-color:#ffffff;border:1px solid #e5e7eb;border-left:4px solid ${m.color};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p class="st-text" style="margin:0;font-size:15px;font-weight:700;color:#111827;">${esc(a.employee_name)}</p>
                <p class="st-muted" style="margin:3px 0 0 0;font-size:12px;color:#6b7280;">${esc(typeLabel)}</p>
              </td>
              <td align="right" style="white-space:nowrap;">
                <span style="display:inline-block;padding:4px 10px;background-color:${m.color};color:#ffffff;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;">${m.label}</span>
              </td>
            </tr>
          </table>
          <p class="st-text" style="margin:10px 0 0 0;font-size:13px;line-height:1.6;color:#374151;">${esc(a.message)}</p>
          ${typeof a.value === 'number' && typeof a.threshold === 'number' ? `<p class="st-muted" style="margin:6px 0 0 0;font-size:12px;color:#6b7280;">Observed <strong style="color:${m.color};">${esc(a.value)}</strong> · threshold ${esc(a.threshold)}</p>` : ''}
        </div>`;
    };

    const body = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" class="st-soft" style="padding:15px;background-color:#fff1f2;border-radius:10px;">
            <p style="margin:0;font-size:12px;color:#be123c;text-transform:uppercase;">Critical</p>
            <p class="st-text" style="margin:4px 0 0 0;font-size:28px;font-weight:800;color:#0f172a;">${criticalCount}</p>
          </td>
          <td width="12"></td>
          <td width="50%" class="st-soft" style="padding:15px;background-color:#fffbeb;border-radius:10px;">
            <p style="margin:0;font-size:12px;color:#b45309;text-transform:uppercase;">Warnings</p>
            <p class="st-text" style="margin:4px 0 0 0;font-size:28px;font-weight:800;color:#0f172a;">${warningCount}</p>
          </td>
        </tr>
      </table>
      <h2 class="st-text" style="margin:22px 0 12px 0;font-size:17px;color:#111827;font-weight:700;">Active Alerts (${sorted.length})</h2>
      ${sorted.map(card).join('')}
    `;

    const htmlContent = this.wrapEmail({
      title: 'Activity Alerts',
      eyebrow: 'ScreenTime · Alerts',
      heading: '⚠️ Activity Alerts',
      subheading: `${sorted.length} alert${sorted.length === 1 ? '' : 's'} need your attention`,
      preheader: `${criticalCount} critical, ${warningCount} warning alert(s) require attention.`,
      accent: criticalCount > 0 ? '#dc2626' : '#d97706',
      body,
      footerNote: 'Automated alerts from the ScreenTime monitoring system.',
    });

    try {
      const info = await this.transporter!.sendMail({
        from: `"Team Monitoring System" <${process.env.SMTP_EMAIL}>`,
        to: recipients.join(', '),
        subject: `⚠️ ScreenTime Alerts — ${criticalCount} critical, ${warningCount} warning`,
        html: htmlContent,
      });
      logger.info(`✅ Alerts digest sent. Message ID: ${info.messageId}`);
    } catch (error) {
      logger.error('❌ Failed to send alerts digest:', error);
      throw new Error('Failed to send alerts digest. Please check SMTP configuration.');
    }
  }

  /**
   * Send a wellbeing burnout-radar alert to admin recipients, listing employees
   * trending toward burnout. Framed supportively (duty of care), dark/light aware.
   */
  async sendBurnoutAlert(recipients: string[], atRisk: BurnoutEmailItem[], windowDays = 7): Promise<void> {
    if (!recipients || recipients.length === 0) throw new Error('No recipients specified');
    if (!atRisk || atRisk.length === 0) {
      logger.info('No at-risk employees; skipping burnout alert.');
      return;
    }
    if (!this.transporter) await this.initializeTransporter();

    const esc = (v: any) => this.escapeHtml(v);
    const levelMeta: Record<string, { color: string; label: string }> = {
      high: { color: '#dc2626', label: 'High risk' },
      moderate: { color: '#d97706', label: 'Moderate' },
      low: { color: '#059669', label: 'Low' },
    };
    const sorted = [...atRisk].sort((a, b) => b.risk_score - a.risk_score);
    const highCount = sorted.filter((r) => r.level === 'high').length;

    const card = (r: BurnoutEmailItem) => {
      const m = levelMeta[r.level] || levelMeta.moderate;
      const pct = Math.max(0, Math.min(100, r.risk_score));
      return `
        <div class="st-soft" style="margin-bottom:12px;padding:16px 18px;border-radius:12px;background-color:#ffffff;border:1px solid #e5e7eb;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><p class="st-text" style="margin:0;font-size:15px;font-weight:700;color:#111827;">${esc(r.employee_name)}</p></td>
              <td align="right"><span style="display:inline-block;padding:4px 10px;background-color:${m.color};color:#ffffff;border-radius:999px;font-size:11px;font-weight:700;">${m.label} · ${r.risk_score}</span></td>
            </tr>
          </table>
          <!-- risk meter (table-based so it renders in all clients) -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-radius:999px;overflow:hidden;background-color:#e5e7eb;">
            <tr><td style="height:6px;line-height:6px;font-size:0;background-color:${m.color};width:${pct}%;">&nbsp;</td><td style="height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>
          </table>
          <p class="st-muted" style="margin:10px 0 0 0;font-size:12px;color:#6b7280;line-height:1.6;">
            ${esc(r.avg_daily_hours)}h/day avg · ${esc(r.after_hours_hours)}h after-hours · ${esc(r.longest_no_break_minutes)}m longest stretch without a break
          </p>
          ${r.reasons && r.reasons.length ? `<p class="st-text" style="margin:6px 0 0 0;font-size:12px;color:#374151;">${esc(r.reasons.join(' · '))}</p>` : ''}
        </div>`;
    };

    const body = `
      <div class="st-soft" style="padding:16px 18px;border-radius:12px;background-color:#fff7ed;border:1px solid #fed7aa;">
        <p class="st-text" style="margin:0;font-size:14px;color:#9a3412;line-height:1.6;">
          <strong>${sorted.length}</strong> team member${sorted.length === 1 ? '' : 's'}${highCount ? ` (${highCount} high-risk)` : ''} showed overwork patterns over the last ${windowDays} days. This is a wellbeing signal — a prompt to check in, not a performance flag.
        </p>
      </div>
      <h2 class="st-text" style="margin:22px 0 12px 0;font-size:17px;color:#111827;font-weight:700;">Burnout Radar</h2>
      ${sorted.map(card).join('')}
    `;

    const htmlContent = this.wrapEmail({
      title: 'Wellbeing — Burnout Radar',
      eyebrow: 'ScreenTime · Wellbeing',
      heading: '🫀 Burnout Radar',
      subheading: `${sorted.length} team member${sorted.length === 1 ? '' : 's'} may be overextending`,
      preheader: `${sorted.length} employee(s) trending toward burnout over the last ${windowDays} days.`,
      accent: '#ea580c',
      body,
      footerNote: 'Wellbeing insight from ScreenTime — please use it to support your team.',
    });

    try {
      const info = await this.transporter!.sendMail({
        from: `"Team Monitoring System" <${process.env.SMTP_EMAIL}>`,
        to: recipients.join(', '),
        subject: `🫀 ScreenTime Wellbeing — ${sorted.length} at-risk of burnout`,
        html: htmlContent,
      });
      logger.info(`✅ Burnout alert sent. Message ID: ${info.messageId}`);
    } catch (error) {
      logger.error('❌ Failed to send burnout alert:', error);
      throw new Error('Failed to send burnout alert. Please check SMTP configuration.');
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

    const body = `
      <div class="st-soft" style="padding:18px 20px;border-radius:12px;background-color:#ecfdf5;border:1px solid #bbf7d0;">
        <p style="margin:0;color:#047857;font-size:16px;font-weight:700;">✅ Your email configuration is working correctly.</p>
      </div>
      <p class="st-muted" style="margin:16px 0 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
        This is a test message from the ScreenTime monitoring system. Reports and
        alerts will be delivered to this address. This email adapts to both light
        and dark mode — if your mail client is in dark mode, it should look at home there too.
      </p>
    `;

    const htmlContent = this.wrapEmail({
      title: 'Email Configuration Test',
      eyebrow: 'ScreenTime · Test',
      heading: '✅ Email Configuration Test',
      subheading: 'Delivery check',
      preheader: 'Your ScreenTime email configuration is working correctly.',
      accent: '#059669',
      body,
      footerNote: 'Automated test message from the ScreenTime monitoring system.',
    });

    try {
      const info = await this.transporter.sendMail({
        from: `"Team Monitoring System" <${process.env.SMTP_EMAIL}>`,
        to: recipient,
        subject: '✅ Email Configuration Test - ScreenTime',
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
