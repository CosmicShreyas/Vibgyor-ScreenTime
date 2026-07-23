import { Employee, ActivityLog } from '../database/schemas';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  startOfDay as tzStartOfDay,
  endOfDay as tzEndOfDay,
  toDateStr,
  addDaysStr,
  dayAtHour,
  weekdayOf,
} from '../utils/timezone';
import { computeProductivity } from '../utils/productivity';

/**
 * Analytics service: attendance, productivity trends, focus time, and
 * AI-style natural-language insights. All day/shift boundaries are computed in
 * the business timezone (see utils/timezone).
 */

const FOCUS_BLOCK_MIN_MINUTES = 25; // minimum uninterrupted work to count as a focus block

export interface AttendanceDay {
  date: string; // YYYY-MM-DD
  present: boolean;
  first_activity: Date | null;
  last_activity: Date | null;
  work_seconds: number;
  idle_seconds: number;
  late: boolean; // first activity after shift start (+ grace)
  early_departure: boolean; // last activity before shift end (- grace)
  hours_worked: number; // work + idle, in hours
}

export interface AttendanceSummary {
  employee_name: string;
  shift_start_hour: number;
  shift_end_hour: number;
  days_present: number;
  days_absent: number;
  late_count: number;
  early_departure_count: number;
  avg_hours_worked: number;
  days: AttendanceDay[];
}

export class AnalyticsService {
  /**
   * Per-day attendance for one employee over a date range (inclusive),
   * relative to the configured shift window. Sundays are treated as non-working.
   */
  async getAttendance(name: string, startDateStr: string, endDateStr: string): Promise<AttendanceSummary | null> {
    const employee = await Employee.findOne({ name: name.trim() });
    if (!employee) return null;

    const rangeStart = tzStartOfDay(startDateStr);
    const rangeEnd = tzEndOfDay(endDateStr);

    const logs = await ActivityLog.find({
      employeeId: employee._id,
      timestamp: { $gte: rangeStart, $lte: rangeEnd },
    })
      .sort({ intervalStart: 1 })
      .lean();

    // Group logs by business-timezone day.
    const byDay = new Map<string, typeof logs>();
    for (const log of logs) {
      const key = toDateStr(new Date(log.timestamp));
      const arr = byDay.get(key) || [];
      arr.push(log);
      byDay.set(key, arr);
    }

    const GRACE_MINUTES = 15;
    const shiftStartGrace = config.shiftStartHour + GRACE_MINUTES / 60;
    const shiftEndGrace = config.shiftEndHour - GRACE_MINUTES / 60;

    const days: AttendanceDay[] = [];
    let cursor = startDateStr;
    // Iterate calendar days from start to end inclusive.
    for (let guard = 0; guard < 400; guard++) {
      const dayLogs = byDay.get(cursor) || [];
      const isSunday = weekdayOf(cursor) === 0;
      const present = dayLogs.length > 0;

      let firstActivity: Date | null = null;
      let lastActivity: Date | null = null;
      let work = 0;
      let idle = 0;

      if (present) {
        firstActivity = new Date(dayLogs[0].intervalStart);
        lastActivity = new Date(dayLogs[dayLogs.length - 1].intervalEnd);
        for (const l of dayLogs) {
          work += l.workSeconds;
          idle += l.idleSeconds;
        }
      }

      // Late / early-departure only meaningful on working days when present.
      let late = false;
      let earlyDeparture = false;
      if (present && !isSunday && firstActivity && lastActivity) {
        const firstHour = this.hoursSinceMidnight(firstActivity);
        const lastHour = this.hoursSinceMidnight(lastActivity);
        late = firstHour > shiftStartGrace;
        earlyDeparture = lastHour < shiftEndGrace;
      }

      days.push({
        date: cursor,
        present,
        first_activity: firstActivity,
        last_activity: lastActivity,
        work_seconds: work,
        idle_seconds: idle,
        late,
        early_departure: earlyDeparture,
        hours_worked: (work + idle) / 3600,
      });

      if (cursor === endDateStr) break;
      cursor = addDaysStr(cursor, 1);
    }

    const workingDays = days.filter((d) => weekdayOf(d.date) !== 0);
    const presentDays = days.filter((d) => d.present);
    const avgHours =
      presentDays.length > 0
        ? presentDays.reduce((s, d) => s + d.hours_worked, 0) / presentDays.length
        : 0;

    return {
      employee_name: employee.name,
      shift_start_hour: config.shiftStartHour,
      shift_end_hour: config.shiftEndHour,
      days_present: presentDays.length,
      days_absent: workingDays.filter((d) => !d.present).length,
      late_count: days.filter((d) => d.late).length,
      early_departure_count: days.filter((d) => d.early_departure).length,
      avg_hours_worked: avgHours,
      days,
    };
  }

