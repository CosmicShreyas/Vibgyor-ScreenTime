import { useState } from 'react'
import { EmployeeTimeline as TimelineData } from '../services/api'

interface EmployeeTimelineProps {
  timelines: TimelineData[]
  shiftStartHour: number
  shiftEndHour: number
}

// Format seconds to human-readable time
const formatWorkTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${minutes}m`
}

// Format time to HH:MM
const formatTimeHHMM = (date: Date): string => {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

interface TooltipData {
  name: string
  firstActivityTime: string
  lastActivityTime: string
  productiveHours: string
  idleHours: string
  offlineHours: string
  x: number
  y: number
}

export default function EmployeeTimeline({ timelines, shiftStartHour, shiftEndHour }: EmployeeTimelineProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  // Calculate shift time range
  const shiftStart = new Date()
  shiftStart.setHours(shiftStartHour, 0, 0, 0)
  const shiftEnd = new Date()
  shiftEnd.setHours(shiftEndHour, 0, 0, 0)
  const totalShiftMs = shiftEnd.getTime() - shiftStart.getTime()

  // Generate hour markers for shift hours only
  const shiftHours = shiftEndHour - shiftStartHour
  const hourMarkers = Array.from({ length: shiftHours + 1 }, (_, i) => {
    const hour = shiftStartHour + i
    const position = (i / shiftHours) * 100
    return { hour, position }
  })

  const getSegmentPosition = (start: string, end: string) => {
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()
    
    // Calculate position relative to shift start/end
    const left = ((startTime - shiftStart.getTime()) / totalShiftMs) * 100
    const width = ((endTime - startTime) / totalShiftMs) * 100
    
    return { left: Math.max(0, Math.min(100, left)), width: Math.max(0.1, Math.min(100 - left, width)) }
  }

  const getSegmentColor = (type: 'work' | 'idle' | 'offline') => {
    switch (type) {
      case 'work':
        return 'bg-blue-600 dark:bg-blue-500'
      case 'idle':
        return 'bg-blue-300 dark:bg-blue-400'
      case 'offline':
        return 'bg-transparent'
    }
  }

  const handleTimelineHover = (timeline: TimelineData, event: React.MouseEvent<HTMLDivElement>) => {
    // Calculate first and last activity times
    const workAndIdleSegments = timeline.segments.filter(s => s.type === 'work' || s.type === 'idle')
    
    if (workAndIdleSegments.length === 0) {
      setTooltip(null)
      return
    }

    const firstActivityTime = new Date(workAndIdleSegments[0].start)
    const lastActivityTime = new Date(workAndIdleSegments[workAndIdleSegments.length - 1].end)

    // Calculate total offline time
    const shiftStart = new Date()
    shiftStart.setHours(shiftStartHour, 0, 0, 0)
    const shiftEnd = new Date()
    shiftEnd.setHours(shiftEndHour, 0, 0, 0)
    const totalShiftSeconds = (shiftEnd.getTime() - shiftStart.getTime()) / 1000
    const offlineSeconds = totalShiftSeconds - timeline.work_time_today - timeline.idle_time_today

    const rect = event.currentTarget.getBoundingClientRect()
    
    setTooltip({
      name: timeline.name,
      firstActivityTime: formatTimeHHMM(firstActivityTime),
      lastActivityTime: formatTimeHHMM(lastActivityTime),
      productiveHours: formatWorkTime(timeline.work_time_today),
      idleHours: formatWorkTime(timeline.idle_time_today),
      offlineHours: formatWorkTime(Math.max(0, offlineSeconds)),
      x: event.clientX,
      y: rect.top - 10
    })
  }

  const handleTimelineLeave = () => {
    setTooltip(null)
  }

  console.log('Timeline data:', timelines)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg">
      <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">
        Employees Work Timeline
      </h2>

      {/* Hour markers */}
      <div className="relative mb-4 h-8">
        <div className="absolute inset-0">
          {hourMarkers.map(({ hour, position }) => (
            <div
              key={hour}
              className="absolute flex flex-col items-center"
              style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
            >
              <div className="w-px h-2 bg-gray-300 dark:bg-gray-600"></div>
              {hour % 3 === 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {hour.toString().padStart(2, '0')}:00
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
              key={timeline.name}
              className="flex items-center gap-4 group hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors"
              onMouseMove={(e) => handleTimelineHover(timeline, e)}
              onMouseLeave={handleTimelineLeave}
            >
              {/* Employee name */}
              <div className="w-40 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-gray-900 dark:text-white text-xs font-semibold">
                      {timeline.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                      {timeline.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatWorkTime(timeline.work_time_today)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Timeline bar */}
              <div className="flex-1 relative h-8 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                {timeline.segments && timeline.segments.length > 0 ? (
                  timeline.segments.map((segment, idx) => {
                    const { left, width } = getSegmentPosition(segment.start, segment.end)
                    const segmentColor = getSegmentColor(segment.type)
                    
                    // Only render work and idle segments (offline is transparent)
                    if (segment.type === 'offline') return null
                    
                    return (
                      <div
                        key={idx}
                        className={`absolute h-full ${segmentColor} transition-all`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                        }}
                        title={`${segment.type}: ${new Date(segment.start).toLocaleTimeString()} - ${new Date(segment.end).toLocaleTimeString()}`}
                      ></div>
                    )
                  })
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs text-gray-400 dark:text-gray-500">No activity</span>
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
                <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                  {timeline.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-600 dark:bg-blue-500 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Work</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-300 dark:bg-blue-400 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Idle</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 dark:bg-gray-900 rounded border border-gray-300 dark:border-gray-600"></div>
            <span className="text-gray-600 dark:text-gray-400">Offline</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-2xl p-4 min-w-[280px] border border-gray-700">
            <div className="space-y-2">
              <div className="font-semibold text-base border-b border-gray-700 pb-2 mb-2">
                {tooltip.name}
              </div>
              
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-gray-400">First Activity Time:</div>
                <div className="font-medium text-right">{tooltip.firstActivityTime}</div>
                
                <div className="text-gray-400">Last Activity Time:</div>
                <div className="font-medium text-right">{tooltip.lastActivityTime}</div>
              </div>

              <div className="border-t border-gray-700 pt-2 mt-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-600 rounded"></div>
                    <span className="text-gray-400">Productive Hours:</span>
                  </div>
                  <div className="font-medium text-right">{tooltip.productiveHours}</div>
                  
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-300 rounded"></div>
                    <span className="text-gray-400">Idle Hours:</span>
                  </div>
                  <div className="font-medium text-right">{tooltip.idleHours}</div>
                  
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-600 rounded border border-gray-500"></div>
                    <span className="text-gray-400">Offline Hours:</span>
                  </div>
                  <div className="font-medium text-right">{tooltip.offlineHours}</div>
                </div>
              </div>
            </div>
            
            {/* Arrow pointing down */}
            <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full">
              <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-gray-900 dark:border-t-gray-800"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
