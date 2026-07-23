import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Users, Activity, UserX, Clock, AppWindow, Globe, LayoutDashboard, GaugeCircle, Download, Trophy, PauseCircle } from 'lucide-react'
import { analyticsService, employeeService, screenshotService, EmployeeSummary, ApplicationUsage, BrowserTabUsage, EmployeeTimeline, Screenshot, TeamOverview, ALL_EMPLOYEES } from '../services/api'
import { websocketService } from '../services/websocket'
import { formatTime, formatHMS, formatWorkTime, getTodayLocalDate } from '../utils/time'
import { useChartTheme } from '../utils/chartTheme'
import { downloadCsv } from '../utils/csv'
import {
  DASHBOARD_DATA_REFRESH_MS,
  DASHBOARD_PRESENCE_REFRESH_MS,
  readDashboardCache,
  writeDashboardCache,
} from '../services/dashboardCache'
import EmployeeTimelineComponent from '../components/EmployeeTimeline'
import ThemedSelect from '../components/ThemedSelect'
import DateRangeFilter from '../components/DateRangeFilter'
import MetricDetailsModal, { MetricEmployeeRow, MetricTone } from '../components/MetricDetailsModal'
import Pagination, { usePagination } from '../components/Pagination'
import BrowserUsageBreakdown from '../components/BrowserUsageBreakdown'
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

interface TimelineCacheValue {
  employees: EmployeeTimeline[]
  shiftHours: { start: number; end: number }
}

const cacheKey = (section: string, startDate?: string, endDate?: string, employee?: string) =>
  ['dashboard', section, startDate, endDate, employee].filter(Boolean).join(':')

