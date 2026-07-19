import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Monitor,
  Globe,
  Calendar,
  ShieldCheck,
  Activity,
  Gauge,
  MousePointerClick,
  Keyboard,
  AlertTriangle,
  Cpu,
  HardDrive,
  Server,
  Image as ImageIcon,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { employeeService, EmployeeDetail } from '../services/api'
import { formatDuration, formatDateTime, getTodayLocalDate, formatClock, formatHMS, formatTimeIntelligent, zonedHoursSinceMidnight, formatHourLabel } from '../utils/time'
import { screenshotService } from '../services/api'
import DateRangeFilter from '../components/DateRangeFilter'
import DurationChartTooltip from '../components/DurationChartTooltip'
import TimelineTooltip, { TimelineTooltipData, computeTimelineTooltip } from '../components/TimelineTooltip'
import { useChartTheme, axisProps } from '../utils/chartTheme'
import toast from 'react-hot-toast'
import {
  PageShell,
  MotionCard,
  Card,
  SectionHeader,
  StatTile,
  Skeleton,
  SkeletonCard,
  Portal,
} from '../components/ui'
import { staggerContainer, popItem } from '../components/ui/motion'
import {
  AreaChart,
  Area,
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
  // Index of the screenshot open in the lightbox (null = closed). Index-based so
  // we can navigate prev/next like the Evidence Vault.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  // Floating hover card for the weekly timeline (identical to the Command Center).
  const [timelineTooltip, setTimelineTooltip] = useState<TimelineTooltipData | null>(null)
  const ct = useChartTheme()

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

  // Keyboard navigation for the screenshot lightbox (← → to move, Esc to close).
  useEffect(() => {
    if (selectedIndex === null) return
    const total = employee?.recent_screenshots.length ?? 0
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIndex(null)
      else if (e.key === 'ArrowRight') setSelectedIndex((i) => (i === null ? i : Math.min(total - 1, i + 1)))
      else if (e.key === 'ArrowLeft') setSelectedIndex((i) => (i === null ? i : Math.max(0, i - 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIndex, employee])

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

  // Given an ISO instant, return the URL of the screenshot captured nearest that
  // time (within ~30 min) so the timeline hover card can show matching evidence,
  // exactly like the Command Center.
  const screenshotLookup = (_employeeName: string, isoTime: string): string | null => {
    const shots = employee?.recent_screenshots ?? []
    if (shots.length === 0) return null
    const target = new Date(isoTime).getTime()
    let best: { id: string; diff: number } | null = null
    for (const s of shots) {
      const diff = Math.abs(new Date(s.captured_at).getTime() - target)
      if (!best || diff < best.diff) best = { id: s.id, diff }
    }
    if (!best || best.diff > 30 * 60 * 1000) return null
    return screenshotService.getScreenshotUrl(best.id)
  }

  const backLink = (
    <Link
      to="/employees"
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_80%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--muted-foreground)] outline-none transition-colors hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
    >
      <ArrowLeft size={16} />
      Back to Employees
    </Link>
  )

  if (loading) {
    return (
      <PageShell
        eyebrow="Operative profile"
        title="Loading…"
        description="Fetching activity, integrity, and system telemetry."
        icon={Activity}
        actions={backLink}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <Card className="p-5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-[280px] w-full" />
        </Card>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-4 h-[240px] w-full" />
          </Card>
          <Card className="p-5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-4 h-[240px] w-full" />
          </Card>
        </div>
      </PageShell>
    )
  }

  if (!employee) {
    return (
      <PageShell
        eyebrow="Operative profile"
        title="Employee not found"
        icon={Activity}
        actions={backLink}
      >
        <Card className="p-10">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <p className="text-[var(--muted-foreground)]">Employee not found</p>
            <Link
              to="/employees"
              className="text-[var(--primary)] hover:underline"
            >
              Back to Employees
            </Link>
          </div>
        </Card>
      </PageShell>
    )
  }

  // Prepare chart data — labels use the business timezone so they match the
  // employee's local wall clock regardless of where the dashboard is viewed.
  const activityData = employee.activity_history.slice(-24).map((item) => ({
    time: formatClock(item.timestamp),
    work: item.work_seconds,
    idle: item.idle_seconds,
  }))

  // Sort applications by duration (highest to lowest) - show ALL apps
  const sortedApps = [...employee.current_applications]
    .sort((a, b) => b.duration - a.duration)

  const COLORS = ct.palette || []

  const appData = sortedApps.filter(app => app.duration > 0).slice(0, 5).map((app, index) => ({
    name: app.name,
    value: app.duration,
    color: COLORS[index % COLORS.length],
  }))

  // Sort browser tabs by duration (highest to lowest)
  const sortedTabs = [...employee.current_browser_tabs]
    .sort((a, b) => b.duration - a.duration)

  const tabData = sortedTabs.filter(tab => tab.duration > 0).slice(0, 5).map((tab, index) => ({
    name: tab.title.length > 30 ? tab.title.substring(0, 30) + '...' : tab.title,
    value: tab.duration,
    color: COLORS[index % COLORS.length],
  }))

  const rangeLabel =
    startDate === endDate
      ? new Date(startDate).toLocaleDateString()
      : `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`

  const scoreTone = (score: number): 'success' | 'warning' | 'danger' =>
    score >= 70 ? 'success' : score >= 40 ? 'warning' : 'danger'

  return (
    <PageShell
      eyebrow="Operative profile"
      title={employee.name}
      description={
        employee.location
          ? `Employee Details — ${employee.location.city}, ${employee.location.state}`
          : 'Employee Details'
      }
      icon={Activity}
      actions={
        <>
          {backLink}
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onChange={(s, e) => {
              setStartDate(s)
              setEndDate(e)
            }}
          />
        </>
      }
    >
      {/* Productivity Summary */}
      {employee.productivity && (
        <MotionCard className="p-5">
          <SectionHeader eyebrow="Output signal" title="Productivity" icon={Gauge} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <StatTile
              label="Productivity Score"
              numeric={employee.productivity.score}
              suffix="%"
              icon={Gauge}
              tone={scoreTone(employee.productivity.score)}
            />
            <StatTile
              label="Productive"
              value={formatDuration(employee.productivity.category_seconds.productive)}
              tone="success"
            />
            <StatTile
              label="Neutral"
              value={formatDuration(employee.productivity.category_seconds.neutral)}
              tone="signal"
            />
            <StatTile
              label="Unproductive"
              value={formatDuration(employee.productivity.category_seconds.unproductive)}
              tone="danger"
            />
          </div>

          {/* Website usage */}
          {employee.website_usage && employee.website_usage.length > 0 && (
            <div className="mt-6">
              <p className="ms-eyebrow mb-3">Top Websites</p>
              <div className="space-y-1">
                {employee.website_usage.slice(0, 6).map((site) => (
                  <div
                    key={site.domain}
                    className="flex items-center justify-between border-b border-[var(--border)] py-1.5 text-sm last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                        style={{
                          background:
                            site.category === 'productive'
                              ? 'var(--success)'
                              : site.category === 'unproductive'
                              ? 'var(--danger)'
                              : 'var(--signal)',
                        }}
                      ></span>
                      <span className="truncate text-[var(--foreground)]">{site.domain}</span>
                    </div>
                    <span className="ml-3 flex-shrink-0 text-[var(--muted-foreground)]">
                      {formatDuration(site.duration)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </MotionCard>
      )}

      {/* Effort & Genuineness (anti-cheat) */}
      {employee.integrity && (
        <MotionCard
          className="p-5"
          accent
         
        >
          <SectionHeader
            eyebrow="Anti-cheat integrity"
            title="Effort & Genuineness"
            icon={ShieldCheck}
            action={
              employee.integrity.genuineness_score < 60 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--danger)]">
                  <AlertTriangle size={13} />
                  Suspicious activity
                </span>
              ) : undefined
            }
          />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile
              label="Keystrokes / min"
              numeric={employee.integrity.keystrokes_per_min}
              icon={Keyboard}
              tone="primary"
              hint={`${employee.integrity.keystrokes} total`}
            />
            <StatTile
              label="Mouse actions / min"
              numeric={employee.integrity.mouse_activity_per_min}
              icon={MousePointerClick}
              tone="signal"
              hint={`${employee.integrity.mouse_clicks} clicks`}
            />
            <StatTile
              label="Genuineness"
              numeric={employee.integrity.genuineness_score}
              suffix="%"
              icon={ShieldCheck}
              tone={scoreTone(employee.integrity.genuineness_score)}
            />
            <StatTile
              label="Suspected fake"
              value={formatDuration(employee.integrity.suspected_fake_seconds)}
              icon={AlertTriangle}
              tone="warning"
            />
          </div>
          {employee.integrity.suspicion_reasons.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {employee.integrity.suspicion_reasons.map((r) => (
                <span
                  key={r}
                  className="rounded-md border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-2 py-1 text-xs text-[var(--danger)]"
                >
                  {r.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            Detection is privacy-safe: only counts, timing patterns, and mouse geometry are analyzed — never which keys are pressed.
          </p>
        </MotionCard>
      )}

      {/* System Information Section */}
      {systemInfo && (
        <MotionCard className="p-5">
          <SectionHeader eyebrow="Endpoint telemetry" title="System Information" icon={Monitor} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Operating System"
              value={systemInfo.osName || 'Unknown'}
              icon={Server}
              tone="primary"
              hint={systemInfo.osVersion || 'Unknown'}
            />
            <StatTile
              label="Hostname"
              value={systemInfo.hostname || 'Unknown'}
              icon={Monitor}
              tone="signal"
              hint={systemInfo.architecture || 'Unknown'}
            />
            <StatTile
              label="Processor"
              value={
                systemInfo.cpuModel && systemInfo.cpuModel.length > 20
                  ? systemInfo.cpuModel.substring(0, 20) + '...'
                  : systemInfo.cpuModel || 'Unknown'
              }
              icon={Cpu}
              tone="primary"
              hint={`${systemInfo.cpuCores || 0} Cores`}
            />
            <StatTile
              label="Memory & Storage"
              value={`${
                systemInfo.totalRamGb != null && !isNaN(systemInfo.totalRamGb)
                  ? systemInfo.totalRamGb.toFixed(1)
                  : '0.0'
              } GB RAM`}
              icon={HardDrive}
              tone="signal"
              hint={`${
                systemInfo.totalDiskGb != null && !isNaN(systemInfo.totalDiskGb)
                  ? systemInfo.totalDiskGb.toFixed(0)
                  : '0'
              } GB Disk`}
            />
          </div>
        </MotionCard>
      )}

      {/* Activity + App donut */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MotionCard className="p-5">
          <SectionHeader
            eyebrow="Work vs idle"
            title="Activity Timeline"
            icon={Activity}
            action={
              <span className="text-xs font-semibold text-[var(--muted-foreground)]">{rangeLabel}</span>
            }
          />
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart
              data={activityData}
              margin={{ top: 12, right: 8, left: -8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="edp-work-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ct.palette?.[0]} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={ct.palette?.[0]} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="edp-idle-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--warning)" stopOpacity={0.26} />
                  <stop offset="100%" stopColor="var(--warning)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={ct.grid} vertical={false} />
              <XAxis dataKey="time" {...axisProps(ct)} />
              <YAxis {...axisProps(ct)} width={54} tickFormatter={(value) => formatTimeIntelligent(Number(value))} label={{ value: 'Duration', angle: -90, position: 'insideLeft', fill: ct.axis, fontSize: 12 }} />
              <Tooltip content={<DurationChartTooltip />} cursor={{ stroke: ct.grid, strokeDasharray: '4 4' }} />
              <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Area type="monotone" dataKey="work" stroke={ct.palette?.[0]} strokeWidth={2.5} fill="url(#edp-work-fill)" name="Work Time" dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="idle" stroke="var(--warning)" strokeWidth={2.5} fill="url(#edp-idle-fill)" name="Idle Time" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </MotionCard>

        <MotionCard className="p-5">
          <SectionHeader eyebrow="Time distribution" title="Application Usage" icon={Monitor} />
          {appData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={appData}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={84}
                  paddingAngle={2}
                  cornerRadius={4}
                  dataKey="value"
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {appData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatHMS(value)} {...ct.tooltip} />
                <Legend
                  iconType="circle"
                  iconSize={9}
                  formatter={(value) => value.replace('.exe', '')}
                  wrapperStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-[var(--muted-foreground)]">
              No application data available
            </p>
          )}
        </MotionCard>
      </div>

      {/* Browser tab donut + detailed */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MotionCard className="p-5">
          <SectionHeader eyebrow="Time distribution" title="Browser Tab Usage" icon={Globe} />
          {tabData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={tabData}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={84}
                  paddingAngle={2}
                  cornerRadius={4}
                  dataKey="value"
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {tabData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatHMS(value)} {...ct.tooltip} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-[var(--muted-foreground)]">
              No browser tab data available
            </p>
          )}
        </MotionCard>

        <MotionCard className="p-5">
          <SectionHeader eyebrow="Live breakdown" title="Browser Tabs (Detailed)" icon={Globe} />
          <div className="custom-scrollbar max-h-[300px] space-y-3 overflow-y-auto">
            {sortedTabs.length === 0 ? (
              <p className="py-8 text-center text-[var(--muted-foreground)]">
                No active browser tabs
              </p>
            ) : (
              sortedTabs.map((tab, index) => {
                const maxDuration = sortedTabs[0]?.duration || 1
                const percentage = Math.max(2, (tab.duration / maxDuration) * 100)
                return (
                  <div
                    key={index}
                    className="rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_60%,transparent)] px-3.5 py-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)]" title={tab.title}>
                        {tab.title}
                      </p>
                      <span className="ms-num flex-shrink-0 text-sm tabular-nums text-[var(--muted-foreground)]">
                        {formatHMS(tab.duration)}
                      </span>
                    </div>
                    {tab.url && (
                      <p className="mb-2 truncate text-xs text-[var(--muted-foreground)]" title={tab.url}>
                        {tab.url}
                      </p>
                    )}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, var(--primary), var(--signal))' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </MotionCard>
      </div>

      {/* Current apps + app progress */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MotionCard className="p-5">
          <SectionHeader eyebrow="Foreground activity" title="Current Applications" icon={Monitor} />
          <div className="custom-scrollbar max-h-[300px] space-y-2 overflow-y-auto">
            {sortedApps.length === 0 ? (
              <p className="py-8 text-center text-[var(--muted-foreground)]">
                No active applications
              </p>
            ) : (
              sortedApps.map((app, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_60%,transparent)] px-3.5 py-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)]" title={app.name}>
                    {app.name}
                  </span>
                  <span className="ms-num flex-shrink-0 text-sm tabular-nums text-[var(--muted-foreground)]">
                    {formatHMS(app.duration)}
                  </span>
                </div>
              ))
            )}
          </div>
        </MotionCard>

        <MotionCard className="p-5">
          <SectionHeader eyebrow="Relative usage" title="Application Usage (Progress)" icon={Monitor} />
          <div className="custom-scrollbar max-h-[300px] space-y-3 overflow-y-auto">
            {sortedApps.filter(app => app.duration > 0).length === 0 ? (
              <p className="py-8 text-center text-[var(--muted-foreground)]">
                No application usage data
              </p>
            ) : (
              sortedApps.filter(app => app.duration > 0).map((app, index) => {
                const maxDuration = sortedApps[0]?.duration || 1
                const percentage = Math.max(2, (app.duration / maxDuration) * 100)
                return (
                  <div key={index} className="space-y-1.5 py-0.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)]" title={app.name.replace('.exe', '')}>
                        {app.name.replace('.exe', '')}
                      </span>
                      <span className="ms-num flex-shrink-0 text-sm tabular-nums text-[var(--muted-foreground)]">
                        {formatHMS(app.duration)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, var(--primary), var(--signal))' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </MotionCard>
      </div>

      {/* Weekly Timeline Section */}
      {weeklyTimeline && weeklyTimeline.daily_timelines && (
        <MotionCard className="p-5">
          <SectionHeader eyebrow="Shift coverage" title="Weekly Work Timeline" icon={Calendar} />

          <div className="space-y-4">
            {weeklyTimeline.daily_timelines.map((day: any, dayIndex: number) => {
              // day.date is a YYYY-MM-DD business-timezone calendar day.
              const [dy, dm, dd] = String(day.date).split('-').map((n: string) => parseInt(n, 10))
              const dayDate = new Date(dy, (dm || 1) - 1, dd || 1)
              const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              const isToday = day.date === getTodayLocalDate()

              // Shift window in business-timezone hours (9 AM to 8 PM).
              const SHIFT_START = 9
              const SHIFT_END = 20
              const SHIFT_HOURS = SHIFT_END - SHIFT_START

              const hourMarkers = Array.from({ length: SHIFT_HOURS + 1 }, (_, i) => {
                const hour = SHIFT_START + i
                const position = (i / SHIFT_HOURS) * 100
                return { hour, position }
              })

              const getSegmentPosition = (start: string, end: string) => {
                const startHours = zonedHoursSinceMidnight(start)
                const endHours = zonedHoursSinceMidnight(end)
                const left = ((startHours - SHIFT_START) / SHIFT_HOURS) * 100
                const width = ((endHours - startHours) / SHIFT_HOURS) * 100
                return { left: Math.max(0, Math.min(100, left)), width: Math.max(0.4, Math.min(100 - Math.max(0, left), width)) }
              }

              const getSegmentColor = (type: 'work' | 'idle' | 'offline') => {
                switch (type) {
                  case 'work':
                    return 'bg-[var(--primary)]'
                  case 'idle':
                    return 'bg-[var(--warning)]'
                  case 'offline':
                    return 'bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(148,163,184,0.28)_4px,rgba(148,163,184,0.28)_8px)]'
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
                <div key={dayIndex} className="border-b border-[var(--border)] pb-4 last:border-b-0">
                  {/* Day header */}
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isToday ? 'text-[var(--primary)]' : 'text-[var(--foreground)]'}`}>
                        {dayName}
                      </span>
                      {isToday && (
                        <span className="rounded-full bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] px-2 py-0.5 text-xs text-[var(--primary)]">
                          Today
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-[var(--muted-foreground)]">
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

                  {/* Timeline bar — hover shows the same rich card as the Command Center */}
                  <div
                    className="relative h-8 overflow-hidden rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_60%,transparent)]"
                    onMouseMove={(e) =>
                      setTimelineTooltip(
                        computeTimelineTooltip(
                          `${day.name || employee.name} · ${dayName}`,
                          day.segments || [],
                          day.work_time || 0,
                          day.idle_time || 0,
                          e,
                          SHIFT_START,
                          SHIFT_HOURS,
                          screenshotLookup
                        )
                      )
                    }
                    onMouseLeave={() => setTimelineTooltip(null)}
                  >
                    {day.segments && day.segments.length > 0 ? (
                      // Offline first (underneath) so solid work/idle always wins if anything overlaps.
                      [...day.segments]
                        .map((segment: any, idx: number) => ({ segment, idx }))
                        .sort((a: any, b: any) => (a.segment.type === 'offline' ? 0 : 1) - (b.segment.type === 'offline' ? 0 : 1))
                        .map(({ segment, idx }: any) => {
                        const { left, width } = getSegmentPosition(segment.start, segment.end)
                        const segmentColor = getSegmentColor(segment.type)

                        return (
                          <div
                            key={idx}
                            className={`absolute h-full ${segmentColor} transition-all`}
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                            }}
                          ></div>
                        )
                      })
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs text-[var(--muted-foreground)]">No data available on this day</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded bg-[var(--primary)]"></div>
                <span className="text-[var(--muted-foreground)]">Work</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded bg-[var(--warning)]"></div>
                <span className="text-[var(--muted-foreground)]">Idle</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded border border-[var(--border)] bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(148,163,184,0.35)_2px,rgba(148,163,184,0.35)_4px)]"></div>
                <span className="text-[var(--muted-foreground)]">Offline</span>
              </div>
            </div>
          </div>
        </MotionCard>
      )}

      {/* Shared floating timeline hover card (same as the Command Center) */}
      <TimelineTooltip tooltip={timelineTooltip} />

      {/* Recent Screenshots */}
      <MotionCard className="p-5">
        <SectionHeader eyebrow="Visual audit" title="Recent Screenshots" icon={ImageIcon} />
        {employee.recent_screenshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <ImageIcon size={28} className="text-[var(--muted-foreground)]" />
            <p className="text-sm text-[var(--muted-foreground)]">No screenshots available for this range.</p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
          >
            {employee.recent_screenshots.map((screenshot, idx) => (
              <motion.button
                key={screenshot.id}
                type="button"
                variants={popItem}
                whileHover={{ y: -4 }}
                className="group relative block overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--muted)] text-left outline-none transition-shadow duration-300 hover:shadow-[var(--shadow-lg)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                onClick={() => setSelectedIndex(idx)}
              >
                <div className="aspect-video w-full overflow-hidden">
                  <img
                    src={screenshotService.getScreenshotUrl(screenshot.id)}
                    alt="Screenshot"
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                {/* Hover: expand affordance */}
                <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Maximize2 size={14} />
                </div>
                {/* Timestamp overlaid on a bottom gradient */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6">
                  <p className="text-xs font-medium text-white/90">{formatDateTime(screenshot.captured_at)}</p>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </MotionCard>

      {selectedIndex !== null && employee.recent_screenshots[selectedIndex] && (
        <Portal>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_oklab,var(--background)_55%,transparent)] p-4 backdrop-blur-2xl"
          onClick={() => setSelectedIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
            className="relative max-h-full max-w-6xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top bar: timestamp + close */}
            <div className="absolute -top-14 left-0 right-0 flex items-center justify-between text-white">
              <div className="rounded-lg border border-white/10 bg-black/50 px-4 py-2 text-sm font-medium backdrop-blur-sm">
                {formatDateTime(employee.recent_screenshots[selectedIndex].captured_at)}
              </div>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white shadow-lg backdrop-blur-sm outline-none transition-colors hover:bg-[var(--danger)] focus-visible:ring-2 focus-visible:ring-white"
                onClick={() => setSelectedIndex(null)}
                aria-label="Close preview"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Navigation arrows */}
            {employee.recent_screenshots.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedIndex((i) => (i === null ? i : Math.max(0, i - 1))) }}
                  disabled={selectedIndex === 0}
                  aria-label="Previous screenshot"
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-4 text-white backdrop-blur-sm transition-all hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft size={26} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedIndex((i) => (i === null ? i : Math.min(employee.recent_screenshots.length - 1, i + 1))) }}
                  disabled={selectedIndex === employee.recent_screenshots.length - 1}
                  aria-label="Next screenshot"
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-4 text-white backdrop-blur-sm transition-all hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight size={26} />
                </button>
              </>
            )}

            {/* Counter */}
            {employee.recent_screenshots.length > 1 && (
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 rounded-lg border border-white/10 bg-black/50 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                {selectedIndex + 1} / {employee.recent_screenshots.length}
              </div>
            )}

            <img
              src={screenshotService.getScreenshotUrl(employee.recent_screenshots[selectedIndex].id)}
              alt="Screenshot"
              className="max-h-[90vh] max-w-full rounded-[var(--radius)] object-contain shadow-2xl ring-1 ring-white/10"
            />
          </motion.div>
        </motion.div>
        </Portal>
      )}
    </PageShell>
  )
}
