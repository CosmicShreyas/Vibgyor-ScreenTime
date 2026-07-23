import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import { Employee, ActivityLog } from '../database/schemas';
import { config } from '../config';
import { startOfDay as tzStartOfDay, endOfDay as tzEndOfDay, toDateStr, dayAtHour } from '../utils/timezone';
import { computeProductivity } from '../utils/productivity';

/**
 * Alerts service: evaluates today's activity against configurable thresholds and
 * surfaces alerts for the dashboard. Thresholds are stored in alerts-config.json.
 */

export interface AlertsConfig {
  enabled: boolean;
  highIdleMinutes: number; // idle time above this (today) triggers an alert
  lowProductivityScore: number; // productivity score below this triggers an alert
  offlineDuringShiftMinutes: number; // no activity for this long during shift hours
  unproductiveSiteMinutes: number; // time on unproductive apps/sites above this
  suspectedFakeMinutes: number; // suspected-fake activity above this triggers an alert
  emailAdminsOnAlert: boolean; // whether to email admins (uses dashboard-config adminEmails)
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: string;
  employee_name: string;
  type:
    | 'high_idle'
    | 'low_productivity'
    | 'offline_during_shift'
    | 'unproductive_overuse'
    | 'suspected_fake_activity'
    | 'idle_explanation'
    | 'monitoring_recovery';
  severity: AlertSeverity;
  message: string;
  value: number;
  threshold: number;
  created_at: string;
  idle_reasons?: string[];
}

const CONFIG_FILE = path.join(process.cwd(), 'alerts-config.json');
const DISMISSED_FILE = path.join(process.cwd(), 'alerts-dismissed.json');

const DEFAULT_CONFIG: AlertsConfig = {
  enabled: true,
  highIdleMinutes: 120,
  lowProductivityScore: 40,
  offlineDuringShiftMinutes: 60,
  unproductiveSiteMinutes: 60,
  suspectedFakeMinutes: 10,
  emailAdminsOnAlert: false,
};

export class AlertsService {
  private cfg: AlertsConfig | null = null;
  private dismissed: Record<string, string> | null = null;

