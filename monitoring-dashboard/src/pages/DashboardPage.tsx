import { useState, useEffect } from 'react'
import { Users, Activity, UserX, Clock, AppWindow, Globe, LayoutDashboard, GaugeCircle, Download, Trophy } from 'lucide-react'
import { analyticsService, employeeService, screenshotService, EmployeeSummary, ApplicationUsage, BrowserTabUsage, EmployeeTimeline, Screenshot, TeamOverview, ALL_EMPLOYEES } from '../services/api'
import { websocketService } from '../services/websocket'
import { formatTime, formatHMS, formatWorkTime, getTodayLocalDate } from '../utils/time'
import { useChartTheme } from '../utils/chartTheme'
import { downloadCsv } from '../utils/csv'
import EmployeeTimelineComponent from '../components/EmployeeTimeline'
import ThemedSelect from '../components/ThemedSelect'
import DateRangeFilter from '../components/DateRangeFilter'
import toast from 'react-hot-toast'
import {
  PageShell,
  MotionCard,
  Stagger,
  StatTile,
  SectionHeader,
  LiveBadge,
  Skeleton,
  SkeletonCard,
} from '../components/ui'
import { motion } from 'framer-motion'
import { staggerContainer, riseItem } from '../components/ui/motion'
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
  const [overview, setOverview] = useState<TeamOverview | null>(null)
  const [timeline, setTimeline] = useState<EmployeeTimeline[]>([])
  const [shiftHours, setShiftHours] = useState({ start: 9, end: 20 })
  const [dayScreens, setDayScreens] = useState<Screenshot[]>([])
  const [loading, setLoading] = useState(true)
  // One global employee + date range drives BOTH the application-usage and
  // browser-tab-usage panels (previously each card had its own duplicate filters).
  // Defaults to the "All Employees" aggregate (ALL_EMPLOYEES).
  const [selectedEmployee, setSelectedEmployee] = useState<string>(ALL_EMPLOYEES)
  const ct = useChartTheme()

  // Date range states - use local timezone
  const today = getTodayLocalDate()
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)

  useEffect(() => {
    loadEmployees()
    websocketService.connect()
    const presenceTimer = window.setInterval(loadEmployees, 30_000)
    return () => window.clearInterval(presenceTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleUpdate = () => {
      loadEmployees()
      loadOverview(startDate, endDate)
      loadTimeline(startDate, endDate)
      loadDayScreens(startDate, endDate)
      if (selectedEmployee) {
        loadAppUsage(selectedEmployee, startDate, endDate)
        loadTabUsage(selectedEmployee, startDate, endDate)
      }
    }

    websocketService.on('employee_update', handleUpdate)

    return () => {
      websocketService.off('employee_update', handleUpdate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee, startDate, endDate])

  useEffect(() => {
    loadOverview(startDate, endDate)
    loadTimeline(startDate, endDate)
    loadDayScreens(startDate, endDate)
    if (selectedEmployee) {
      loadAppUsage(selectedEmployee, startDate, endDate)
      loadTabUsage(selectedEmployee, startDate, endDate)
    }
  }, [selectedEmployee, startDate, endDate])

  const loadEmployees = async () => {
    try {
      const data = await employeeService.getAll()
      setEmployees(data)
      if (data.length > 0 && !selectedEmployee) {
        setSelectedEmployee(data[0].name)
      }
    } catch (error) {
      toast.error('Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  const loadOverview = async (rangeStart: string, rangeEnd: string) => {
    try {
      setOverview(await analyticsService.getOverview(rangeStart, rangeEnd))
    } catch (error) {
      console.error('Failed to load range overview:', error)
      toast.error('Failed to load range summary')
    }
  }

  const loadTimeline = async (rangeStart: string, rangeEnd: string) => {
    try {
      const data = await employeeService.getTimeline(rangeStart, rangeStart === rangeEnd ? undefined : rangeEnd)
      setTimeline(data.employees)
      setShiftHours({ start: data.shiftStartHour, end: data.shiftEndHour })
    } catch (error) {
      console.error('Failed to load timeline:', error)
    }
  }

  const loadDayScreens = async (rangeStart: string, rangeEnd: string) => {
    try {
      setDayScreens(await screenshotService.getScreenshotsWithFilters(rangeStart, rangeEnd))
    } catch (error) {
      console.error('Failed to load screenshots for timeline preview:', error)
    }
  }

  const screenshotLookup = (employeeName: string, isoTime: string): string | null => {
    const target = new Date(isoTime).getTime()
    let best: Screenshot | null = null
    let bestDiff = Infinity
    for (const screenshot of dayScreens) {
      if (screenshot.employee_name && screenshot.employee_name !== employeeName) continue
      const diff = Math.abs(new Date(screenshot.captured_at).getTime() - target)
      if (diff < bestDiff) {
        bestDiff = diff
        best = screenshot
      }
    }
    return best && bestDiff <= 30 * 60 * 1000 ? screenshotService.getScreenshotUrl(best.id) : null
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
    total: overview?.total_employees ?? employees.length,
    online: employees.filter((employee) => employee.status === 'active').length,
    offline: employees.filter((employee) => employee.status !== 'active').length,
    totalWorkTime: overview?.total_work_seconds ?? 0,
  }

  const onlineEmployees = employees.filter((employee) => employee.status === 'active')
  const rangeEmployees = new Map((overview?.employees || []).map((employee) => [employee.employee_name, employee]))
  const chartColors = ct.palette || []

  const leaderboard = [...(overview?.employees || [])]
    .filter((e) => e.work_seconds > 0)
    .sort((a, b) => b.work_seconds - a.work_seconds)
    .slice(0, 5)

  const exportName = selectedEmployee === ALL_EMPLOYEES ? 'AllEmployees' : selectedEmployee

  const exportAppUsage = () => {
    if (!appUsage?.applications?.length) return
    downloadCsv(`AppUsage_${exportName}_${startDate}`, [
      ['Application', 'Seconds', 'Time'],
      ...appUsage.applications.map((a) => [a.name, a.duration, formatTime(a.duration)]),
    ])
    toast.success('Application usage exported')
  }

  const exportTabUsage = () => {
    if (!tabUsage?.browser_tabs?.length) return
    downloadCsv(`BrowserTabs_${exportName}_${startDate}`, [
      ['Tab title', 'Seconds', 'Time'],
      ...tabUsage.browser_tabs.map((t) => [t.title, t.duration, formatTime(t.duration)]),
    ])
    toast.success('Browser tab usage exported')
  }

  // Friendly label for the currently-selected employee (or the aggregate).
  const selectedLabel = selectedEmployee === ALL_EMPLOYEES ? 'All Employees' : selectedEmployee
  const selectClass = 'dashboard-control min-w-[190px] px-3 py-2 text-[13px] font-semibold shadow-sm hover:border-[var(--ring)]'
  const exportBtn = 'flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted-foreground)] transition hover:border-[var(--ring)] hover:text-[var(--foreground)] disabled:opacity-40'

  if (loading) {
    return (
      <div className="app-page">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="ms-card p-5">
          <Skeleton className="h-4 w-40" />
          <div className="mt-4 space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="ms-card p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-[240px] w-full" />
          </div>
          <div className="ms-card p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-[240px] w-full" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <PageShell
      eyebrow="Command center"
      title="Operations Overview"
      description="Real-time employee presence, work totals, application activity, and browser usage."
      icon={LayoutDashboard}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <LiveBadge label="Live feed" tone="signal" />
          {employees.length > 0 && (
            <>
              <div className="flex items-center rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_80%,transparent)] px-2.5 py-1.5">
                <ThemedSelect
                  value={selectedEmployee}
                  onChange={setSelectedEmployee}
                  options={[
                    { value: ALL_EMPLOYEES, label: 'All Employees' },
                    ...employees.map((emp) => ({ value: emp.name, label: emp.name })),
                  ]}
                  className={selectClass}
                />
              </div>
              <DateRangeFilter
                startDate={startDate}
                endDate={endDate}
                onChange={(s, e) => {
                  setStartDate(s)
                  setEndDate(e)
                }}
              />
            </>
          )}
        </div>
      }
    >
      {/* KPI row */}
      <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total Employees"
          numeric={stats.total}
          icon={Users}
          tone="primary"
          hint="Registered workforce"
        />
        <StatTile
          label="Online"
          numeric={stats.online}
          icon={Activity}
          tone="success"
          hint="Currently active"
        />
        <StatTile
          label="Offline / Idle"
          numeric={stats.offline}
          icon={UserX}
          tone="danger"
          hint="Not active now"
        />
        <StatTile
          label="Total Work Time"
          value={formatWorkTime(stats.totalWorkTime)}
          icon={Clock}
          tone="warning"
          hint="Across all employees today"
        />
      </Stagger>

      {/* Presence + Leaderboard side by side */}
      <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Employees tracked in the selected range */}
      <MotionCard className="p-5">
        <SectionHeader
          eyebrow="Presence"
          title="Online Employees"
          icon={GaugeCircle}
          action={<LiveBadge label={`${onlineEmployees.length} active`} tone="success" />}
        />
        <div className="max-h-[320px] space-y-2.5 overflow-y-auto scrollbar-hide pr-1">
          {onlineEmployees.length === 0 ? (
            <p className="py-8 text-center text-[var(--muted-foreground)]">No employees online</p>
          ) : (
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2.5">
              {onlineEmployees.map((employee) => (
                <motion.div
                  key={employee.name}
                  variants={riseItem}
                  whileHover={{ y: -3 }}
                  className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_70%,transparent)] p-3 transition-colors hover:border-[color-mix(in_oklab,var(--success)_45%,var(--border))] hover:bg-[var(--accent)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--primary)_88%,transparent)] font-semibold text-[var(--primary-foreground)] shadow-[0_8px_20px_-12px_var(--primary)]">
                      {employee.name.charAt(0).toUpperCase()}
                      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[var(--card)] bg-[var(--success)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--foreground)]">{employee.name}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Work: {formatHMS(rangeEmployees.get(employee.name)?.work_seconds ?? 0)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="ms-live-dot" style={{ background: 'var(--success)' }} />
                    <span className="text-xs font-semibold text-[var(--success)]">Active</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </MotionCard>

      {/* Productivity leaderboard */}
      <MotionCard className="p-5">
        <SectionHeader
          eyebrow="Ranking"
          title="Today's Leaderboard"
          icon={Trophy}
          action={<LiveBadge label="Live" tone="signal" />}
        />
        {leaderboard.length === 0 ? (
          <p className="py-8 text-center text-[var(--muted-foreground)]">No tracked work yet today</p>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2.5">
            {leaderboard.map((e, i) => {
              const max = leaderboard[0].work_seconds || 1
              const pct = Math.round((e.work_seconds / max) * 100)
              const medal = ['var(--warning)', 'var(--muted-foreground)', 'color-mix(in oklab, var(--warning) 60%, var(--danger))'][i]
              return (
                <motion.div key={e.employee_name} variants={riseItem} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_60%,transparent)] p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold"
                        style={{ background: medal ? `color-mix(in oklab, ${medal} 22%, transparent)` : 'var(--muted)', color: medal || 'var(--muted-foreground)' }}
                      >
                        {i + 1}
                      </span>
                      <span className="font-semibold text-[var(--foreground)]">{e.employee_name}</span>
                    </div>
                    <span className="ms-num text-sm font-semibold text-[var(--foreground)]">{formatWorkTime(e.work_seconds)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                    <motion.div
                      className="h-2 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--signal)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
                    />
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </MotionCard>
      </Stagger>

      {/* Application + Browser usage side by side on large screens */}
      <Stagger className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        {/* Application Usage */}
        <MotionCard className="p-5">
          <SectionHeader
            eyebrow="Activity"
            title="Application Usage"
            icon={AppWindow}
            action={
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--muted-foreground)]">{selectedLabel}</span>
                <button onClick={exportAppUsage} disabled={!appUsage?.applications?.length} className={exportBtn} title="Export CSV">
                  <Download size={14} />
                </button>
              </div>
            }
          />

          {appUsage && appUsage.applications.length > 0 ? (
            <>
              <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_oklab,var(--accent)_70%,transparent)] p-3">
                <p className="text-[13px] font-semibold text-[var(--accent-foreground)]">
                  Total Application Time:{' '}
                  <span className="ms-num text-[var(--primary)]">
                    {formatHMS(appUsage.applications.reduce((sum, app) => sum + app.duration, 0))}
                  </span>
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={appUsage.applications.filter(app => app.duration > 0).slice(0, 10)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={false}
                        innerRadius={52}
                        outerRadius={84}
                        paddingAngle={2}
                        cornerRadius={4}
                        dataKey="duration"
                        nameKey="name"
                        stroke="var(--card)"
                        strokeWidth={2}
                      >
                        {appUsage.applications.filter(app => app.duration > 0).slice(0, 10).map((_app, idx) => {
                          return <Cell key={`cell-${idx}`} fill={chartColors[idx % chartColors.length]} />;
                        })}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: any) => [formatHMS(value), name]}
                        {...ct.tooltip}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="max-h-[300px] space-y-3 overflow-y-auto custom-scrollbar">
                  {appUsage.applications.filter(app => app.duration > 0).slice(0, 15).map((app, idx) => {
                    const barColor = chartColors[idx % chartColors.length];

                    return (
                      <div key={app.name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="max-w-[200px] truncate font-semibold text-[var(--foreground)]">
                            {app.name}
                          </span>
                          <span className="ms-num text-[var(--muted-foreground)]">
                            {formatHMS(app.duration)}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                          <motion.div
                            className="h-2 rounded-full"
                            style={{ backgroundColor: barColor }}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(app.percentage, 100)}%` }}
                            transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-[var(--muted-foreground)]">
              No application usage data available
            </p>
          )}
        </MotionCard>

        {/* Browser Tab Usage */}
        <MotionCard className="p-5">
          <SectionHeader
            eyebrow="Activity"
            title="Browser Tab Usage"
            icon={Globe}
            action={
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--muted-foreground)]">{selectedLabel}</span>
                <button onClick={exportTabUsage} disabled={!tabUsage?.browser_tabs?.length} className={exportBtn} title="Export CSV">
                  <Download size={14} />
                </button>
              </div>
            }
          />

          {tabUsage && tabUsage.browser_tabs && tabUsage.browser_tabs.filter(tab => tab.duration > 0).length > 0 ? (
            <>
              <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_oklab,var(--accent)_70%,transparent)] p-3">
                <p className="text-[13px] font-semibold text-[var(--accent-foreground)]">
                  Total Browser Tab Time:{' '}
                  <span className="ms-num text-[var(--primary)]">
                    {formatHMS(tabUsage.browser_tabs.reduce((sum, tab) => sum + tab.duration, 0))}
                  </span>
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={tabUsage.browser_tabs.filter(tab => tab.duration > 0).slice(0, 10)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={false}
                        innerRadius={52}
                        outerRadius={84}
                        paddingAngle={2}
                        cornerRadius={4}
                        dataKey="duration"
                        nameKey="title"
                        stroke="var(--card)"
                        strokeWidth={2}
                      >
                        {tabUsage.browser_tabs.filter(tab => tab.duration > 0).slice(0, 10).map((_tab, idx) => {
                          return <Cell key={`cell-${idx}`} fill={chartColors[idx % chartColors.length]} />;
                        })}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: any) => [formatHMS(value), name]}
                        {...ct.tooltip}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="max-h-[300px] space-y-3 overflow-y-auto custom-scrollbar">
                  {tabUsage.browser_tabs.filter(tab => tab.duration > 0).slice(0, 15).map((tab, idx) => {
                    const barColor = chartColors[idx % chartColors.length];

                    return (
                      <div key={`${tab.title}-${idx}`} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="max-w-[200px] truncate font-semibold text-[var(--foreground)]" title={tab.title}>
                            {tab.title}
                          </span>
                          <span className="ms-num text-[var(--muted-foreground)]">
                            {formatHMS(tab.duration)}
                          </span>
                        </div>
                        {tab.url && (
                          <p className="truncate text-xs text-[var(--muted-foreground)]" title={tab.url}>
                            {tab.url}
                          </p>
                        )}
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                          <motion.div
                            className="h-2 rounded-full"
                            style={{ backgroundColor: barColor }}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(tab.percentage, 100)}%` }}
                            transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center">
              <p className="text-[var(--muted-foreground)]">
                {!tabUsage ? 'Loading browser tab usage...' :
                 !tabUsage.browser_tabs ? 'No browser tab data available' :
                 'No browser tabs with tracked duration'}
              </p>
              {tabUsage && tabUsage.browser_tabs && tabUsage.browser_tabs.length > 0 && (
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  {tabUsage.browser_tabs.length} tab(s) found but no duration tracked yet
                </p>
              )}
            </div>
          )}
        </MotionCard>
      </Stagger>

      {/* Employee Timeline (self-carded component — wrap in motion for the stagger entrance) */}
      <motion.div variants={riseItem}>
        <EmployeeTimelineComponent timelines={timeline} shiftStartHour={shiftHours.start} shiftEndHour={shiftHours.end} screenshotLookup={screenshotLookup} />
      </motion.div>
    </PageShell>
  )
}
