/**
 * Business timezone used for all wall-clock display. Server timestamps are UTC
 * instants; formatting them in a fixed zone (IST) keeps the dashboard consistent
 * regardless of the viewer's browser locale. Override via VITE_APP_TIMEZONE.
 */
export const APP_TZ: string =
  (import.meta as any).env?.VITE_APP_TIMEZONE || 'Asia/Kolkata'

/** h:MM AM/PM for an instant, rendered in the business timezone. */
export function formatClock(date: string | Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: APP_TZ,
  })
}

/** Formats an hour-of-day number (0-23) as a compact 12-hour label, e.g. "9 AM", "6 PM". */
export function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const period = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display} ${period}`
}

/**
 * Wall-clock components of an instant in the business timezone. Used to place
 * activity segments on a timeline axis without depending on the viewer's zone.
 */
export function zonedClockParts(date: string | Date): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: APP_TZ,
  }).formatToParts(new Date(date))
  const map: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10)
  // Intl renders midnight as hour 24 with hour12:false; normalize to 0.
  const hour = (map.hour ?? 0) % 24
  return { hour, minute: map.minute ?? 0, second: map.second ?? 0 }
}

/** Fractional hours-since-midnight of an instant in the business timezone. */
export function zonedHoursSinceMidnight(date: string | Date): number {
  const { hour, minute, second } = zonedClockParts(date)
  return hour + minute / 60 + second / 3600
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

export function formatWorkTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${minutes}m`
}

/**
 * Duration display. Standardized to the "00h 00m 00s" padded format app-wide
 * (previously rendered as HH:MM:SS / MM:SS, which was ambiguous).
 */
export function formatTime(seconds: number): string {
  return formatHMSPadded(seconds)
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: APP_TZ,
  })
}

/**
 * Formats a duration in seconds as "0h 0m 0s" (omitting leading zero units for
 * readability while always keeping it unambiguous). Used wherever we previously
 * showed a bare "HH:MM:SS".
 */
export function formatHMS(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

/** Always-padded variant "00h 00m 00s" for tables/ledgers that want alignment. */
export function formatHMSPadded(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(h)}h ${p(m)}m ${p(sec)}s`
}

export function formatTimeIntelligent(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return `${seconds}s`
}

/**
 * Get today's date in local timezone as YYYY-MM-DD format
 * This avoids timezone issues with Date.toISOString()
 */
export function getTodayLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format a Date object to YYYY-MM-DD in local timezone
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Add (or subtract) whole days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDaysStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)
  date.setDate(date.getDate() + delta)
  return formatLocalDate(date)
}

/**
 * Inclusive day count between two YYYY-MM-DD strings (min 1). e.g. same day → 1,
 * consecutive days → 2. Used to translate a from–to range into a "days" window
 * for endpoints that are parameterized by day count rather than by date range.
 */
export function daysBetweenStr(startDate: string, endDate: string): number {
  const [ys, ms, ds] = startDate.split('-').map(Number)
  const [ye, me, de] = endDate.split('-').map(Number)
  const start = new Date(ys, (ms || 1) - 1, ds || 1)
  const end = new Date(ye, (me || 1) - 1, de || 1)
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000)
  return Math.max(1, diff + 1)
}
