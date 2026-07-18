import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Clock,
  Gauge,
  Activity,
  AppWindow,
  Globe,
  Calendar,
  Brain,
  Flame,
  Timer,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import {
  employeeService,
  analyticsService,
  EmployeeDetail,
  ApplicationUsage,
  BrowserTabUsage,
  EmployeeTimeline,
} from '../services/api'
import {
  formatWorkTime,
  getTodayLocalDate,
  daysBetweenStr,
  formatHMS,
  zonedHoursSinceMidnight,
  formatHourLabel,
} from '../utils/time'
import EmployeeTimelineComponent from '../components/EmployeeTimeline'
import DateRangeFilter from '../components/DateRangeFilter'
import TimelineTooltip, { TimelineTooltipData, computeTimelineTooltip } from '../components/TimelineTooltip'
import { useChartTheme, axisProps } from '../utils/chartTheme'
import { MotionCard, SectionHeader, StatTile, Stagger } from '../components/ui'
import { staggerContainer, riseItem } from '../components/ui/motion'
import toast from 'react-hot-toast'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

export default function EmployeeSelfViewPage() {
  const [searchParams] = useSearchParams()
  const [employeeName, setEmployeeName] = useState<string>('')
  const [employeeId, setEmployeeId] = useState<string>('')
  const [employee, setEmployee] = useState<EmployeeDetail | null>(null)
  const [appUsage, setAppUsage] = useState<ApplicationUsage | null>(null)
  const [tabUsage, setTabUsage] = useState<BrowserTabUsage | null>(null)
  const [weeklyTimeline, setWeeklyTimeline] = useState<any>(null)
  const [wellbeing, setWellbeing] = useState<any>(null)
  const [timeline, setTimeline] = useState<EmployeeTimeline[]>([])
  const [shiftHours, setShiftHours] = useState({ start: 9, end: 20 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timelineTooltip, setTimelineTooltip] = useState<TimelineTooltipData | null>(null)
  const ct = useChartTheme()

  // One global from–to range drives every panel on this page.
  const today = getTodayLocalDate()
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)

  useEffect(() => {
    const usr = searchParams.get('usr')
    const eid = searchParams.get('eid')

    if (!usr && !eid) {
      setError('Invalid access: missing employee identifier.')
      setLoading(false)
      return
    }

    try {
      if (usr) setEmployeeName(atob(usr))
      else if (eid) setEmployeeId(atob(eid))
    } catch {
      setError('Invalid access: malformed employee identifier.')
      setLoading(false)
    }
  }, [searchParams])

  useEffect(() => {
    if (employeeName || employeeId) loadEmployeeData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeName, employeeId, startDate, endDate])

  const loadEmployeeData = async () => {
    try {
      setLoading(true)
      setError(null)

      const identifier = employeeName || employeeId
      if (!identifier) {
        setError('No employee identifier available.')
        return
      }

      const rangeDays = daysBetweenStr(startDate, endDate)

      const [detail, appData, tabData, timelineData, focus] = await Promise.all([
        employeeService.getDetail(identifier, startDate, endDate),
        employeeService.getApplicationUsage(identifier, 'today', startDate, endDate),
        employeeService.getBrowserTabUsage(identifier, 'today', startDate, endDate),
        employeeService.getEmployeeWeeklyTimeline(identifier),
        analyticsService.getFocusMetrics(identifier, rangeDays, endDate).catch(() => null),
      ])

      setEmployee(detail)
      setAppUsage(appData)
      setTabUsage(tabData)
      setWeeklyTimeline(timelineData)
      setWellbeing(focus)

      if (detail) {
        const work = detail.activity_history?.reduce((s, l) => s + l.work_seconds, 0) || 0
        const idle = detail.activity_history?.reduce((s, l) => s + l.idle_seconds, 0) || 0
        // Prefer the current day's real segments (from the weekly timeline) so the
        // "today" strip has an actual shape to hover, not an empty bar.
        const todayDay = timelineData?.daily_timelines?.find((d: any) => d.date === today)
        setTimeline([
          {
            name: detail.name,
            status: 'active',
            work_time_today: todayDay?.work_time ?? work,
            idle_time_today: todayDay?.idle_time ?? idle,
            segments: todayDay?.segments ?? [],
          },
        ])
        setShiftHours({ start: 9, end: 20 })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load your statistics.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // ---- Derived data ---------------------------------------------------------
  const totalWork = employee?.activity_history?.reduce((s, l) => s + l.work_seconds, 0) || 0
  const totalIdle = employee?.activity_history?.reduce((s, l) => s + l.idle_seconds, 0) || 0
  const productivityScore = employee?.productivity?.score ?? 0
  const palette = ct.palette || []

  const appRows = useMemo(
    () => (appUsage?.applications || []).filter((a) => a.duration > 0).slice(0, 12),
    [appUsage]
  )
  const tabRows = useMemo(
    () => (tabUsage?.browser_tabs || []).filter((t) => t.duration > 0).slice(0, 12),
    [tabUsage]
  )
  const appTotal = appRows.reduce((s, a) => s + a.duration, 0)
  const tabTotal = tabRows.reduce((s, t) => s + t.duration, 0)

  const focusChart = useMemo(
    () =>
      (wellbeing?.days || []).map((d: any) => ({
        date: String(d.date).slice(5),
        Focus: d.focus_minutes,
        Switches: d.context_switches,
      })),
    [wellbeing]
  )

  const rangeLabel =
    startDate === endDate
      ? new Date(startDate).toLocaleDateString()
      : `${new Date(startDate).toLocaleDateString()} – ${new Date(endDate).toLocaleDateString()}`

  const scoreTone = (s: number): 'success' | 'warning' | 'danger' =>
    s >= 70 ? 'success' : s >= 40 ? 'warning' : 'danger'

  // ---- States ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="ms-aurora-bg flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
          <p className="text-sm text-[var(--muted-foreground)]">Loading your statistics…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ms-aurora-bg flex min-h-screen items-center justify-center px-4">
        <MotionCard accent className="max-w-md p-8 text-center">
          <h2 className="font-display text-lg font-semibold text-[var(--danger)]">Access Error</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">{error}</p>
        </MotionCard>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="ms-aurora-bg flex min-h-screen items-center justify-center">
        <p className="text-[var(--muted-foreground)]">Your data could not be found.</p>
      </div>
    )
  }

  const displayName = employee?.name || employeeName || employeeId
  const initial = (displayName || '?').charAt(0).toUpperCase()

  return (
    <div className="ms-aurora-bg min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px] space-y-5">
        {/* Hero header */}
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
          className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-5 sm:p-6"
          style={{
            background:
              'radial-gradient(120% 140% at 0% 0%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 55%), radial-gradient(120% 140% at 100% 0%, color-mix(in oklab, var(--signal) 14%, transparent), transparent 60%), var(--card)',
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-[0_16px_40px_-18px_var(--primary)]"
                style={{ background: 'linear-gradient(135deg, #4F6DF5, #18A8C7)' }}
              >
                {initial}
              </div>
              <div>
                <p className="ms-eyebrow">Personal dashboard</p>
                <h1 className="font-display text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
                  {displayName}
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
                  <Sparkles size={14} className="text-[var(--signal)]" />
                  Your work statistics · {rangeLabel}
                </p>
              </div>
            </div>
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onChange={(s, e) => {
                setStartDate(s)
                setEndDate(e)
              }}
            />
          </div>
        </motion.header>

        {/* KPI row */}
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Work time" value={formatWorkTime(totalWork)} icon={Clock} tone="primary" hint={rangeLabel} />
          <StatTile label="Idle time" value={formatWorkTime(totalIdle)} icon={Timer} tone="warning" hint="Away / inactive" />
          <StatTile
            label="Productivity"
            numeric={productivityScore}
            suffix="%"
            icon={Gauge}
            tone={scoreTone(productivityScore)}
            hint="Output signal"
          />
          <StatTile
            label="Flow score"
            numeric={wellbeing?.flow_score ?? 0}
            icon={Brain}
            tone={scoreTone(wellbeing?.flow_score ?? 0)}
            hint="Deep-work quality"
          />
        </Stagger>

        {/* Wellbeing / focus */}
        <MotionCard accent className="p-5">
          <SectionHeader eyebrow="Wellbeing" title="Focus & Flow" icon={Brain} />
          {wellbeing ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Avg focus / day" value={`${wellbeing.avg_focus_minutes ?? 0}m`} icon={Brain} tone="var(--primary)" />
                <MiniStat label="Avg switches / day" value={`${wellbeing.avg_context_switches ?? 0}`} icon={Activity} tone="var(--signal)" />
                <MiniStat label="Best focus day" value={`${wellbeing.best_focus_minutes ?? 0}m`} sub={wellbeing.best_focus_day || undefined} icon={Flame} tone="var(--success)" />
                <MiniStat label="Flow score" value={`${wellbeing.flow_score ?? 0}`} icon={TrendingUp} tone={scoreTone(wellbeing.flow_score ?? 0) === 'success' ? 'var(--success)' : scoreTone(wellbeing.flow_score ?? 0) === 'warning' ? 'var(--warning)' : 'var(--danger)'} />
              </div>
              {focusChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={focusChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="selfFocusFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={palette[0]} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={palette[0]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                    <XAxis dataKey="date" {...axisProps(ct)} />
                    <YAxis {...axisProps(ct)} />
                    <Tooltip {...ct.tooltip} />
                    <Area type="monotone" dataKey="Focus" stroke={palette[0]} strokeWidth={2.5} fill="url(#selfFocusFill)" name="Focus min" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">No focus data for this range yet.</p>
              )}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">Wellbeing insights are not available yet.</p>
          )}
        </MotionCard>

        {/* Today's timeline (shared component already carries the rich tooltip) */}
        <MotionCard className="p-5">
          <SectionHeader eyebrow="Today" title="Work Timeline" icon={Activity} />
          <EmployeeTimelineComponent
            timelines={timeline}
            shiftStartHour={shiftHours.start}
            shiftEndHour={shiftHours.end}
          />
        </MotionCard>

        {/* Application usage */}
        <MotionCard accent className="p-5">
          <SectionHeader
            eyebrow="Activity"
            title="Application Usage"
            icon={AppWindow}
            action={
              <span className="ms-num rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
                {formatHMS(appTotal)}
              </span>
            }
          />
          {appRows.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={appRows}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={104}
                      paddingAngle={2}
                      cornerRadius={4}
                      dataKey="duration"
                      nameKey="name"
                      stroke="var(--card)"
                      strokeWidth={2}
                    >
                      {appRows.map((_a, i) => (
                        <Cell key={i} fill={palette[i % palette.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, n: any) => [formatHMS(v), String(n).replace('.exe', '')]} {...ct.tooltip} />
                    <Legend iconType="circle" formatter={(v) => String(v).replace('.exe', '')} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <UsageBars rows={appRows.map((a) => ({ label: a.name, duration: a.duration, percentage: a.percentage }))} palette={palette} />
            </div>
          ) : (
            <EmptyPanel label="No application usage in this range." />
          )}
        </MotionCard>

        {/* Browser tab usage */}
        <MotionCard accent className="p-5">
          <SectionHeader
            eyebrow="Activity"
            title="Browser Tab Usage"
            icon={Globe}
            action={
              <span className="ms-num rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
                {formatHMS(tabTotal)}
              </span>
            }
          />
          {tabRows.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={tabRows}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={104}
                      paddingAngle={2}
                      cornerRadius={4}
                      dataKey="duration"
                      nameKey="title"
                      stroke="var(--card)"
                      strokeWidth={2}
                    >
                      {tabRows.map((_t, i) => (
                        <Cell key={i} fill={palette[i % palette.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, n: any) => [formatHMS(v), n]} {...ct.tooltip} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <UsageBars rows={tabRows.map((t) => ({ label: t.title, sub: t.url, duration: t.duration, percentage: t.percentage }))} palette={palette} />
            </div>
          ) : (
            <EmptyPanel label="No browser tab activity in this range." />
          )}
        </MotionCard>

        {/* Weekly timeline with the shared rich hover tooltip */}
        {weeklyTimeline?.daily_timelines && (
          <MotionCard className="p-5">
            <SectionHeader eyebrow="Shift coverage" title="Weekly Work Timeline" icon={Calendar} />
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
              {weeklyTimeline.daily_timelines.map((day: any, dayIndex: number) => {
                const [dy, dm, dd] = String(day.date).split('-').map((n: string) => parseInt(n, 10))
                const dayDate = new Date(dy, (dm || 1) - 1, dd || 1)
                const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                const isToday = day.date === getTodayLocalDate()

                const SHIFT_START = 9
                const SHIFT_END = 20
                const SHIFT_HOURS = SHIFT_END - SHIFT_START

                const hourMarkers = Array.from({ length: SHIFT_HOURS + 1 }, (_, i) => ({
                  hour: SHIFT_START + i,
                  position: (i / SHIFT_HOURS) * 100,
                }))

                const getSegmentPosition = (start: string, end: string) => {
                  const s = zonedHoursSinceMidnight(start)
                  const e = zonedHoursSinceMidnight(end)
                  const left = ((s - SHIFT_START) / SHIFT_HOURS) * 100
                  const width = ((e - s) / SHIFT_HOURS) * 100
                  return { left: Math.max(0, Math.min(100, left)), width: Math.max(0.4, Math.min(100 - Math.max(0, left), width)) }
                }

                const segColor = (type: 'work' | 'idle' | 'offline') =>
                  type === 'work'
                    ? 'bg-[var(--primary)]'
                    : type === 'idle'
                    ? 'bg-[var(--warning)]'
                    : 'bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(148,163,184,0.28)_4px,rgba(148,163,184,0.28)_8px)]'

                return (
                  <motion.div variants={riseItem} key={dayIndex} className="border-b border-[var(--border)] pb-4 last:border-b-0">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isToday ? 'text-[var(--primary)]' : 'text-[var(--foreground)]'}`}>{dayName}</span>
                        {isToday && (
                          <span className="rounded-full bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] px-2 py-0.5 text-xs text-[var(--primary)]">Today</span>
                        )}
                      </div>
                      <span className="text-sm text-[var(--muted-foreground)]">
                        Work: {formatWorkTime(day.work_time || 0)} · Idle: {formatWorkTime(day.idle_time || 0)}
                      </span>
                    </div>

                    <div className="relative mb-2 h-6">
                      <div className="absolute inset-0">
                        {hourMarkers.map(({ hour, position }) => (
                          <div key={hour} className="absolute flex flex-col items-center" style={{ left: `${position}%`, transform: 'translateX(-50%)' }}>
                            <div className="h-2 w-px bg-[var(--border)]" />
                            {hour % 3 === 0 && <span className="mt-1 text-xs text-[var(--muted-foreground)]">{formatHourLabel(hour)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      className="relative h-8 overflow-hidden rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_60%,transparent)]"
                      onMouseMove={(e) =>
                        setTimelineTooltip(
                          computeTimelineTooltip(
                            `${displayName} · ${dayName}`,
                            day.segments || [],
                            day.work_time || 0,
                            day.idle_time || 0,
                            e,
                            SHIFT_START,
                            SHIFT_HOURS
                          )
                        )
                      }
                      onMouseLeave={() => setTimelineTooltip(null)}
                    >
                      {(day.segments || []).length > 0 ? (
                        day.segments.map((segment: any, idx: number) => {
                          const { left, width } = getSegmentPosition(segment.start, segment.end)
                          return <div key={idx} className={`absolute h-full ${segColor(segment.type)}`} style={{ left: `${left}%`, width: `${width}%` }} />
                        })
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs text-[var(--muted-foreground)]">No data on this day</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>

            <div className="mt-6 flex items-center justify-center gap-6 border-t border-[var(--border)] pt-4 text-sm">
              <LegendDot className="bg-[var(--primary)]" label="Work" />
              <LegendDot className="bg-[var(--warning)]" label="Idle" />
              <LegendDot className="border border-[var(--border)] bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(148,163,184,0.35)_2px,rgba(148,163,184,0.35)_4px)]" label="Offline" />
            </div>
          </MotionCard>
        )}

        <p className="pb-2 text-center text-xs text-[var(--muted-foreground)]">
          ScreenTime · This is your personal activity view.
        </p>
      </div>

      {/* Shared floating timeline hover card */}
      <TimelineTooltip tooltip={timelineTooltip} />
    </div>
  )
}

// ---- Small presentational helpers -----------------------------------------

function MiniStat({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  tone?: string
  icon?: typeof Brain
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_55%,transparent)] p-3">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={13} style={{ color: tone || 'var(--muted-foreground)' }} />}
        <p className="ms-eyebrow">{label}</p>
      </div>
      <p className="ms-num mt-1 text-xl font-bold" style={{ color: tone || 'var(--foreground)' }}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-[var(--muted-foreground)]">{sub}</p>}
    </div>
  )
}

function UsageBars({
  rows,
  palette,
}: {
  rows: Array<{ label: string; sub?: string; duration: number; percentage: number }>
  palette: string[]
}) {
  return (
    <div className="custom-scrollbar max-h-[280px] space-y-3 overflow-y-auto pr-1">
      {rows.map((row, idx) => {
        const color = palette[idx % Math.max(1, palette.length)]
        return (
          <motion.div
            key={`${row.label}-${idx}`}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.03 }}
            className="space-y-1"
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-[var(--foreground)]" title={row.label}>
                {row.label}
              </span>
              <span className="ms-num shrink-0 text-[var(--muted-foreground)]">{formatHMS(row.duration)}</span>
            </div>
            {row.sub && (
              <p className="truncate text-xs text-[var(--muted-foreground)]" title={row.sub}>
                {row.sub}
              </p>
            )}
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
              <motion.div
                className="h-2 rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(row.percentage, 100)}%` }}
                transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
              />
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Activity size={26} className="text-[var(--muted-foreground)]" />
      <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-4 w-4 rounded ${className}`} />
      <span className="text-[var(--muted-foreground)]">{label}</span>
    </div>
  )
}