export default function DashboardPage() {
  type DashboardMetric = 'total' | 'online' | 'inactive' | 'paused' | 'work'
  const today = getTodayLocalDate()
  const initialCache = useRef({
    employees: readDashboardCache<EmployeeSummary[]>(cacheKey('employees')),
    overview: readDashboardCache<TeamOverview>(cacheKey('overview', today, today)),
    timeline: readDashboardCache<TimelineCacheValue>(cacheKey('timeline', today, today)),
    screenshots: readDashboardCache<Screenshot[]>(cacheKey('screenshots', today, today)),
    appUsage: readDashboardCache<ApplicationUsage>(cacheKey('applications', today, today, ALL_EMPLOYEES)),
    tabUsage: readDashboardCache<BrowserTabUsage>(cacheKey('browser-tabs', today, today, ALL_EMPLOYEES)),
  }).current
  const [employees, setEmployees] = useState<EmployeeSummary[]>(() => initialCache.employees?.data ?? [])
  const [appUsage, setAppUsage] = useState<ApplicationUsage | null>(() => initialCache.appUsage?.data ?? null)
  const [tabUsage, setTabUsage] = useState<BrowserTabUsage | null>(() => initialCache.tabUsage?.data ?? null)
  const [overview, setOverview] = useState<TeamOverview | null>(() => initialCache.overview?.data ?? null)
  const [timeline, setTimeline] = useState<EmployeeTimeline[]>(() => initialCache.timeline?.data.employees ?? [])
  const [shiftHours, setShiftHours] = useState(() => initialCache.timeline?.data.shiftHours ?? { start: 9, end: 20 })
  const [dayScreens, setDayScreens] = useState<Screenshot[]>(() => initialCache.screenshots?.data ?? [])
  const [loading, setLoading] = useState(() => !initialCache.employees)
  const [animateOnMount] = useState(() => !initialCache.employees)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Math.max(
    0,
    ...Object.values(initialCache).map((entry) => entry?.updatedAt ?? 0),
  ))
  const [activeMetric, setActiveMetric] = useState<DashboardMetric | null>(null)
  const presenceRefreshTimer = useRef<number | null>(null)
  // One global employee + date range drives BOTH the application-usage and
  // browser-tab-usage panels (previously each card had its own duplicate filters).
  // Defaults to the "All Employees" aggregate (ALL_EMPLOYEES).
  const [selectedEmployee, setSelectedEmployee] = useState<string>(ALL_EMPLOYEES)
  const ct = useChartTheme()

  // Date range states - use local timezone
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)

  useEffect(() => {
    loadEmployees()
    websocketService.connect()
    const presenceTimer = window.setInterval(loadEmployees, DASHBOARD_PRESENCE_REFRESH_MS)
    return () => window.clearInterval(presenceTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleUpdate = () => {
      // A client heartbeat can emit many employee_update events close together.
      // Previously every event launched six database-heavy requests, creating a
      // request storm that kept the dashboard in a permanent loading backlog.
      // Coalesce those events and refresh only lightweight presence here; the
      // range data is refreshed by its own filter effect.
      if (presenceRefreshTimer.current !== null) return
      presenceRefreshTimer.current = window.setTimeout(() => {
        presenceRefreshTimer.current = null
        loadEmployees()
      }, 2_000)
    }

    websocketService.on('employee_update', handleUpdate)

    return () => {
      websocketService.off('employee_update', handleUpdate)
      if (presenceRefreshTimer.current !== null) {
        window.clearTimeout(presenceRefreshTimer.current)
        presenceRefreshTimer.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee, startDate, endDate])

  useEffect(() => {
    const refreshRangeData = () => {
      loadOverview(startDate, endDate)
      loadTimeline(startDate, endDate)
      loadDayScreens(startDate, endDate)
      if (selectedEmployee) {
        loadAppUsage(selectedEmployee, startDate, endDate)
        loadTabUsage(selectedEmployee, startDate, endDate)
      }
    }

    refreshRangeData()
    const dataTimer = window.setInterval(refreshRangeData, DASHBOARD_DATA_REFRESH_MS)
    return () => window.clearInterval(dataTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee, startDate, endDate])

  const loadEmployees = async () => {
    try {
      const data = await employeeService.getAll()
      const cached = writeDashboardCache(cacheKey('employees'), data)
      setEmployees(data)
      setLastUpdatedAt(cached.updatedAt)
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
      const data = await analyticsService.getOverview(rangeStart, rangeEnd)
      const cached = writeDashboardCache(cacheKey('overview', rangeStart, rangeEnd), data)
      setOverview(data)
      setLastUpdatedAt(cached.updatedAt)
    } catch (error) {
      console.error('Failed to load range overview:', error)
      toast.error('Failed to load range summary')
    }
  }

  const loadTimeline = async (rangeStart: string, rangeEnd: string) => {
    try {
      // This card is a daily, one-row-per-employee timeline. For a reporting
      // range, show its most recent day; multi-day history belongs to the
      // separate weekly timeline on the employee pages.
      const data = await employeeService.getTimeline(rangeEnd)
      setTimeline(data.employees)
      const nextShiftHours = { start: data.shiftStartHour, end: data.shiftEndHour }
      setShiftHours(nextShiftHours)
      const cached = writeDashboardCache<TimelineCacheValue>(cacheKey('timeline', rangeStart, rangeEnd), {
        employees: data.employees,
        shiftHours: nextShiftHours,
      })
      setLastUpdatedAt(cached.updatedAt)
    } catch (error) {
      console.error('Failed to load timeline:', error)
    }
  }

  const loadDayScreens = async (rangeStart: string, rangeEnd: string) => {
    try {
      const data = await screenshotService.getScreenshotsWithFilters(rangeStart, rangeEnd)
      const cached = writeDashboardCache(cacheKey('screenshots', rangeStart, rangeEnd), data)
      setDayScreens(data)
      setLastUpdatedAt(cached.updatedAt)
    } catch (error) {
      console.error('Failed to load screenshots for timeline preview:', error)
    }
  }

  const screenshotsByEmployee = useMemo(() => {
    const index = new Map<string, Array<{ at: number; id: string }>>()
    for (const screenshot of dayScreens) {
      if (!screenshot.employee_name) continue
      const entry = { at: new Date(screenshot.captured_at).getTime(), id: screenshot.id }
      const bucket = index.get(screenshot.employee_name)
      if (bucket) bucket.push(entry)
      else index.set(screenshot.employee_name, [entry])
    }
    for (const bucket of index.values()) bucket.sort((a, b) => a.at - b.at)
    return index
  }, [dayScreens])

  const screenshotLookup = useCallback((employeeName: string, isoTime: string): string | null => {
    const shots = screenshotsByEmployee.get(employeeName)
    if (!shots?.length) return null
    const target = new Date(isoTime).getTime()
    let low = 0
    let high = shots.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (shots[mid].at < target) low = mid + 1
      else high = mid
    }
    const candidates = [shots[low - 1], shots[low]].filter(Boolean)
    const best = candidates.reduce((closest, shot) =>
      !closest || Math.abs(shot.at - target) < Math.abs(closest.at - target) ? shot : closest
    , undefined as { at: number; id: string } | undefined)
    return best && Math.abs(best.at - target) <= 30 * 60 * 1000
      ? screenshotService.getScreenshotUrl(best.id)
      : null
  }, [screenshotsByEmployee])

  const loadAppUsage = async (name: string, startDate: string, endDate: string) => {
    try {
      const data = await employeeService.getApplicationUsage(name, 'today', startDate, endDate)
      const cached = writeDashboardCache(cacheKey('applications', startDate, endDate, name), data)
      setAppUsage(data)
      setLastUpdatedAt(cached.updatedAt)
    } catch (error) {
      console.error('Failed to load application usage:', error)
    }
  }

  const loadTabUsage = async (name: string, startDate: string, endDate: string) => {
    try {
      const data = await employeeService.getBrowserTabUsage(name, 'today', startDate, endDate)
      const cached = writeDashboardCache(cacheKey('browser-tabs', startDate, endDate, name), data)
      setTabUsage(data)
      setLastUpdatedAt(cached.updatedAt)
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
    offline: employees.filter((employee) => employee.status === 'idle' || employee.status === 'offline').length,
    paused: employees.filter((employee) => employee.status === 'paused').length,
    totalWorkTime: overview?.total_work_seconds ?? 0,
  }

  const onlineEmployees = useMemo(() => employees.filter((employee) => employee.status === 'active'), [employees])
  const onlinePagination = usePagination(onlineEmployees, 6)
  const rangeEmployees = new Map((overview?.employees || []).map((employee) => [employee.employee_name, employee]))
  const chartColors = ct.palette || []

  const leaderboard = [...(overview?.employees || [])]
    .filter((e) => e.work_seconds > 0)
    .sort((a, b) => b.work_seconds - a.work_seconds)
    .slice(0, 5)

  const metricRows = useMemo<MetricEmployeeRow[]>(() => employees.map((employee) => {
    const range = rangeEmployees.get(employee.name)
    return {
      name: employee.name,
      status: employee.status,
      workSeconds: range?.work_seconds ?? employee.work_time_today,
      idleSeconds: range?.idle_seconds ?? employee.idle_time_today,
      lastUpdate: employee.last_update,
      location: employee.location ? [employee.location.city, employee.location.state].filter(Boolean).join(', ') : undefined,
    }
  }), [employees, rangeEmployees])

  const metricConfig: Record<DashboardMetric, {
    title: string
    eyebrow: string
    headline: string
    description: string
    tone: MetricTone
    rows: MetricEmployeeRow[]
  }> = {
    total: {
      title: 'Registered workforce', eyebrow: 'Total employees', headline: String(stats.total), tone: 'primary',
      description: `A complete workforce breakdown for ${startDate === endDate ? startDate : `${startDate} to ${endDate}`}.`,
      rows: metricRows,
    },
    online: {
      title: 'Employees online now', eyebrow: 'Live presence', headline: String(stats.online), tone: 'success',
      description: 'Currently connected employees with their work, idle time, location, and latest heartbeat.',
      rows: metricRows.filter((row) => row.status === 'active'),
    },
    inactive: {
      title: 'Offline and idle employees', eyebrow: 'Needs attention', headline: String(stats.offline), tone: 'danger',
      description: 'Employees who are idle or disconnected, ordered by tracked work time for quick operational review.',
      rows: metricRows.filter((row) => row.status === 'idle' || row.status === 'offline'),
    },
    paused: {
      title: 'Paused monitoring', eyebrow: 'Client connected', headline: String(stats.paused), tone: 'danger',
      description: 'Employees who remain connected but have deliberately paused activity collection.',
      rows: metricRows.filter((row) => row.status === 'paused'),
    },
    work: {
      title: 'Team work-time analysis', eyebrow: 'Tracked effort', headline: formatWorkTime(stats.totalWorkTime), tone: 'warning',
      description: 'Work-time ranking and employee-level activity totals for the selected reporting range.',
      rows: metricRows,
    },
  }

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
      ['Browser', 'Tab title', 'URL', 'Seconds', 'Time'],
      ...tabUsage.browser_tabs.map((t) => [t.browser || 'Unknown', t.title, t.url || '', t.duration, formatTime(t.duration)]),
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
      animateOnMount={animateOnMount}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div title="Presence refreshes every 30 seconds; dashboard analytics refresh every 60 seconds.">
            <LiveBadge
              label={lastUpdatedAt ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live feed'}
              tone="signal"
            />
          </div>
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
      <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5" animateOnMount={animateOnMount}>
        <StatTile
          label="Total Employees"
          numeric={stats.total}
          icon={Users}
          tone="primary"
          hint="Registered workforce"
          onClick={() => setActiveMetric('total')}
        />
        <StatTile
          label="Online"
          numeric={stats.online}
          icon={Activity}
          tone="success"
          hint="Currently active"
          onClick={() => setActiveMetric('online')}
        />
        <StatTile
          label="Offline / Idle"
          numeric={stats.offline}
          icon={UserX}
          tone="danger"
          hint="Not active now"
          onClick={() => setActiveMetric('inactive')}
        />
        <StatTile
          label="Paused"
          numeric={stats.paused}
          icon={PauseCircle}
          tone="danger"
          hint="Monitoring paused"
          onClick={() => setActiveMetric('paused')}
        />
        <StatTile
          label="Total Work Time"
          value={formatWorkTime(stats.totalWorkTime)}
          icon={Clock}
          tone="warning"
          hint="Across all employees today"
          onClick={() => setActiveMetric('work')}
        />
      </Stagger>

      {/* Presence + Leaderboard side by side */}
      <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-2" animateOnMount={animateOnMount}>
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
              {onlinePagination.pageItems.map((employee) => (
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
        <Pagination
          page={onlinePagination.page}
          pageSize={onlinePagination.pageSize}
          totalItems={onlineEmployees.length}
          onPageChange={onlinePagination.setPage}
          onPageSizeChange={onlinePagination.setPageSize}
          itemLabel="online employees"
        />
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
      <Stagger className="grid grid-cols-1 gap-4 2xl:grid-cols-2" animateOnMount={animateOnMount}>
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
                        isAnimationActive={false}
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
              <BrowserUsageBreakdown tabs={tabUsage.browser_tabs} />
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
      {activeMetric && (
        <MetricDetailsModal
          open
          onClose={() => setActiveMetric(null)}
          populationSize={metricRows.length}
          {...metricConfig[activeMetric]}
        />
      )}
    </PageShell>
  )
}
