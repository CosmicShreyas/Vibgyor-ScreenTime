/**
 * Timezone-aware date helpers.
 *
 * Clients report timestamps as UTC instants. All business reporting
 * ("today", shift windows, first/last activity, EOD day) must be relative to
 * a fixed business timezone (IST by default) rather than the server process's
 * local timezone, which is undefined in production. These helpers use the
 * built-in Intl API so no extra dependency is required.
 */
import { config } from '../config';

const APP_TZ = config.appTimezone;

/**
 * Returns the offset (in minutes) of the given instant from UTC in `timeZone`.
 * Positive means ahead of UTC (e.g. IST = +330).
 */
export function getTimezoneOffsetMinutes(date: Date, timeZone: string = APP_TZ): number {
  // Format the instant as wall-clock components in the target zone, then
  // interpret those components as if they were UTC to recover the offset.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10);
  }

  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Wall-clock Y/M/D/H/M/S of an instant in the business timezone. */
export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday ... 6 = Saturday
}

export function getZonedParts(date: Date, timeZone: string = APP_TZ): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const weekdays: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    weekday: weekdays[map.weekday] ?? new Date(date).getUTCDay(),
  };
}

/**
 * Converts a wall-clock time in the business timezone to the corresponding
 * UTC instant. Handles DST by resolving the offset at the target time.
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
  timeZone: string = APP_TZ
): Date {
  // First guess: treat the wall-clock as UTC.
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  // Offset at that guess, then correct.
  const offset = getTimezoneOffsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offset * 60000);
}

/** Parses a `YYYY-MM-DD` (or ISO) string into that calendar day's parts. */
function parseDateOnly(dateStr: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) {
    return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
  }
  // Fallback: interpret in the business timezone.
  const p = getZonedParts(new Date(dateStr));
  return { year: p.year, month: p.month, day: p.day };
}

/**
 * Start of the given calendar day (00:00:00.000) in the business timezone,
 * returned as a UTC instant. `dateStr` may be `YYYY-MM-DD`; omit for "today".
 */
export function startOfDay(dateStr?: string, timeZone: string = APP_TZ): Date {
  const { year, month, day } = dateStr
    ? parseDateOnly(dateStr)
    : (() => {
        const p = getZonedParts(new Date(), timeZone);
        return { year: p.year, month: p.month, day: p.day };
      })();
  return zonedTimeToUtc(year, month, day, 0, 0, 0, 0, timeZone);
}

/**
 * End of the given calendar day (23:59:59.999) in the business timezone,
 * returned as a UTC instant.
 */
export function endOfDay(dateStr?: string, timeZone: string = APP_TZ): Date {
  const { year, month, day } = dateStr
    ? parseDateOnly(dateStr)
    : (() => {
        const p = getZonedParts(new Date(), timeZone);
        return { year: p.year, month: p.month, day: p.day };
      })();
  return zonedTimeToUtc(year, month, day, 23, 59, 59, 999, timeZone);
}

/**
 * A specific hour boundary (e.g. shift start) on the given calendar day in the
 * business timezone, as a UTC instant.
 */
export function dayAtHour(dateStr: string | undefined, hour: number, timeZone: string = APP_TZ): Date {
  const { year, month, day } = dateStr
    ? parseDateOnly(dateStr)
    : (() => {
        const p = getZonedParts(new Date(), timeZone);
        return { year: p.year, month: p.month, day: p.day };
      })();
  return zonedTimeToUtc(year, month, day, hour, 0, 0, 0, timeZone);
}

/** `YYYY-MM-DD` for the given instant in the business timezone. */
export function toDateStr(date: Date, timeZone: string = APP_TZ): string {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** True if the two instants fall on the same calendar day in the business timezone. */
export function isSameZonedDay(a: Date, b: Date, timeZone: string = APP_TZ): boolean {
  return toDateStr(a, timeZone) === toDateStr(b, timeZone);
}

/** Adds `n` calendar days to a `YYYY-MM-DD` string (returns `YYYY-MM-DD`). */
export function addDaysStr(dateStr: string, n: number): string {
  const { year, month, day } = parseDateOnly(dateStr);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** The weekday (0=Sun..6=Sat) for a `YYYY-MM-DD` string (timezone-agnostic). */
export function weekdayOf(dateStr: string): number {
  const { year, month, day } = parseDateOnly(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