  /**
   * Daily productivity trend for one employee (or the whole team if name omitted)
   * over the last `days` days.
   */
  async getProductivityTrend(days: number, name?: string, endDateStr?: string): Promise<Array<{
    date: string;
    productivity_score: number;
    work_seconds: number;
    idle_seconds: number;
    productive_seconds: number;
    unproductive_seconds: number;
  }>> {
    // The trend spans `days` ending on `endDateStr` (defaults to today). Passing
    // an explicit end lets a from–to range that doesn't end today drive it.
    const endStr = endDateStr || toDateStr(new Date());
    const employeeFilter = name ? await Employee.findOne({ name: name.trim() }) : null;
    if (name && !employeeFilter) return [];

    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStr = addDaysStr(endStr, -i);
      const start = tzStartOfDay(dayStr);
      const end = tzEndOfDay(dayStr);

      const query: any = { timestamp: { $gte: start, $lte: end } };
      if (employeeFilter) query.employeeId = employeeFilter._id;

      const logs = await ActivityLog.find(query).lean();

      let work = 0;
      let idle = 0;
      const apps: Array<{ name: string; duration: number }> = [];
      const tabs: Array<{ title?: string; url?: string; duration: number }> = [];
      for (const l of logs) {
        work += l.workSeconds;
        idle += l.idleSeconds;
        for (const a of l.applications) apps.push({ name: a.name, duration: a.duration || 0 });
        for (const t of l.browserTabs) tabs.push({ title: t.title, url: t.url, duration: t.duration || 0 });
      }
      const { score, categorySeconds } = computeProductivity(apps, tabs);

      result.push({
        date: dayStr,
        productivity_score: score,
        work_seconds: work,
        idle_seconds: idle,
        productive_seconds: categorySeconds.productive,
        unproductive_seconds: categorySeconds.unproductive,
      });
    }
    return result;
  }

  /**
   * Focus blocks for one employee on a given day: uninterrupted stretches of
   * work of at least FOCUS_BLOCK_MIN_MINUTES, derived from consecutive logs with
   * work activity and small inter-log gaps.
   */
  async getFocusBlocks(name: string, dateStr: string): Promise<{
    employee_name: string;
    date: string;
    focus_minutes: number;
    longest_block_minutes: number;
    blocks: Array<{ start: Date; end: Date; minutes: number }>;
  } | null> {
    const employee = await Employee.findOne({ name: name.trim() });
    if (!employee) return null;

    const start = tzStartOfDay(dateStr);
    const end = tzEndOfDay(dateStr);
    const logs = await ActivityLog.find({
      employeeId: employee._id,
      timestamp: { $gte: start, $lte: end },
    })
      .sort({ intervalStart: 1 })
      .lean();

    const blocks: Array<{ start: Date; end: Date; minutes: number }> = [];
    let blockStart: Date | null = null;
    let blockEnd: Date | null = null;
    const MAX_GAP_MS = 3 * 60 * 1000; // gaps > 3 min break the focus block

    for (const l of logs) {
      const s = new Date(l.intervalStart);
      const workEnd = new Date(s.getTime() + l.workSeconds * 1000);
      const hasWork = l.workSeconds > 0;

      if (!hasWork) {
        // Idle/interruption ends the current block.
        if (blockStart && blockEnd) blocks.push(this.finalizeBlock(blockStart, blockEnd));
        blockStart = null;
        blockEnd = null;
        continue;
      }

      if (blockStart && blockEnd && s.getTime() - blockEnd.getTime() <= MAX_GAP_MS) {
        blockEnd = workEnd; // extend
      } else {
        if (blockStart && blockEnd) blocks.push(this.finalizeBlock(blockStart, blockEnd));
        blockStart = s;
        blockEnd = workEnd;
      }
    }
    if (blockStart && blockEnd) blocks.push(this.finalizeBlock(blockStart, blockEnd));

    const focusBlocks = blocks.filter((b) => b.minutes >= FOCUS_BLOCK_MIN_MINUTES);
    const focusMinutes = focusBlocks.reduce((s, b) => s + b.minutes, 0);
    const longest = focusBlocks.reduce((m, b) => Math.max(m, b.minutes), 0);

    return {
      employee_name: employee.name,
      date: dateStr,
      focus_minutes: Math.round(focusMinutes),
      longest_block_minutes: Math.round(longest),
      blocks: focusBlocks,
    };
  }

  /**
   * Team overview for a single day: per-employee productivity + top/bottom
   * performers and most-focused employee.
   */
  async getTeamOverview(startDateStr?: string, endDateStr?: string, employeeName?: string): Promise<any> {
    const startDay = startDateStr || toDateStr(new Date());
    const endDay = endDateStr || startDay;
    const start = tzStartOfDay(startDay);
    const end = tzEndOfDay(endDay);

    const employees = await Employee.find().lean();
    const visibleEmployees = employees.filter((employee) =>
      !/^[a-f0-9]{24}$/i.test(employee.name) &&
      (!employeeName || employee.name.toLocaleLowerCase() === employeeName.trim().toLocaleLowerCase())
    );
    const logs = await ActivityLog.find({
      employeeId: { $in: visibleEmployees.map((employee) => employee._id) },
      timestamp: { $gte: start, $lte: end },
    })
      .select('employeeId timestamp workSeconds idleSeconds applications browserTabs')
      .lean();
    const logsByEmployee = new Map<string, typeof logs>();
    for (const log of logs) {
      const key = log.employeeId.toString();
      const bucket = logsByEmployee.get(key);
      if (bucket) bucket.push(log);
      else logsByEmployee.set(key, [log]);
    }
    const rows = [];
    const daily = new Map<string, { date: string; present: Set<string>; work_seconds: number; idle_seconds: number }>();
    for (let cursor = startDay, guard = 0; guard < 400; guard++) {
      daily.set(cursor, { date: cursor, present: new Set(), work_seconds: 0, idle_seconds: 0 });
      if (cursor === endDay) break;
      cursor = addDaysStr(cursor, 1);
    }

    for (const employee of visibleEmployees) {
      const employeeLogs = logsByEmployee.get(employee._id.toString()) ?? [];

      if (employeeLogs.length === 0) {
        rows.push({
          employee_name: employee.name,
          present: false,
          productivity_score: 0,
          work_seconds: 0,
          idle_seconds: 0,
        });
        continue;
      }

      let work = 0;
      let idle = 0;
      const apps: Array<{ name: string; duration: number }> = [];
      const tabs: Array<{ title?: string; url?: string; duration: number }> = [];
      for (const l of employeeLogs) {
        work += l.workSeconds;
        idle += l.idleSeconds;
        const dayRow = daily.get(toDateStr(new Date(l.timestamp)));
        if (dayRow) {
          dayRow.present.add(employee.name);
          dayRow.work_seconds += l.workSeconds;
          dayRow.idle_seconds += l.idleSeconds;
        }
        for (const a of l.applications) apps.push({ name: a.name, duration: a.duration || 0 });
        for (const t of l.browserTabs) tabs.push({ title: t.title, url: t.url, duration: t.duration || 0 });
      }
      const { score } = computeProductivity(apps, tabs);
      rows.push({
        employee_name: employee.name,
        present: true,
        productivity_score: score,
        work_seconds: work,
        idle_seconds: idle,
      });
    }

    const present = rows.filter((r) => r.present);
    const sortedByScore = [...present].sort((a, b) => b.productivity_score - a.productivity_score);
    const avgScore =
      present.length > 0 ? Math.round(present.reduce((s, r) => s + r.productivity_score, 0) / present.length) : 0;

    return {
      date: startDay === endDay ? startDay : `${startDay} to ${endDay}`,
      start_date: startDay,
      end_date: endDay,
      total_employees: rows.length,
      present_count: present.length,
      total_work_seconds: rows.reduce((sum, row) => sum + row.work_seconds, 0),
      total_idle_seconds: rows.reduce((sum, row) => sum + row.idle_seconds, 0),
      average_productivity: avgScore,
      top_performer: sortedByScore[0] || null,
      needs_attention: sortedByScore.length > 1 ? sortedByScore[sortedByScore.length - 1] : null,
      employees: rows,
      days: Array.from(daily.values()).map((row) => ({
        date: row.date,
        present_count: row.present.size,
        work_seconds: row.work_seconds,
        idle_seconds: row.idle_seconds,
      })),
    };
  }

  /**
   * Natural-language insights ("AI insights") for a day, derived from real data.
   * Deterministic, template-based — no external LLM dependency.
   */
  async getInsights(dateStr?: string, endDateStr?: string, employeeName?: string): Promise<string[]> {
    const overview = await this.getTeamOverview(dateStr, endDateStr, employeeName);
    const insights: string[] = [];

    if (overview.present_count === 0) {
      insights.push(employeeName
        ? `No activity was recorded for ${employeeName} in the selected period.`
        : 'No employee activity was recorded for this period.');
      return insights;
    }

    if (employeeName) {
      const employee = overview.employees[0];
      insights.push(
        `${employee.employee_name} recorded ${employee.productivity_score}% productivity with ${this.hm(employee.work_seconds)} of tracked work.`
      );
      if (employee.idle_seconds > employee.work_seconds) {
        insights.push(
          `Idle time (${this.hm(employee.idle_seconds)}) exceeded tracked work time in the selected period.`
        );
      }
      return insights;
    }

    insights.push(
      `${overview.present_count} of ${overview.total_employees} employees were active, with an average productivity score of ${overview.average_productivity}%.`
    );

    if (overview.top_performer) {
      insights.push(
        `Top performer: ${overview.top_performer.employee_name} at ${overview.top_performer.productivity_score}% productivity (${this.hm(overview.top_performer.work_seconds)} of tracked work).`
      );
    }

    if (overview.needs_attention && overview.needs_attention.productivity_score < 50) {
      insights.push(
        `${overview.needs_attention.employee_name} may need support — productivity was ${overview.needs_attention.productivity_score}%, with ${this.hm(overview.needs_attention.idle_seconds)} idle.`
      );
    }

    const highIdle = overview.employees
      .filter((e: any) => e.present && e.idle_seconds > e.work_seconds && e.idle_seconds > 3600)
      .map((e: any) => e.employee_name);
    if (highIdle.length > 0) {
      insights.push(
        `High idle time flagged for: ${highIdle.slice(0, 5).join(', ')}${highIdle.length > 5 ? ` and ${highIdle.length - 5} more` : ''}.`
      );
    }

    return insights;
  }

  private finalizeBlock(start: Date, end: Date) {
    return { start, end, minutes: (end.getTime() - start.getTime()) / 60000 };
  }

  private hoursSinceMidnight(d: Date): number {
    // Reuse the shift/day helper: hours from that day's midnight in business TZ.
    const dayStr = toDateStr(d);
    const midnight = dayAtHour(dayStr, 0);
    return (d.getTime() - midnight.getTime()) / 3600000;
  }

  private hm(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}

export const analyticsService = new AnalyticsService();
