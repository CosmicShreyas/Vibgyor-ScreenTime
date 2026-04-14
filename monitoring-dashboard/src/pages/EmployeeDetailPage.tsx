import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Monitor, Globe, Calendar } from 'lucide-react'
import { employeeService, EmployeeDetail } from '../services/api'
import { formatDuration, formatDateTime, getTodayLocalDate } from '../utils/time'
import { screenshotService } from '../services/api'
import toast from 'react-hot-toast'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

export default function EmployeeDetailPage() {
  const { name } = useParams<{ name: string }>()
  const [employee, setEmployee] = useState<EmployeeDetail | null>(null)
  const [weeklyTimeline, setWeeklyTimeline] = useState<any>(null)
  const [systemInfo, setSystemInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  
  // Date range states - use local timezone
  const today = getTodayLocalDate()
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)

  useEffect(() => {
    if (name) {
      console.log('Loading employee detail with dates:', { name, startDate, endDate })
      loadEmployeeDetail()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, startDate, endDate])

  const loadEmployeeDetail = async () => {
    try {
      console.log('Fetching employee detail:', { name, startDate, endDate })
      const data = await employeeService.getDetail(name!, startDate, endDate)
      console.log('Employee detail received:', data)
      setEmployee(data)
      
      // Load weekly timeline
      const timelineData = await employeeService.getEmployeeWeeklyTimeline(name!)
      setWeeklyTimeline(timelineData)
      
      // Load system info
      try {
        const response = await fetch(`/api/connected-clients/by-employee/${encodeURIComponent(name!)}`)
        if (response.ok) {
          const data = await response.json()
          setSystemInfo(data.systemInfo)
        }
      } catch (error) {
        console.log('System info not available:', error)
      }
    } catch (error) {
      console.error('Failed to load employee details:', error)
      toast.error('Failed to load employee details')
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

  if (!employee) {
    return (
      <div className="p-8">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Employee not found</p>
          <Link
            to="/employees"
            className="text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-300"
          >
            Back to Employees
          </Link>
        </div>
      </div>
    )
  }

  // Prepare chart data
  const activityData = employee.activity_history.slice(-24).map((item) => ({
    time: new Date(item.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    work: Math.round(item.work_seconds / 60),
    idle: Math.round(item.idle_seconds / 60),
  }))

  // Sort applications by duration (highest to lowest) - show ALL apps
  const sortedApps = [...employee.current_applications]
    .sort((a, b) => b.duration - a.duration)

  const appData = sortedApps.filter(app => app.duration > 0).slice(0, 5).map((app, index) => ({
    name: app.name,
    value: app.duration,
    color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index],
  }))

  // Sort browser tabs by duration (highest to lowest)
  const sortedTabs = [...employee.current_browser_tabs]
    .sort((a, b) => b.duration - a.duration)

  const tabData = sortedTabs.filter(tab => tab.duration > 0).slice(0, 5).map((tab, index) => ({
    name: tab.title.length > 30 ? tab.title.substring(0, 30) + '...' : tab.title,
    value: tab.duration,
    color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index],
  }))

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

  return (
    <div className="p-8 bg-gray-50 dark:bg-slate-900 min-h-screen">
      <Link
        to="/employees"
        className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
      >
        <ArrowLeft size={20} />
        Back to Employees
      </Link>

      <div className="mb-8">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <span className="text-2xl text-gray-900 dark:text-white font-bold">
                {employee.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {employee.name}
                {employee.location && (
                  <span className="text-xl font-normal text-gray-500 dark:text-gray-400 ml-2">
                    ({employee.location.city}, {employee.location.state})
                  </span>
                )}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">Employee Details</p>
            </div>
          </div>
          
          {/* Date Range Picker */}
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <Calendar className="text-gray-500 dark:text-gray-400" size={18} />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              max={endDate}
              className="px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all"
            />
            <span className="text-gray-500 dark:text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              className="px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* System Information Section */}
      {systemInfo && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="text-blue-600 dark:text-blue-400" size={24} />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">System Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Operating System</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{systemInfo.osName || 'Unknown'}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">{systemInfo.osVersion || 'Unknown'}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Hostname</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{systemInfo.hostname || 'Unknown'}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">{systemInfo.architecture || 'Unknown'}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Processor</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white truncate" title={systemInfo.cpuModel || 'Unknown'}>
                {systemInfo.cpuModel && systemInfo.cpuModel.length > 20 ? systemInfo.cpuModel.substring(0, 20) + '...' : (systemInfo.cpuModel || 'Unknown')}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">{systemInfo.cpuCores || 0} Cores</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Memory & Storage</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {(systemInfo.totalRamGb != null && !isNaN(systemInfo.totalRamGb)) ? systemInfo.totalRamGb.toFixed(1) : '0.0'} GB RAM
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {(systemInfo.totalDiskGb != null && !isNaN(systemInfo.totalDiskGb)) ? systemInfo.totalDiskGb.toFixed(0) : '0'} GB Disk
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Activity Timeline ({startDate === endDate ? new Date(startDate).toLocaleDateString() : `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`})
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#F9FAFB',
                }}
                labelStyle={{
                  color: '#FFFFFF',
                }}
                itemStyle={{
                  color: '#FFFFFF',
                }}
              />
              <Legend />
              <Bar dataKey="work" fill="#3B82F6" name="Work Time" />
              <Bar dataKey="idle" fill="#9CA3AF" name="Idle Time" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Application Usage
          </h2>
          {appData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={appData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {appData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatDuration(value)}
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
                <Legend
                  formatter={(value) => value.replace('.exe', '')}
                  wrapperStyle={{
                    color: '#FFFFFF',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No application data available
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Browser Tab Usage
          </h2>
          {tabData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={tabData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {tabData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatDuration(value)}
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
                <Legend
                  wrapperStyle={{
                    color: '#FFFFFF',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No browser tab data available
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="text-gray-900 dark:text-white" size={20} />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Browser Tabs (Detailed)
            </h2>
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
            {sortedTabs.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No active browser tabs
              </p>
            ) : (
              sortedTabs.map((tab, index) => {
                const maxDuration = sortedTabs[0]?.duration || 1
                const percentage = (tab.duration / maxDuration) * 100
                return (
                  <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-gray-900 dark:text-white truncate flex-1">
                        {tab.title}
                      </p>
                      <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                        {formatDuration(tab.duration)}
                      </span>
                    </div>
                    {tab.url && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">
                        {tab.url}
                      </p>
                    )}
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="text-gray-900 dark:text-white" size={20} />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Current Applications
            </h2>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
            {sortedApps.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No active applications
              </p>
            ) : (
              sortedApps.map((app, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <span className="font-medium text-gray-900 dark:text-white">{app.name}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDuration(app.duration)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="text-gray-900 dark:text-white" size={20} />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Application Usage (Progress)
            </h2>
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
            {sortedApps.filter(app => app.duration > 0).length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No application usage data
              </p>
            ) : (
              sortedApps.filter(app => app.duration > 0).map((app, index) => {
                const maxDuration = sortedApps[0]?.duration || 1
                const percentage = (app.duration / maxDuration) * 100
                return (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {app.name.replace('.exe', '')}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDuration(app.duration)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Weekly Timeline Section */}
      {weeklyTimeline && weeklyTimeline.daily_timelines && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg mb-6">
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
                      Work: {formatWorkTime(day.work_time)} | Idle: {formatWorkTime(day.idle_time)}
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

                  {/* Timeline bar */}
                  <div className="relative h-8 bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    {day.segments && day.segments.length > 0 && day.segments.some((s: any) => s.type !== 'offline') ? (
                      day.segments.map((segment: any, idx: number) => {
                        const { left, width } = getSegmentPosition(segment.start, segment.end)
                        const segmentColor = getSegmentColor(segment.type)
                        
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
                        <span className="text-xs text-gray-400 dark:text-gray-500">No data available on this day</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
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
                <div className="w-4 h-4 bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600"></div>
                <span className="text-gray-600 dark:text-gray-400">Offline</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Recent Screenshots
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {employee.recent_screenshots.length === 0 ? (
            <p className="col-span-full text-gray-500 dark:text-gray-400 text-center py-8">
              No screenshots available
            </p>
          ) : (
            employee.recent_screenshots.map((screenshot) => (
              <div
                key={screenshot.id}
                className="relative group cursor-pointer"
                onClick={() => setSelectedImage(screenshotService.getScreenshotUrl(screenshot.id))}
              >
                <img
                  src={screenshotService.getScreenshotUrl(screenshot.id)}
                  alt="Screenshot"
                  className="w-full h-32 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all rounded-lg flex items-center justify-center">
                  <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    View
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formatDateTime(screenshot.captured_at)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="max-w-5xl max-h-full">
            <img
              src={selectedImage}
              alt="Screenshot"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  )
}
