import { formatClock } from '../utils/time'

/** Data needed to render the floating timeline hover card. */
export interface TimelineTooltipData {
  name: string
  firstActivityTime: string
  lastActivityTime: string
  productiveHours: string
  idleHours: string
  offlineHours: string
  thumbnailUrl?: string | null
  hoverTime?: string
  x: number
  y: number
}

interface Segment {
  type: 'work' | 'idle' | 'offline'
  start: string
  end: string
}

const staticTimelineCache = new WeakMap<Segment[], {
  firstActivityTime: string
  lastActivityTime: string
  offlineHours: string
  anchor: string
}>()

export function sameTimelineTooltip(previous: TimelineTooltipData | null, next: TimelineTooltipData | null): boolean {
  if (previous === next) return true
  if (!previous || !next) return false
  return previous.name === next.name
    && previous.firstActivityTime === next.firstActivityTime
    && previous.lastActivityTime === next.lastActivityTime
    && previous.productiveHours === next.productiveHours
    && previous.idleHours === next.idleHours
    && previous.offlineHours === next.offlineHours
    && previous.hoverTime === next.hoverTime
    && previous.thumbnailUrl === next.thumbnailUrl
    && previous.x === next.x
    && previous.y === next.y
}

/** Human-readable "Xh Ym" / "Ym" duration used inside the tooltip. */
export const formatTimelineDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

/**
 * Build the tooltip payload for a hovered timeline row. Shared by the Command
 * Center's EmployeeTimeline and the Employee Details weekly timeline so both
 * show the exact same hover card (name, first/last activity, productive/idle/
 * offline hours, and — when a lookup is supplied — the nearest screenshot).
 *
 * @param name          Employee name shown in the card header.
 * @param segments      Activity segments for the hovered row.
 * @param workSeconds   Productive seconds for the row.
 * @param idleSeconds   Idle seconds for the row.
 * @param event         The mouse event (for cursor position + hit-testing).
 * @param shiftStartHour/shiftHours  Axis window, to map cursor X → time-of-day.
 * @param screenshotLookup  Optional (name, iso) → screenshot URL for the thumbnail.
 */
export function computeTimelineTooltip(
  name: string,
  segments: Segment[],
  workSeconds: number,
  idleSeconds: number,
  event: React.MouseEvent<HTMLDivElement>,
  shiftStartHour: number,
  shiftHours: number,
  screenshotLookup?: (employeeName: string, isoTime: string) => string | null
): TimelineTooltipData | null {
  let staticData = staticTimelineCache.get(segments)
  if (!staticData) {
    const workAndIdle = segments.filter((s) => s.type === 'work' || s.type === 'idle')
    if (workAndIdle.length === 0) return null
    const offlineSeconds = segments
      .filter((s) => s.type === 'offline')
      .reduce((sum, s) => sum + Math.max(0, (new Date(s.end).getTime() - new Date(s.start).getTime()) / 1000), 0)
    staticData = {
      firstActivityTime: formatClock(workAndIdle[0].start),
      lastActivityTime: formatClock(workAndIdle[workAndIdle.length - 1].end),
      offlineHours: formatTimelineDuration(Math.max(0, Math.round(offlineSeconds))),
      anchor: workAndIdle[0].start,
    }
    staticTimelineCache.set(segments, staticData)
  }

  const rect = event.currentTarget.getBoundingClientRect()

  let thumbnailUrl: string | null | undefined
  let hoverTime: string | undefined
  const anchor = staticData.anchor
  if (screenshotLookup && anchor) {
    const frac = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)))
    const hourOfDay = shiftStartHour + frac * shiftHours
    const base = new Date(anchor)
    const h = Math.floor(hourOfDay)
    // Quantize the hovered minute to a coarse bucket (BUCKET_MIN). Without this,
    // the resolved screenshot URL changed on every pixel of mouse movement, so
    // the tooltip <img> re-mounted and re-downloaded continuously → visible lag.
    // Bucketing keeps the URL (and thus the browser-cached image) stable across
    // many pixels, so the thumbnail only changes when you move a meaningful step.
    const BUCKET_MIN = 10
    const rawMin = Math.floor((hourOfDay - h) * 60)
    const m = Math.floor(rawMin / BUCKET_MIN) * BUCKET_MIN
    base.setHours(h, m, 0, 0)
    const iso = base.toISOString()
    hoverTime = formatClock(iso)
    thumbnailUrl = screenshotLookup(name, iso)
  }

  return {
    name,
    firstActivityTime: staticData.firstActivityTime,
    lastActivityTime: staticData.lastActivityTime,
    productiveHours: formatTimelineDuration(workSeconds),
    idleHours: formatTimelineDuration(idleSeconds),
    offlineHours: staticData.offlineHours,
    thumbnailUrl,
    hoverTime,
    x: Math.round(event.clientX / 20) * 20,
    y: rect.top - 10,
  }
}

/**
 * The floating hover card itself. Rendered `fixed` at the cursor. Identical
 * markup wherever a timeline is shown.
 */
export default function TimelineTooltip({ tooltip }: { tooltip: TimelineTooltipData | null }) {
  if (!tooltip) return null
  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px`, transform: 'translate(-50%, -100%)' }}
    >
      <div className="min-w-[240px] rounded-xl border border-[var(--border)] bg-[var(--primary)] p-3 text-[var(--primary-foreground)] shadow-2xl">
        <div className="space-y-2">
          <div className="mb-2 border-b border-white/15 pb-2 text-base font-semibold">{tooltip.name}</div>

          {tooltip.thumbnailUrl && (
            <div className="mb-2 overflow-hidden rounded-lg border border-white/15">
              <img src={tooltip.thumbnailUrl} alt="Screenshot near hovered time" className="h-28 w-full object-cover" />
              {tooltip.hoverTime && (
                <div className="bg-black/30 px-2 py-1 text-center text-[11px] text-white/80">
                  Nearest capture · {tooltip.hoverTime}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="text-[color-mix(in_oklab,var(--primary-foreground)_72%,transparent)]">First Activity Time:</div>
            <div className="font-medium text-right">{tooltip.firstActivityTime}</div>

            <div className="text-[color-mix(in_oklab,var(--primary-foreground)_72%,transparent)]">Last Activity Time:</div>
            <div className="font-medium text-right">{tooltip.lastActivityTime}</div>
          </div>

          <div className="mt-2 border-t border-white/15 pt-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded" style={{ background: 'white' }}></div>
                <span className="text-[color-mix(in_oklab,var(--primary-foreground)_72%,transparent)]">Productive Hours:</span>
              </div>
              <div className="font-medium text-right">{tooltip.productiveHours}</div>

              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded" style={{ background: 'var(--warning)' }}></div>
                <span className="text-[color-mix(in_oklab,var(--primary-foreground)_72%,transparent)]">Idle Hours:</span>
              </div>
              <div className="font-medium text-right">{tooltip.idleHours}</div>

              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded border border-white/20 bg-white/10"></div>
                <span className="text-[color-mix(in_oklab,var(--primary-foreground)_72%,transparent)]">Offline Hours:</span>
              </div>
              <div className="font-medium text-right">{tooltip.offlineHours}</div>
            </div>
          </div>
        </div>

        {/* Arrow pointing down */}
        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full">
          <div className="h-0 w-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-[var(--primary)]"></div>
        </div>
      </div>
    </div>
  )
}
