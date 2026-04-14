import { useState, useEffect } from 'react'
import { Users, Activity, UserX, Clock, Calendar } from 'lucide-react'
import { employeeService, EmployeeSummary, ApplicationUsage, BrowserTabUsage, EmployeeTimeline } from '../services/api'
import { websocketService } from '../services/websocket'
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

export default function DashboardPage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [appUsage, setAppUsage] = useState<ApplicationUsage | null>(null)
  const [tabUsage, setTabUsage] = useState<BrowserTabUsage | null>(null)
  const [timeline, setTimeline] = useState<EmployeeTimeline[]>([])
  const [shiftHours, setShiftHours] = useState({ start: 9, end: 20 })
  const [loading, setLoading] = useState(true)
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [selectedBrowserTabEmployee, setSelectedBrowserTabEmployee] = useState<string>('')
  
  // Date range states - use local timezone
  const today = getTodayLocalDate()
  const [appUsageStartDate, setAppUsageStartDate] = useState(today)
  const [appUsageEndDate, setAppUsageEndDate] = useState(today)
  const [tabUsageStartDate, setTabUsageStartDate] = useState(today)
  const [tabUsageEndDate, setTabUsageEndDate] = useState(today)

  useEffect(() => {
    loadEmployees()
    loadTimeline()
    websocketService.connect()

    const handleUpdate = () => {
      loadEmployees()
      loadTimeline()
      if (selectedEmployee) {
        loadAppUsage(selectedEmployee, appUsageStartDate, appUsageEndDate)
      }
      if (selectedBrowserTabEmployee) {
        loadTabUsage(selectedBrowserTabEmployee, tabUsageStartDate, tabUsageEndDate)
      }
    }

    websocketService.on('employee_update', handleUpdate)

    return () => {
      websocketService.off('employee_update', handleUpdate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedEmployee) {
      loadAppUsage(selectedEmployee, appUsageStartDate, appUsageEndDate)
    }
  }, [selectedEmployee, appUsageStartDate, appUsageEndDate])

  useEffect(() => {
    if (selectedBrowserTabEmployee) {
      loadTabUsage(selectedBrowserTabEmployee, tabUsageStartDate, tabUsageEndDate)
    }
  }, [selectedBrowserTabEmployee, tabUsageStartDate, tabUsageEndDate])

  const loadEmployees = async () => {
    try {
      const data = await employeeService.getAll()
      setEmployees(data)
      if (data.length > 0 && !selectedEmployee) {
        setSelectedEmployee(data[0].name)
      }
      if (data.length > 0 && !selectedBrowserTabEmployee) {
        setSelectedBrowserTabEmployee(data[0].name)
      }
    } catch (error) {
      toast.error('Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  const loadTimeline = async () => {
    try {
      const data = await employeeService.getTimeline()
      setTimeline(data.employees)
      setShiftHours({ start: data.shiftStartHour, end: data.shiftEndHour })
    } catch (error) {
      console.error('Failed to load timeline:', error)
    }
  }

  const loadAppUsage = async (name: string, startDate: string, endDate: string) => {
    try {
      console.log('Loading app usage:', { name, startDate, endDate })
      const data = await employeeService.getApplicationUsage(name, 'today', startDate, endDate)
      console.log('App usage data received:', data)
      setAppUsage(data)
    } catch (error) {
      console.error('Failed to load application usage:', error)
    }
  }

  const loadTabUsage = async (name: string, startDate: string, endDate: string) => {
    try {
      console.log('Loading browser tab usage:', { name, startDate, endDate })
      const data = await employeeService.getBrowserTabUsage(name, 'today', startDate, endDate)
      console.log('Browser tab usage data received:', data)
      setTabUsage(data)
    } catch (error) {
      console.error('Failed to load browser tab usage:', error)
      // Set empty data instead of leaving it null
      setTabUsage({
        employee_name: name,
        period: 'today',
        start_date: new Date().toISOString(),
        end_date: new Date().toISOString(),
        total_duration: 0,
        browser_tabs: []
      })
    }
  }

  const stats = {
    total: employees.length,
    online: employees.filter((e) => e.status === 'active').length,
    offline: employees.filter((e) => e.status === 'offline' || e.status === 'idle').length,
    totalWorkTime: employees.reduce((sum, e) => sum + e.work_time_today, 0),
  }

  const onlineEmployees = employees.filter((e) => e.status === 'active')
  const offlineEmployees = employees.filter((e) => e.status === 'offline' || e.status === 'idle')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    )
  }

  return (
    <div className="p-8 bg-gray-50 dark:bg-slate-900 min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard 
          title="Total Employees" 
          value={stats.total} 
          icon={Users} 
          color="blue" 
          employees={employees}
          showTooltip={true}
        />
        <StatCard 
          title="Online" 
          value={stats.online} 
          icon={Activity} 
          color="green" 
          employees={onlineEmployees}
          showTooltip={true}
        />
        <StatCard 
          title="Offline" 
          value={stats.offline} 
          icon={UserX} 
          color="red" 
          employees={offlineEmployees}
          showTooltip={true}
        />
        <StatCard
          title="Total Work Time"
          value={formatWorkTime(stats.totalWorkTime)}
          icon={Clock}
          color="yellow"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Online Employees
        </h2>
        <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-hide">
          {onlineEmployees.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No employees online
            </p>
          ) : (
            onlineEmployees.map((employee) => (
              <div
                key={employee.name}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <span className="text-gray-900 dark:text-white font-semibold">
                      {employee.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {employee.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Work: {formatTime(employee.work_time_today)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-sm text-green-600 dark:text-green-400 font-medium">Active</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Application Usage Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg mt-6">
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
            {/* Employee Selector */}
            {employees.length > 0 && (
              <div className="relative">
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="appearance-none px-4 py-2.5 pr-10 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 shadow-sm hover:shadow-md"
                >
                  {employees.map((emp) => (
                    <option key={emp.name} value={emp.name} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white py-2">
                      {emp.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 dark:text-gray-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            )}
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
                      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16'];
                      return <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />;
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
                const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16'];
                const barColor = colors[idx % colors.length];
                
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
                          backgroundColor: barColor
                        }}
                      ></div>
                    </div>
                  </div>
                );
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
            {/* Employee Selector */}
            {employees.length > 0 && (
              <div className="relative">
                <select
                  value={selectedBrowserTabEmployee}
                  onChange={(e) => setSelectedBrowserTabEmployee(e.target.value)}
                  className="appearance-none px-4 py-2.5 pr-10 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 shadow-sm hover:shadow-md"
                >
                  {employees.map((emp) => (
                    <option key={emp.name} value={emp.name} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white py-2">
                      {emp.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 dark:text-gray-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            )}
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
                      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16'];
                      return <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />;
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
                const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16'];
                const barColor = colors[idx % colors.length];
                
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
                          backgroundColor: barColor
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              {!tabUsage ? 'Loading browser tab usage...' : 
               !tabUsage.browser_tabs ? 'No browser tab data available' :
               'No browser tabs with tracked duration'}
            </p>
            {tabUsage && tabUsage.browser_tabs && tabUsage.browser_tabs.length > 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                {tabUsage.browser_tabs.length} tab(s) found but no duration tracked yet
              </p>
            )}
          </div>
        )}
      </div>

      {/* Employee Timeline Section */}
      <div className="mt-6">
        <EmployeeTimelineComponent timelines={timeline} shiftStartHour={shiftHours.start} shiftEndHour={shiftHours.end} />
      </div>
    </div>
  )
}
