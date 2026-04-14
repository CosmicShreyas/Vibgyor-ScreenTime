import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Clock, Calendar } from 'lucide-react'
import { employeeService, EmployeeDetail, ApplicationUsage, BrowserTabUsage, EmployeeTimeline } from '../services/api'
import { formatTime, formatWorkTime, getTodayLocalDate } from '../utils/time'
import StatCard from '../components/StatCard'
import EmployeeTimelineComponent from '../components/EmployeeTimeline'
import toast from 'react-hot-toast'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

export default function EmployeeSelfViewPage() {
  const [searchParams] = useSearchParams()
  const [employeeName, setEmployeeName] = useState<string>('')
  const [employeeId, setEmployeeId] = useState<string>('')
  const [employee, setEmployee] = useState<EmployeeDetail | null>(null)
  const [appUsage, setAppUsage] = useState<ApplicationUsage | null>(null)
  const [tabUsage, setTabUsage] = useState<BrowserTabUsage | null>(null)
  const [weeklyTimeline, setWeeklyTimeline] = useState<any>(null)
  const [timeline, setTimeline] = useState<EmployeeTimeline[]>([])
  const [shiftHours, setShiftHours] = useState({ start: 9, end: 20 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = getTodayLocalDate()
  const [appUsageStartDate, setAppUsageStartDate] = useState(today)
  const [appUsageEndDate, setAppUsageEndDate] = useState(today)
  const [tabUsageStartDate, setTabUsageStartDate] = useState(today)
  const [tabUsageEndDate, setTabUsageEndDate] = useState(today)

  useEffect(() => {
    const usr = searchParams.get('usr')
    const eid = searchParams.get('eid')
    
    if (!usr && !eid) {
      setError('Invalid access: Missing employee identifier')
      setLoading(false)
      return
    }

    try {
      if (usr) {
        const decodedName = atob(usr)
        setEmployeeName(decodedName)
      } else if (eid) {
        const decodedId = atob(eid)
        setEmployeeId(decodedId)
      }
    } catch (err) {
      setError('Invalid access: Invalid employee identifier format')
      setLoading(false)
      return
    }
  }, [searchParams])

  useEffect(() => {
    if (employeeName || employeeId) {
      loadEmployeeData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeName, employeeId, appUsageStartDate, appUsageEndDate, tabUsageStartDate, tabUsageEndDate])

  const loadEmployeeData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Use employee name if available, otherwise use employee ID
      const identifier = employeeName || employeeId
      if (!identifier) {
        setError('No employee identifier available')
        return
      }

      // Load employee detail
      const detail = await employeeService.getDetail(identifier, appUsageStartDate, appUsageEndDate)
      setEmployee(detail)

      // Load app usage
      const appData = await employeeService.getApplicationUsage(identifier, 'today', appUsageStartDate, appUsageEndDate)
      setAppUsage(appData)

      // Load browser tab usage
      const tabData = await employeeService.getBrowserTabUsage(identifier, 'today', tabUsageStartDate, tabUsageEndDate)
      setTabUsage(tabData)

      // Load weekly timeline
      const timelineData = await employeeService.getEmployeeWeeklyTimeline(identifier)
      setWeeklyTimeline(timelineData)

      // Create timeline data for the employee
      if (detail) {
        const employeeTimeline: EmployeeTimeline = {
          name: detail.name,
          status: 'active',
          work_time_today: detail.activity_history?.reduce((sum, log) => sum + log.work_seconds, 0) || 0,
          idle_time_today: detail.activity_history?.reduce((sum, log) => sum + log.idle_seconds, 0) || 0,
          segments: [],
        }
        setTimeline([employeeTimeline])
        setShiftHours({ start: 9, end: 20 })
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load employee data'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 bg-gray-50 dark:bg-slate-900 min-h-screen">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">Access Error</h2>
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="p-8 bg-gray-50 dark:bg-slate-900 min-h-screen">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400">Employee data not found</p>
        </div>
      </div>
    )
  }

  const totalWorkTime = employee.activity_history?.reduce((sum, log) => sum + log.work_seconds, 0) || 0
  const totalIdleTime = employee.activity_history?.reduce((sum, log) => sum + log.idle_seconds, 0) || 0

  return (
    <div className="p-8 bg-gray-50 dark:bg-slate-900 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{employee?.name || employeeName || employeeId}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Your work statistics</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Work Time Today"
          value={formatWorkTime(totalWorkTime)}
          icon={Clock}
          color="blue"
        />
        <StatCard
          title="Idle Time Today"
          value={formatWorkTime(totalIdleTime)}
          icon={Clock}
          color="yellow"
        />
        <StatCard
          title="Total Activity"
          value={formatWorkTime(totalWorkTime + totalIdleTime)}
          icon={Clock}
          color="green"
        />
      </div>

      {/* Application Usage Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Application Usage
          </h2>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
            {/* Date Range Pickers */}
            <div className="flex items-center gap-2">
              <Calendar className="text-gray-500 dark:text-gray-400" size={18} />
              <input
                type="date"
                value={appUsageStartDate}
                onChange={(e) => setAppUsageStartDate(e.target.value)}
                max={appUsageEndDate}
                className="px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all"
              />
              <span className="text-gray-500 dark:text-gray-400">to</span>
              <input
                type="date"
                value={appUsageEndDate}
                onChange={(e) => setAppUsageEndDate(e.target.value)}
                min={appUsageStartDate}
                className="px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {appUsage && appUsage.applications.length > 0 ? (
          <>
            {/* Total Time Summary */}
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Total Application Time: <span className="text-blue-600 dark:text-blue-400 font-semibold">{formatTime(appUsage.applications.reduce((sum, app) => sum + app.duration, 0))}</span>
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart - Show top 10 apps with duration > 0 */}
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={appUsage.applications.filter(app => app.duration > 0).slice(0, 10)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="duration"
                  >
                    {appUsage.applications.filter(app => app.duration > 0).slice(0, 10).map((_app, idx) => {
                      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16']
                      return <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatTime(value)}
                    contentStyle={{
                      backgroundColor: '#111827',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#FFFFFF',
                    }}
                    labelStyle={{
                      color: '#FFFFFF',
                    }}
                    itemStyle={{
                      color: '#FFFFFF',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Progress Bars - Show top 15 apps with duration > 0 */}
            <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
              {appUsage.applications.filter(app => app.duration > 0).slice(0, 15).map((app, idx) => {
                const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16']
                const barColor = colors[idx % colors.length]

                return (
                  <div key={app.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                        {app.name}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {formatTime(app.duration)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(app.percentage, 100)}%`,
                          backgroundColor: barColor,
                        }}
                      ></div>
                    </div>
                  </div>
                )
              })}
            </div>
            </div>
          </>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-center py-12">
            No application usage data available
          </p>
        )}
      </div>

      {/* Browser Tab Usage Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg mt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Browser Tab Usage
          </h2>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
            {/* Date Range Pickers */}
            <div className="flex items-center gap-2">
              <Calendar className="text-gray-500 dark:text-gray-400" size={18} />
              <input
                type="date"
                value={tabUsageStartDate}
                onChange={(e) => setTabUsageStartDate(e.target.value)}
                max={tabUsageEndDate}
                className="px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all"
              />
              <span className="text-gray-500 dark:text-gray-400">to</span>
              <input
                type="date"
                value={tabUsageEndDate}
                onChange={(e) => setTabUsageEndDate(e.target.value)}
                min={tabUsageStartDate}
                className="px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {tabUsage && tabUsage.browser_tabs && tabUsage.browser_tabs.filter(tab => tab.duration > 0).length > 0 ? (
          <>
            {/* Total Time Summary */}
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Total Browser Tab Time: <span className="text-blue-600 dark:text-blue-400 font-semibold">{formatTime(tabUsage.browser_tabs.reduce((sum, tab) => sum + tab.duration, 0))}</span>
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart - Show top 10 tabs with duration > 0 */}
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={tabUsage.browser_tabs.filter(tab => tab.duration > 0).slice(0, 10)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="duration"
                  >
                    {tabUsage.browser_tabs.filter(tab => tab.duration > 0).slice(0, 10).map((_tab, idx) => {
                      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16']
                      return <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatTime(value)}
                    contentStyle={{
                      backgroundColor: '#111827',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#FFFFFF',
                    }}
                    labelStyle={{
                      color: '#FFFFFF',
                    }}
                    itemStyle={{
                      color: '#FFFFFF',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Progress Bars - Show top 15 tabs with duration > 0 */}
            <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
              {tabUsage.browser_tabs.filter(tab => tab.duration > 0).slice(0, 15).map((tab, idx) => {
                const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16']
                const barColor = colors[idx % colors.length]

                return (
                  <div key={`${tab.title}-${idx}`} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]" title={tab.title}>
                        {tab.title}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {formatTime(tab.duration)}
                      </span>
                    </div>
                    {tab.url && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={tab.url}>
                        {tab.url}
                      </p>
                    )}
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(tab.percentage, 100)}%`,
                          backgroundColor: barColor,
                        }}
                      ></div>
                    </div>
                  </div>
                )
              })}
            </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              {!tabUsage ? 'Loading browser tab usage...' : !tabUsage.browser_tabs ? 'No browser tab data available' : 'No browser tabs with tracked duration'}
            </p>
            {tabUsage && tabUsage.browser_tabs && tabUsage.browser_tabs.length > 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                {tabUsage.browser_tabs.length} tab(s) found but no duration tracked yet
              </p>
            )}
          </div>
        )}
      </div>

      {/* Today's Work Timeline Section */}
      <div className="mt-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Today's Work Timeline</h2>
        <EmployeeTimelineComponent timelines={timeline} shiftStartHour={shiftHours.start} shiftEndHour={shiftHours.end} />
      </div>

      {/* Weekly Work Timeline Section */}
      {weeklyTimeline && weeklyTimeline.daily_timelines && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg mt-6">
          <div className="flex items-center gap-2 mb-6">
            <Calendar className="text-gray-900 dark:text-white" size={20} />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Weekly Work Timeline
            </h2>
          </div>

          <div className="space-y-4">
            {weeklyTimeline.daily_timelines.map((day: any, dayIndex: number) => {
              const dayDate = new Date(day.date)
              const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              const isToday = dayDate.toDateString() === new Date().toDateString()
              
              // Calculate shift time range (9 AM to 8 PM)
              const shiftStart = new Date(day.date)
              shiftStart.setHours(9, 0, 0, 0)
              const shiftEnd = new Date(day.date)
              shiftEnd.setHours(20, 0, 0, 0)
              const totalShiftMs = shiftEnd.getTime() - shiftStart.getTime()

              // Generate hour markers
              const hourMarkers = Array.from({ length: 12 }, (_, i) => {
                const hour = 9 + i
                const position = (i / 11) * 100
                return { hour, position }
              })

              const getSegmentPosition = (start: string, end: string) => {
                const startTime = new Date(start).getTime()
                const endTime = new Date(end).getTime()
                
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

              const formatWorkTime = (seconds: number): string => {
                const hours = Math.floor(seconds / 3600)
                const minutes = Math.floor((seconds % 3600) / 60)
                
                if (hours > 0) {
                  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
                }
                return `${minutes}m`
              }

              return (
                <div key={dayIndex} className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-b-0">
                  {/* Day header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                        {dayName}
                      </span>
                      {isToday && (
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full">
                          Today
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Work: {formatWorkTime(day.work_time_today || 0)} | Idle: {formatWorkTime(day.idle_time_today || 0)}
                    </span>
                  </div>

                  {/* Hour markers */}
                  <div className="relative mb-2 h-6">
                    <div className="absolute inset-0">
                      {hourMarkers.map(({ hour, position }) => (
                        <div
                          key={hour}
                          className="absolute flex flex-col items-center"
                          style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
                        >
                          <div className="w-px h-1 bg-gray-300 dark:bg-gray-600 mb-1"></div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{hour}:00</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Timeline bar */}
                  <div className="relative h-8 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                    {/* Segments */}
                    {(day.segments || []).map((segment: any, segIdx: number) => {
                      const { left, width } = getSegmentPosition(segment.start, segment.end)
                      return (
                        <div
                          key={segIdx}
                          className={`absolute h-full ${getSegmentColor(segment.type)} transition-all duration-200`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${segment.type}: ${new Date(segment.start).toLocaleTimeString()} - ${new Date(segment.end).toLocaleTimeString()}`}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-600 dark:bg-blue-500"></div>
              <span className="text-gray-600 dark:text-gray-400">Work</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-300 dark:bg-blue-400"></div>
              <span className="text-gray-600 dark:text-gray-400">Idle</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
              <span className="text-gray-600 dark:text-gray-400">Offline</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