  async getConfig(): Promise<AlertsConfig> {
    if (this.cfg) return this.cfg;
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8');
      this.cfg = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      return this.cfg!;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.cfg = { ...DEFAULT_CONFIG };
        await this.saveConfig(this.cfg);
        logger.info('🔔 Created default alerts configuration');
        return this.cfg;
      }
      logger.error('Failed to load alerts configuration:', error);
      throw error;
    }
  }

  async saveConfig(cfg: AlertsConfig): Promise<void> {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    this.cfg = cfg;
    logger.info('🔔 Alerts configuration saved');
  }

  async updateConfig(updates: Partial<AlertsConfig>): Promise<AlertsConfig> {
    const current = await this.getConfig();
    const next = { ...current, ...updates };
    await this.saveConfig(next);
    return next;
  }

  async dismiss(id: string): Promise<void> {
    const dismissed = await this.getDismissed();
    dismissed[id] = new Date().toISOString();
    await fs.writeFile(DISMISSED_FILE, JSON.stringify(dismissed, null, 2), 'utf-8');
    this.dismissed = dismissed;
  }

  private async getDismissed(): Promise<Record<string, string>> {
    if (this.dismissed) return this.dismissed;
    try {
      this.dismissed = JSON.parse(await fs.readFile(DISMISSED_FILE, 'utf-8'));
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
      this.dismissed = {};
    }
    return this.dismissed!;
  }

  /**
   * Evaluate activity against the thresholds and return the list of active
   * alerts. Evaluates a single day by default, or an inclusive date range when
   * `endDateStr` is supplied (thresholds then apply to the aggregate over the
   * whole range). The "offline during shift" check only runs when the range
   * includes today, since it is a live/point-in-time signal.
   */
  async evaluate(dateStr?: string, endDateStr?: string): Promise<Alert[]> {
    const cfg = await this.getConfig();
    if (!cfg.enabled) return [];

    const day = dateStr || toDateStr(new Date());
    const endDay = endDateStr || day;
    const isRange = endDay !== day;
    // The alert is stamped/keyed to the last day of the window.
    const stampDay = endDay;
    const start = tzStartOfDay(day);
    const end = tzEndOfDay(endDay);
    const now = new Date();
    // "today" / "in this range" wording used in the human-readable messages.
    const period = isRange ? 'in the selected range' : 'today';
    const alerts: Alert[] = [];
    const dismissed = await this.getDismissed();

    const employees = await Employee.find().lean();

    for (const employee of employees) {
      if (/^[a-f0-9]{24}$/i.test(employee.name)) continue;

      const logs = await ActivityLog.find({
        employeeId: employee._id,
        timestamp: { $gte: start, $lte: end },
      })
        .sort({ intervalStart: 1 })
        .lean();

      let work = 0;
      let idle = 0;
      let suspectedFake = 0;
      const reasonSet = new Set<string>();
      const idleReasonSet = new Set<string>();
      const apps: Array<{ name: string; duration: number }> = [];
      const tabs: Array<{ title?: string; url?: string; duration: number }> = [];
      for (const l of logs) {
        work += l.workSeconds;
        idle += l.idleSeconds;
        suspectedFake += (l as any).suspectedFakeSeconds || 0;
        for (const r of ((l as any).suspicionReasons || [])) reasonSet.add(r);
        const idleReason = String((l as any).idleReason || '').trim();
        if (idleReason) idleReasonSet.add(idleReason);
        for (const a of l.applications) apps.push({ name: a.name, duration: a.duration || 0 });
        for (const t of l.browserTabs) tabs.push({ title: t.title, url: t.url, duration: t.duration || 0 });
      }
      const { score, categorySeconds } = computeProductivity(apps, tabs);
      const activityTime = logs.length > 0
        ? new Date(logs[logs.length - 1].intervalEnd || logs[logs.length - 1].timestamp).toISOString()
        : now.toISOString();

      // Monitoring recovery/integrity: a client can report only after it has
      // recovered, so retain the most recent durable signal in the alert view.
      const recoverySignals = new Set<string>();
      let recoveryTime: string | undefined;
      for (const log of logs) {
        const tamper = (log as any).tamper;
        if (!tamper) continue;
        let hasRecoverySignal = false;
        if (tamper.processRestarted) { recoverySignals.add('client restarted unexpectedly'); hasRecoverySignal = true; }
        if (tamper.relaunchedByWatchdog) { recoverySignals.add('watchdog relaunched the client'); hasRecoverySignal = true; }
        if (tamper.watchdogRestarted) { recoverySignals.add('client replaced the watchdog'); hasRecoverySignal = true; }
        if (tamper.clockJumpDetected) { recoverySignals.add('system clock changed unexpectedly'); hasRecoverySignal = true; }
        if (tamper.autostartRestored) { recoverySignals.add('client restored its startup entry'); hasRecoverySignal = true; }
        if (hasRecoverySignal) {
          recoveryTime = new Date(log.intervalEnd || log.timestamp).toISOString();
        }
      }
      if (recoverySignals.size > 0) {
        alerts.push(this.mk(employee.name, 'monitoring_recovery', 'critical', stampDay,
          `${employee.name} sent a monitoring distress signal: ${Array.from(recoverySignals).join('; ')}.`,
          recoverySignals.size, 0, undefined, recoveryTime || activityTime));
      }

      // Suspected fake activity (auto-clicker / jiggler / macro).
      if (suspectedFake / 60 >= cfg.suspectedFakeMinutes) {
        const reasons = Array.from(reasonSet).slice(0, 3).join(', ');
        alerts.push(this.mk(employee.name, 'suspected_fake_activity', 'critical', stampDay,
          `${employee.name} showed ${this.hm(suspectedFake)} of suspected fake activity ${period}${reasons ? ` (${reasons})` : ''}.`,
          Math.round(suspectedFake / 60), cfg.suspectedFakeMinutes, undefined, activityTime));
      }

      // High idle
      if (idle / 60 >= cfg.highIdleMinutes) {
        alerts.push(this.mk(employee.name, 'high_idle', 'warning', stampDay,
          `${employee.name} has ${this.hm(idle)} of idle time ${period} (threshold ${cfg.highIdleMinutes}m).`,
          Math.round(idle / 60), cfg.highIdleMinutes, Array.from(idleReasonSet).slice(-3), activityTime));
      } else if (idleReasonSet.size > 0) {
        alerts.push(this.mk(employee.name, 'idle_explanation', 'info', stampDay,
          `${employee.name} submitted context for a period of idle time ${period}.`,
          Math.round(idle / 60), cfg.highIdleMinutes, Array.from(idleReasonSet).slice(-3), activityTime));
      }

      // Low productivity (only if they were active enough to judge)
      if (logs.length > 0 && work + idle > 1800 && score < cfg.lowProductivityScore) {
        alerts.push(this.mk(employee.name, 'low_productivity', 'warning', stampDay,
          `${employee.name}'s productivity score is ${score}% (below ${cfg.lowProductivityScore}%).`,
          score, cfg.lowProductivityScore, undefined, activityTime));
      }

      // Unproductive overuse
      if (categorySeconds.unproductive / 60 >= cfg.unproductiveSiteMinutes) {
        alerts.push(this.mk(employee.name, 'unproductive_overuse', 'warning', stampDay,
          `${employee.name} spent ${this.hm(categorySeconds.unproductive)} on unproductive apps/sites (threshold ${cfg.unproductiveSiteMinutes}m).`,
          Math.round(categorySeconds.unproductive / 60), cfg.unproductiveSiteMinutes, undefined, activityTime));
      }

      // Offline during shift: a live signal, so only evaluated when the range
      // includes today, within shift hours.
      if (endDay === toDateStr(now)) {
        const today = toDateStr(now);
        const shiftStart = dayAtHour(today, config.shiftStartHour);
        const shiftEnd = dayAtHour(today, config.shiftEndHour);
        if (now >= shiftStart && now <= shiftEnd) {
          const lastSeen = employee.lastSeen ? new Date(employee.lastSeen) : null;
          const offlineMinutes = lastSeen ? (now.getTime() - lastSeen.getTime()) / 60000 : Infinity;
          if (offlineMinutes >= cfg.offlineDuringShiftMinutes) {
            alerts.push(this.mk(employee.name, 'offline_during_shift', 'critical', today,
              `${employee.name} has been offline for ${isFinite(offlineMinutes) ? this.hm(Math.round(offlineMinutes) * 60) : 'the whole shift'} during shift hours.`,
              isFinite(offlineMinutes) ? Math.round(offlineMinutes) : 999, cfg.offlineDuringShiftMinutes, undefined, now.toISOString()));
          }
        }
      }
    }

    // Sort critical first, then by value descending.
    const rank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
    const openAlerts = alerts.filter((alert) => !dismissed[alert.id]);
    openAlerts.sort((a, b) => rank[a.severity] - rank[b.severity] || b.value - a.value);
    return openAlerts;
  }

  private mk(
    employee: string,
    type: Alert['type'],
    severity: AlertSeverity,
    day: string,
    message: string,
    value: number,
    threshold: number,
    idleReasons?: string[],
    createdAt?: string
  ): Alert {
    return {
      id: `${type}:${employee}:${day}`,
      employee_name: employee,
      type,
      severity,
      message,
      value,
      threshold,
      created_at: createdAt || new Date().toISOString(),
      ...(idleReasons?.length ? { idle_reasons: idleReasons } : {}),
    };
  }

  private hm(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}

export const alertsService = new AlertsService();
