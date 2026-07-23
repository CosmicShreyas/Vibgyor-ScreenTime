import { useMemo, useState } from 'react'
import { EmployeeTimeline as TimelineData } from '../services/api'
import { formatClock, zonedHoursSinceMidnight, formatHourLabel } from '../utils/time'
import TimelineTooltip, {
  TimelineTooltipData,
  computeTimelineTooltip,
  sameTimelineTooltip,
  formatTimelineDuration as formatWorkTime,
} from './TimelineTooltip'

interface EmployeeTimelineProps {
  timelines: TimelineData[]
  shiftStartHour: number
  shiftEndHour: number
  /**
   * Optional: given an employee name and an ISO timestamp, return the URL of the
   * screenshot captured nearest that time (or null). When provided, hovering the
   * timeline shows that screenshot as a thumbnail, tying activity to evidence.
   */
  screenshotLookup?: (employeeName: string, isoTime: string) => string | null
}

export default function EmployeeTimeline({ timelines, shiftStartHour, shiftEndHour, screenshotLookup }: EmployeeTimelineProps) {
  const [tooltip, setTooltip] = useState<TimelineTooltipData | null>(null)

  // The command-center timeline is deliberately one row per employee. Keep a
  // defensive normalization here as well so stale cached responses from the
  // former range endpoint cannot temporarily render duplicate employee rows.
  // If legacy dated rows are present, retain only the latest day for each name.
  const dailyTimelines = useMemo(() => {
    const byEmployee = new Map<string, TimelineData>()
    for (const timeline of timelines) {
      const existing = byEmployee.get(timeline.name)
      if (
        !existing ||
        !timeline.date ||
        (Boolean(existing.date) && timeline.date > existing.date!)
      ) {
        byEmployee.set(timeline.name, timeline)
      }
    }
    return Array.from(byEmployee.values())
  }, [timelines])

  // The axis spans the shift window, measured in business-timezone hours so it
  // does not depend on the viewer's browser timezone.
  const shiftHours = Math.max(1, shiftEndHour - shiftStartHour)

  const hourMarkers = Array.from({ length: shiftHours + 1 }, (_, i) => {
    const hour = shiftStartHour + i
    const position = (i / shiftHours) * 100
    return { hour, position }
  })

  // Position a segment on the axis using its wall-clock hours-since-midnight in
  // the business timezone, clamped to the shift window.
  const getSegmentPosition = (start: string, end: string) => {
    const startHours = zonedHoursSinceMidnight(start)
    const endHours = zonedHoursSinceMidnight(end)
    const left = ((startHours - shiftStartHour) / shiftHours) * 100
    const width = ((endHours - startHours) / shiftHours) * 100
    return { left: Math.max(0, Math.min(100, left)), width: Math.max(0.4, Math.min(100 - Math.max(0, left), width)) }
  }

  const getSegmentColor = (type: 'work' | 'idle' | 'offline') => {
    switch (type) {
      case 'work':
        // Work = solid brand blue.
        return 'bg-[var(--primary)]'
      case 'idle':
        // Idle = amber, clearly distinct from Work's blue.
        return 'bg-[var(--warning)]'
      case 'offline':
        // Offline is drawn as a faint hatched band so gaps are visible.
        return 'bg-[color-mix(in_oklab,var(--muted-foreground)_18%,transparent)]'
    }
  }

  const handleTimelineHover = (timeline: TimelineData, event: React.MouseEvent<HTMLDivElement>) => {
    const next = computeTimelineTooltip(
        timeline.name,
        timeline.segments,
        timeline.work_time_today,
        timeline.idle_time_today,
        event,
        shiftStartHour,
        shiftHours,
        screenshotLookup
      )
    setTooltip((previous) => sameTimelineTooltip(previous, next) ? previous : next)
  }

  const handleTimelineLeave = () => {
    setTooltip(null)
  }

  return (
    <div className="dashboard-card p-4">
      <h2 className="mb-4 font-display text-lg font-semibold text-[var(--foreground)]">
        Employees Work Timeline
      </h2>

      {/* The ruler uses the same three-column geometry as every timeline row,
          so its ticks line up with the activity bar rather than the card. */}
      <div className="mb-3 flex items-start gap-4">
        <div className="w-40 flex-shrink-0" aria-hidden="true" />
        <div className="relative h-7 flex-1">
          {hourMarkers.map(({ hour, position }) => {
            const isBoundary = position === 0 || position === 100
            const showLabel = isBoundary || (hour - shiftStartHour) % 3 === 0

            return (
              <div
                key={hour}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${position}%`,
                  transform:
                    position === 0
                      ? 'translateX(0)'
                      : position === 100
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)',
                  alignItems: position === 0 ? 'flex-start' : position === 100 ? 'flex-end' : 'center',
                }}
              >
                <div className="h-2 w-px bg-[var(--border)]"></div>
                {showLabel && (
                  <span className="mt-1 whitespace-nowrap text-xs text-[var(--muted-foreground)]">
                    {formatHourLabel(hour)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="w-20 flex-shrink-0" aria-hidden="true" />
      </div>

      {/* Timeline rows */}
      <div className="custom-scrollbar max-h-[720px] space-y-3 overflow-y-auto pr-1">
        {dailyTimelines.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No timeline data available
          </p>
        ) : (
          dailyTimelines.map((timeline) => (
            <div
              key={timeline.name}
              className="group flex items-center gap-4 rounded-xl p-2 transition-colors hover:bg-[var(--accent)]/60"
              onMouseMove={(e) => handleTimelineHover(timeline, e)}
              onMouseLeave={handleTimelineLeave}
            >
              {/* Employee name */}
              <div className="w-40 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--secondary)]">
                    <span className="text-xs font-semibold text-[var(--secondary-foreground)]">
                      {timeline.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">
                      {timeline.name}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatWorkTime(timeline.work_time_today)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Timeline bar */}
              <div className="relative h-8 flex-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)]">
                {timeline.segments && timeline.segments.length > 0 ? (
                  // Render offline segments FIRST (underneath) so that if any
                  // work/idle segment ever overlaps an offline gap, the solid
                  // work/idle colour always wins visually — never hatched-over.
                  [...timeline.segments]
                    .map((segment, idx) => ({ segment, idx }))
                    .sort((a, b) => (a.segment.type === 'offline' ? 0 : 1) - (b.segment.type === 'offline' ? 0 : 1))
                    .map(({ segment, idx }) => {
                    const { left, width } = getSegmentPosition(segment.start, segment.end)
                    const segmentColor = getSegmentColor(segment.type)

                    return (
                      <div
                        key={idx}
                        className={`absolute h-full ${segmentColor} transition-all ${
                          segment.type === 'offline'
                            ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,color-mix(in_oklab,var(--muted-foreground)_22%,transparent)_4px,color-mix(in_oklab,var(--muted-foreground)_22%,transparent)_8px)]'
                            : ''
                        }`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                        }}
                        title={`${segment.type}: ${formatClock(segment.start)} - ${formatClock(segment.end)}`}
                      ></div>
                    )
                  })
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs text-[var(--muted-foreground)]">No activity</span>
                  </div>
                )}
              </div>

              {/* Status indicator */}
              <div className="w-20 flex-shrink-0 flex items-center justify-end gap-1.5">
                <div
                  className={`w-2 h-2 rounded-full ${
                    timeline.status === 'active'
                      ? 'bg-green-500 animate-pulse'
                      : timeline.status === 'idle'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                ></div>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {timeline.status === 'paused' ? 'Monitoring paused' : timeline.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tooltip (shared with the Employee Details timeline) */}
      <TimelineTooltip tooltip={tooltip} />
    </div>
  )
}
