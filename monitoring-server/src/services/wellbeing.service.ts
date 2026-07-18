import { Employee, ActivityLog } from '../database/schemas';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  startOfDay as tzStartOfDay,
  endOfDay as tzEndOfDay,
  toDateStr,
  addDaysStr,
  getZonedParts,
} from '../utils/timezone';
import { computeProductivity } from '../utils/productivity';

/**
 * Wellbeing & advanced-insight service.
 *
 * Powers four features that go beyond typical monitoring tools, framed to help
 * people work sustainably rather than purely to surveil:
 *  - Focus & Flow: deep-work blocks vs context-switching.
 *  - Burnout radar: after-hours work, no-break streaks, overwork, weekend work.
 *  - Anomaly detection: per-employee deviations from their own 14-day baseline.
 *  - Team pulse: privacy-respecting percentile comparison to the team.
 *
 * All day boundaries use the business timezone (utils/timezone).
 */

const FOCUS_MIN_MINUTES = 15;      // min uninterrupted work to count as a focus block
const FOCUS_GAP_MS = 3 * 60 * 1000; // gap that breaks a focus block

interface DayAgg {
  date: string;
  workSeconds: number;
  idleSeconds: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
  afterHoursSeconds: number; // work outside shift window
  weekend: boolean;
  focusMinutes: number;
  contextSwitches: number;
  longestFocusMin: number;
  productivity: number;
}

export class WellbeingService {
  /** Aggregate one employee's activity for a single day (business tz). */
  private async aggregateDay(employeeId: any, dateStr: string): Promise<DayAgg> {
    const start = tzStartOfDay(dateStr);
    const end = tzEndOfDay(dateStr);
    const logs = await ActivityLog.find({
      employeeId,
      timestamp: { $gte: start, $lte: end },
    })
      .sort({ intervalStart: 1 })
      .lean();

    const wd = getZonedParts(start).weekday;
    const agg: DayAgg = {
      date: dateStr,
      workSeconds: 0,
      idleSeconds: 0,
      firstActivity: null,
      lastActivity: null,
      afterHoursSeconds: 0,
      weekend: wd === 0 || wd === 6,
      focusMinutes: 0,
      contextSwitches: 0,
      longestFocusMin: 0,
      productivity: 0,
    };
    if (logs.length === 0) return agg;

    const apps: Array<{ name: string; duration: number }> = [];
    const tabs: Array<{ title?: string; url?: string; duration: number }> = [];

    // Focus-block detection + context switches from consecutive work logs.
    let blockStart: Date | null = null;
    let blockEnd: Date | null = null;
    let lastApp: string | null = null;

    const pushBlock = () => {
      if (blockStart && blockEnd) {
        const min = (blockEnd.getTime() - blockStart.getTime()) / 60000;
        if (min >= FOCUS_MIN_MINUTES) {
          agg.focusMinutes += min;
          agg.longestFocusMin = Math.max(agg.longestFocusMin, min);
        }
      }
      blockStart = null;
      blockEnd = null;
    };

    for (const l of logs as any[]) {
      agg.workSeconds += l.workSeconds;
      agg.idleSeconds += l.idleSeconds;
      for (const a of l.applications || []) apps.push({ name: a.name, duration: a.duration || 0 });
      for (const t of l.browserTabs || []) tabs.push({ title: t.title, url: t.url, duration: t.duration || 0 });

      const s = new Date(l.intervalStart);
      const e = new Date(l.intervalEnd);
      if (!agg.firstActivity || s < agg.firstActivity) agg.firstActivity = s;
      if (!agg.lastActivity || e > agg.lastActivity) agg.lastActivity = e;

      // After-hours work: portion of this interval outside the shift window.
      const startHour = getZonedParts(s).hour + getZonedParts(s).minute / 60;
      if (l.workSeconds > 0 && (startHour < config.shiftStartHour || startHour >= config.shiftEndHour)) {
        agg.afterHoursSeconds += l.workSeconds;
      }

      // Context switches: dominant app changed between logs.
      const topApp = (l.applications || []).slice().sort((a: any, b: any) => (b.duration || 0) - (a.duration || 0))[0]?.name || null;
      if (topApp && lastApp && topApp !== lastApp) agg.contextSwitches += 1;
      if (topApp) lastApp = topApp;

      // Focus blocks: extend while consecutive work logs are close together.
      if (l.workSeconds > 0) {
        const workEnd = new Date(s.getTime() + l.workSeconds * 1000);
        if (blockStart && blockEnd && s.getTime() - blockEnd.getTime() <= FOCUS_GAP_MS) {
          blockEnd = workEnd;
        } else {
          pushBlock();
          blockStart = s;
          blockEnd = workEnd;
        }
      } else {
        pushBlock();
      }
    }
    pushBlock();

    agg.focusMinutes = Math.round(agg.focusMinutes);
    agg.longestFocusMin = Math.round(agg.longestFocusMin);
    agg.productivity = computeProductivity(apps, tabs).score;
    return agg;
  }

