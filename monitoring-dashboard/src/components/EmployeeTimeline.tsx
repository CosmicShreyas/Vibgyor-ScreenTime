import { useState } from 'react'
import { EmployeeTimeline as TimelineData } from '../services/api'
import { formatClock, zonedHoursSinceMidnight, formatHourLabel } from '../utils/time'
import TimelineTooltip, {
  TimelineTooltipData,
  computeTimelineTooltip,
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
    setTooltip(
      computeTimelineTooltip(
        timeline.name,
        timeline.segments,
        timeline.work_time_today,
        timeline.idle_time_today,
        event,
        shiftStartHour,
        shiftHours,
        screenshotLookup
      )
    )
  }

  const handleTimelineLeave = () => {
    setTooltip(null)
  }

  return (
    <div className="dashboard-card p-4">
      <h2 className="mb-4 font-display text-lg font-semibold text-[var(--foreground)]">
        Employees Work Timeline
      </h2>

      {/* Hour markers */}
      <div className="relative mb-3 h-7">
        <div className="absolute inset-0">
          {hourMarkers.map(({ hour, position }) => (
            <div
              key={hour}
              className="absolute flex flex-col items-center"
              style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
            >
              <div className="h-2 w-px bg-[var(--border)]"></div>
              {hour % 3 === 0 && (
                <span className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {formatHourLabel(hour)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline rows */}
      <div className="space-y-3">
        {timelines.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No timeline data available
          </p>
        ) : (
          timelines.map((timeline) => (
            <div
                  key={`${timeline.name}-${timeline.date || 'today'}`}
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
                  {timeline.date || timeline.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <div className="flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-[var(--primary)]"></div>
            <span className="text-[var(--muted-foreground)]">Work</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-[var(--warning)]"></div>
            <span className="text-[var(--muted-foreground)]">Idle</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-[var(--border)] bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,color-mix(in_oklab,var(--muted-foreground)_30%,transparent)_2px,color-mix(in_oklab,var(--muted-foreground)_30%,transparent)_4px)]"></div>
            <span className="text-[var(--muted-foreground)]">Offline</span>
          </div>
        </div>
      </div>

      {/* Tooltip (shared with the Employee Details timeline) */}
      <TimelineTooltip tooltip={tooltip} />
    </div>
  )
}