  /** Focus & flow metrics for an employee over the last `days` days. */
  async getFocus(name: string, days = 7, endDateStr?: string): Promise<any | null> {
    const employee = await Employee.findOne({ name: name.trim() }).lean();
    if (!employee) return null;
    const today = endDateStr || toDateStr(new Date());

    const perDay = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = addDaysStr(today, -i);
      const agg = await this.aggregateDay(employee._id, d);
      perDay.push({
        date: d,
        focus_minutes: agg.focusMinutes,
        longest_focus_minutes: agg.longestFocusMin,
        context_switches: agg.contextSwitches,
        work_minutes: Math.round(agg.workSeconds / 60),
        productivity: agg.productivity,
      });
    }

    const active = perDay.filter((d) => d.work_minutes > 0);
    const avgFocus = active.length ? Math.round(active.reduce((s, d) => s + d.focus_minutes, 0) / active.length) : 0;
    const avgSwitches = active.length ? Math.round(active.reduce((s, d) => s + d.context_switches, 0) / active.length) : 0;
    const bestDay = perDay.reduce((m, d) => (d.focus_minutes > (m?.focus_minutes ?? -1) ? d : m), perDay[0]);

    // Flow score: rewards long focus blocks, penalizes heavy context switching.
    const todayAgg = perDay[perDay.length - 1];
    const flowScore = Math.max(
      0,
      Math.min(100, Math.round(todayAgg.focus_minutes * 0.6 - todayAgg.context_switches * 1.5 + todayAgg.longest_focus_minutes * 0.4))
    );

    return {
      employee_name: employee.name,
      flow_score: flowScore,
      avg_focus_minutes: avgFocus,
      avg_context_switches: avgSwitches,
      best_focus_day: bestDay?.date ?? null,
      best_focus_minutes: bestDay?.focus_minutes ?? 0,
      days: perDay,
    };
  }

  /**
   * Burnout radar for the whole team: flags employees showing overwork/no-break
   * patterns over the last `days` days. Wellbeing-oriented, not punitive.
   */
  async getBurnoutRadar(days = 7, endDateStr?: string): Promise<any> {
    const employees = await Employee.find().lean();
    const today = endDateStr || toDateStr(new Date());
    const rows = [];

    for (const employee of employees) {
      if (/^[a-f0-9]{24}$/i.test(employee.name)) continue;

      let totalWork = 0;
      let afterHours = 0;
      let weekendWork = 0;
      let longestNoBreakMin = 0;
      let activeDays = 0;

      for (let i = days - 1; i >= 0; i--) {
        const d = addDaysStr(today, -i);
        const agg = await this.aggregateDay(employee._id, d);
        if (agg.workSeconds + agg.idleSeconds === 0) continue;
        activeDays++;
        totalWork += agg.workSeconds;
        afterHours += agg.afterHoursSeconds;
        if (agg.weekend) weekendWork += agg.workSeconds;
        // Longest continuous work (focus block proxy) = no-break streak.
        longestNoBreakMin = Math.max(longestNoBreakMin, agg.longestFocusMin);
      }

      const avgDailyHours = activeDays ? totalWork / 3600 / activeDays : 0;

      // Risk signals (each contributes to a 0-100 risk score).
      let risk = 0;
      const reasons: string[] = [];
      if (avgDailyHours > 9) { risk += 30; reasons.push(`Averaging ${avgDailyHours.toFixed(1)}h/day`); }
      else if (avgDailyHours > 8) { risk += 15; reasons.push(`Long days (${avgDailyHours.toFixed(1)}h avg)`); }
      if (afterHours / 3600 > 5) { risk += 25; reasons.push(`${(afterHours / 3600).toFixed(1)}h after-hours work`); }
      else if (afterHours / 3600 > 2) { risk += 12; reasons.push(`Some after-hours work`); }
      if (weekendWork / 3600 > 2) { risk += 20; reasons.push(`${(weekendWork / 3600).toFixed(1)}h weekend work`); }
      if (longestNoBreakMin > 180) { risk += 25; reasons.push(`${Math.round(longestNoBreakMin)}m without a break`); }
      else if (longestNoBreakMin > 120) { risk += 12; reasons.push(`Few breaks`); }
      risk = Math.min(100, risk);

      const level = risk >= 60 ? 'high' : risk >= 30 ? 'moderate' : 'low';

      rows.push({
        employee_name: employee.name,
        risk_score: risk,
        level,
        avg_daily_hours: Math.round(avgDailyHours * 10) / 10,
        after_hours_hours: Math.round((afterHours / 3600) * 10) / 10,
        weekend_hours: Math.round((weekendWork / 3600) * 10) / 10,
        longest_no_break_minutes: Math.round(longestNoBreakMin),
        reasons,
      });
    }

    rows.sort((a, b) => b.risk_score - a.risk_score);
    return {
      window_days: days,
      at_risk: rows.filter((r) => r.level !== 'low').length,
      employees: rows,
    };
  }

  /**
   * Anomaly detection: compares each employee's TODAY to their own trailing
   * baseline (previous `baselineDays` days) and surfaces meaningful deviations.
   */
  async getAnomalies(baselineDays = 14): Promise<any> {
    const employees = await Employee.find().lean();
    const today = toDateStr(new Date());
    const anomalies: any[] = [];

    for (const employee of employees) {
      if (/^[a-f0-9]{24}$/i.test(employee.name)) continue;

      const todayAgg = await this.aggregateDay(employee._id, today);
      // Skip if no activity today — nothing to compare.
      if (todayAgg.workSeconds + todayAgg.idleSeconds === 0) continue;

      // Baseline averages.
      let baseWork = 0;
      let baseProd = 0;
      let baseFirstHour = 0;
      let baseDays = 0;
      for (let i = 1; i <= baselineDays; i++) {
        const d = addDaysStr(today, -i);
        const agg = await this.aggregateDay(employee._id, d);
        if (agg.workSeconds + agg.idleSeconds === 0) continue;
        baseDays++;
        baseWork += agg.workSeconds;
        baseProd += agg.productivity;
        if (agg.firstActivity) baseFirstHour += getZonedParts(agg.firstActivity).hour + getZonedParts(agg.firstActivity).minute / 60;
      }
      if (baseDays < 3) continue; // not enough history to judge

      const avgWork = baseWork / baseDays;
      const avgProd = baseProd / baseDays;
      const avgFirstHour = baseFirstHour / baseDays;

      // Productivity drop.
      if (avgProd > 0 && todayAgg.productivity < avgProd - 25) {
        anomalies.push(this.anom(employee.name, 'productivity_drop', 'warning',
          `Productivity ${todayAgg.productivity}% vs ${Math.round(avgProd)}% baseline`));
      }
      // Work volume spike/dip.
      if (avgWork > 600) {
        const ratio = todayAgg.workSeconds / avgWork;
        if (ratio > 1.6) anomalies.push(this.anom(employee.name, 'activity_spike', 'info',
          `${Math.round((todayAgg.workSeconds / 3600) * 10) / 10}h today vs ${Math.round((avgWork / 3600) * 10) / 10}h avg`));
        else if (ratio < 0.4) anomalies.push(this.anom(employee.name, 'activity_dip', 'info',
          `Only ${Math.round((todayAgg.workSeconds / 3600) * 10) / 10}h today vs ${Math.round((avgWork / 3600) * 10) / 10}h avg`));
      }
      // Unusual start time (>2h earlier/later than baseline).
      if (todayAgg.firstActivity) {
        const firstHour = getZonedParts(todayAgg.firstActivity).hour + getZonedParts(todayAgg.firstActivity).minute / 60;
        if (Math.abs(firstHour - avgFirstHour) > 2) {
          anomalies.push(this.anom(employee.name, 'odd_hours', 'info',
            `Started at an unusual hour vs their norm`));
        }
      }
    }

    // Rank: warning before info.
    const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    anomalies.sort((a, b) => rank[a.severity] - rank[b.severity]);
    return { baseline_days: baselineDays, count: anomalies.length, anomalies };
  }

  private anom(employee: string, type: string, severity: string, message: string) {
    return { id: `${type}:${employee}`, employee_name: employee, type, severity, message };
  }

  /**
   * Team pulse: for a chosen metric, each employee's percentile vs the team
   * (today). Privacy-respecting — surfaces standing, not raw leaderboards.
   */
  async getTeamPulse(): Promise<any> {
    const employees = await Employee.find().lean();
    const today = toDateStr(new Date());
    const rows: Array<{ name: string; work: number; focus: number; productivity: number }> = [];

    for (const employee of employees) {
      if (/^[a-f0-9]{24}$/i.test(employee.name)) continue;
      const agg = await this.aggregateDay(employee._id, today);
      if (agg.workSeconds + agg.idleSeconds === 0) continue;
      rows.push({
        name: employee.name,
        work: agg.workSeconds,
        focus: agg.focusMinutes,
        productivity: agg.productivity,
      });
    }

    const pct = (values: number[], v: number): number => {
      if (values.length <= 1) return 100;
      const below = values.filter((x) => x < v).length;
      return Math.round((below / (values.length - 1)) * 100);
    };
    const workVals = rows.map((r) => r.work);
    const focusVals = rows.map((r) => r.focus);
    const prodVals = rows.map((r) => r.productivity);
    const median = (arr: number[]) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };

    return {
      date: today,
      team_size: rows.length,
      median_work_minutes: Math.round(median(workVals) / 60),
      median_focus_minutes: Math.round(median(focusVals)),
      median_productivity: Math.round(median(prodVals)),
      employees: rows
        .map((r) => ({
          employee_name: r.name,
          work_minutes: Math.round(r.work / 60),
          focus_minutes: r.focus,
          productivity: r.productivity,
          work_percentile: pct(workVals, r.work),
          focus_percentile: pct(focusVals, r.focus),
          productivity_percentile: pct(prodVals, r.productivity),
        }))
        .sort((a, b) => b.productivity_percentile - a.productivity_percentile),
    };
  }
}

export const wellbeingService = new WellbeingService();
