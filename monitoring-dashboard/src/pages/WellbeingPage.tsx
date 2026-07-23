import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  HeartPulse,
  Flame,
  Brain,
  Gauge,
  Users2,
  AlarmClock,
  Moon,
  CalendarDays,
  Activity,
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import ThemedSelect from '../components/ThemedSelect'
import DateRangeFilter from '../components/DateRangeFilter'
import {
  PageShell,
  MotionCard,
  SectionHeader,
  StatTile,
  Skeleton,
} from '../components/ui'
import { staggerContainer, riseItem } from '../components/ui/motion'
import { analyticsService, employeeService, EmployeeSummary } from '../services/api'
import { useChartTheme, axisProps } from '../utils/chartTheme'
import { getTodayLocalDate, addDaysStr, daysBetweenStr } from '../utils/time'
import toast from 'react-hot-toast'
import Pagination, { usePagination } from '../components/Pagination'
import StatInsightModal, { type StatInsightDetails } from '../components/StatInsightModal'

function riskColor(level: string) {
  return level === 'high' ? 'var(--danger)' : level === 'moderate' ? 'var(--warning)' : 'var(--success)'
}

export default function WellbeingPage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [selected, setSelected] = useState('')
  const [focus, setFocus] = useState<any>(null)
  const [burnout, setBurnout] = useState<any>(null)
  const [anomalies, setAnomalies] = useState<any>(null)
  const [pulse, setPulse] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const today = getTodayLocalDate()
  const [startDate, setStartDate] = useState(() => addDaysStr(today, -6))
  const [endDate, setEndDate] = useState(today)
  const ct = useChartTheme()

  const rangeDays = daysBetweenStr(startDate, endDate)
  const burnoutRows = useMemo(() => (burnout?.employees || []).filter((employee: any) => employee.level !== 'low'), [burnout])
  const anomalyRows = useMemo(() => anomalies?.anomalies || [], [anomalies])
  const burnoutPagination = usePagination<any>(burnoutRows, 6)
  const anomalyPagination = usePagination<any>(anomalyRows, 6)

  useEffect(() => {
    // Burnout radar spans the selected range; anomalies & team pulse are
    // point-in-time (today / personal baseline) signals with no range concept.
    Promise.all([
      analyticsService.getBurnout(rangeDays, endDate),
      analyticsService.getAnomalies(),
      analyticsService.getTeamPulse(),
      employeeService.getAll(),
    ])
      .then(([b, a, p, emps]) => {
        setBurnout(b)
        setAnomalies(a)
        setPulse(p)
        setEmployees(emps)
        if (emps.length > 0 && !selected) setSelected(emps[0].name)
      })
      .catch(() => toast.error('Failed to load wellbeing data'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate])

  useEffect(() => {
    if (!selected) return
    analyticsService.getFocusMetrics(selected, rangeDays, endDate).then(setFocus).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, startDate, endDate])

  const focusData =
    focus?.days?.map((d: any) => ({
      date: d.date.slice(5),
      Focus: d.focus_minutes,
      Switches: d.context_switches,
    })) ?? []
  const focusDays = focus?.days ?? []
  const activeFocusDays = focusDays.filter((day: any) => day.work_minutes > 0)
  const dailyFocusItems = focusDays.map((day: any) => ({
    label: day.date,
    value: `${day.focus_minutes}m focus`,
    numeric: day.focus_minutes,
    secondary: `${day.work_minutes}m total work · ${day.longest_focus_minutes}m longest focus block`,
  }))

  return (
    <PageShell
      eyebrow="Sustainable performance"
      title="Wellbeing & Focus"
      description="Deep-work quality, burnout safeguards, behavioral anomalies, and privacy-respecting team benchmarks — insights that help people work well, not just harder."
      icon={HeartPulse}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onChange={(s, e) => {
              setStartDate(s)
              setEndDate(e)
            }}
          />
          <Sparkles size={18} className="text-[var(--signal)]" />
        </div>
      }
    >
      {loading ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <MotionCard key={i} className="p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-8 w-20" />
              </MotionCard>
            ))}
          </div>
          <MotionCard className="p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-[260px] w-full" />
          </MotionCard>
        </>
      ) : (
        <>
          {/* Top KPIs */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="At-risk of burnout" numeric={burnout?.at_risk ?? 0} icon={Flame} tone={burnout?.at_risk ? 'danger' : 'success'} hint={rangeDays === 1 ? 'Selected day' : `Over ${rangeDays} days`} details={{ eyebrow: 'Burnout radar', description: 'Employees above the low-risk threshold.', itemLabel: 'employees', items: burnoutRows.map((employee: any) => ({ label: employee.employee_name, value: `${employee.risk_score}%`, numeric: employee.risk_score, secondary: `${employee.level} risk · ${employee.avg_daily_hours}h/day` })) }} />
            <StatTile label="Anomalies today" numeric={anomalies?.count ?? 0} icon={Brain} tone={anomalies?.count ? 'warning' : 'success'} hint="vs personal baseline" details={{ eyebrow: 'Behavioral anomalies', description: 'Signals outside each employee’s personal baseline.', itemLabel: 'anomalies', items: anomalyRows.map((anomaly: any) => ({ label: anomaly.employee_name, value: anomaly.severity, numeric: anomaly.severity === 'critical' ? 3 : anomaly.severity === 'warning' ? 2 : 1, secondary: anomaly.message })) }} />
            <StatTile label="Team median focus" numeric={pulse?.median_focus_minutes ?? 0} suffix="m" icon={Gauge} tone="signal" hint="Deep-work today" details={{ eyebrow: 'Team focus', description: 'Focus performance for employees reporting today.', itemLabel: 'employees', items: (pulse?.employees ?? []).map((employee: any) => ({ label: employee.employee_name, value: `${employee.focus_minutes ?? employee.avg_focus_minutes ?? 0}m`, numeric: employee.focus_minutes ?? employee.avg_focus_minutes ?? 0, secondary: `${employee.productivity_percentile ?? 0}th productivity percentile` })) }} />
            <StatTile label="Team size active" numeric={pulse?.team_size ?? 0} icon={Users2} tone="primary" hint="Reporting today" details={{ eyebrow: 'Active team', description: 'Employees included in today’s team pulse.', itemLabel: 'employees', items: (pulse?.employees ?? []).map((employee: any) => ({ label: employee.employee_name, value: `${employee.productivity_percentile ?? 0}th`, numeric: employee.productivity_percentile ?? 0, secondary: 'Productivity percentile' })) }} />
          </div>

          {/* Focus & Flow (per employee) */}
          <MotionCard className="p-5">
            <SectionHeader
              eyebrow="Focus & Flow"
              title="Deep-Work Quality"
              icon={Brain}
              action={
                <ThemedSelect
                  value={selected}
                  onChange={setSelected}
                  options={employees.map((e) => ({ value: e.name, label: e.name }))}
                  className="dashboard-control px-3 py-2 text-[13px]"
                />
              }
            />
            {focus ? (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniStat
                    label="Flow score"
                    value={`${focus.flow_score}`}
                    tone={focus.flow_score >= 60 ? 'var(--success)' : focus.flow_score >= 30 ? 'var(--warning)' : 'var(--danger)'}
                    modalTone={focus.flow_score >= 60 ? 'success' : focus.flow_score >= 30 ? 'warning' : 'danger'}
                    hint="Latest day in the selected range"
                    details={{
                      eyebrow: 'Focus quality',
                      description: 'A 0–100 daily signal that rewards total focus time and the longest uninterrupted block, while penalizing frequent application switching.',
                      itemLabel: 'days',
                      items: focusDays.map((day: any) => ({ label: day.date, value: `${day.focus_minutes}m focus`, numeric: day.focus_minutes, secondary: `${day.context_switches} switches · ${day.longest_focus_minutes}m longest block` })),
                    }}
                  />
                  <MiniStat
                    label="Avg focus / day"
                    value={`${focus.avg_focus_minutes}m`}
                    modalTone="primary"
                    hint={`${activeFocusDays.length} active day${activeFocusDays.length === 1 ? '' : 's'} in this range`}
                    details={{
                      eyebrow: 'Deep-work time',
                      description: 'Average time per active day spent in uninterrupted work blocks of at least 15 minutes. A gap longer than 3 minutes ends a block. Work time is different: it includes every active minute, including short or fragmented periods, so it is normally higher.',
                      itemLabel: 'days',
                      items: dailyFocusItems,
                    }}
                  />
                  <MiniStat
                    label="Avg switches / day"
                    value={`${focus.avg_context_switches}`}
                    modalTone="signal"
                    hint="Foreground application changes"
                    details={{
                      eyebrow: 'Context switching',
                      description: 'Average number of times the dominant foreground application changed per active day. Fewer switches can indicate longer, less fragmented work sessions.',
                      itemLabel: 'days',
                      items: focusDays.map((day: any) => ({ label: day.date, value: `${day.context_switches} switches`, numeric: day.context_switches, secondary: `${day.focus_minutes}m focus · ${day.work_minutes}m total work` })),
                    }}
                  />
                  <MiniStat
                    label="Best focus day"
                    value={`${focus.best_focus_minutes}m`}
                    sub={focus.best_focus_day}
                    modalTone="success"
                    hint="Highest focus total in the range"
                    details={{
                      eyebrow: 'Best deep-work day',
                      description: 'The selected-range day with the highest combined duration of qualifying uninterrupted focus blocks.',
                      itemLabel: 'days',
                      items: dailyFocusItems,
                    }}
                  />
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={focusData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="focusFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ct.palette?.[0]} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={ct.palette?.[0]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                    <XAxis dataKey="date" {...axisProps(ct)} />
                    <YAxis {...axisProps(ct)} />
                    <Tooltip {...ct.tooltip} />
                    <Area type="monotone" dataKey="Focus" stroke={ct.palette?.[0]} strokeWidth={2.5} fill="url(#focusFill)" name="Focus min" />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            ) : (
              <p className="py-8 text-center text-[var(--muted-foreground)]">Select an employee to see focus metrics.</p>
            )}
          </MotionCard>

          {/* Burnout radar + Anomalies */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <MotionCard accent className="p-5">
              <SectionHeader eyebrow="Duty of care" title="Burnout Radar" icon={Flame} />
              {burnoutRows.length ? (
                <>
                <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2.5">
                  {burnoutPagination.pageItems.map((e: any) => (
                    <motion.div key={e.employee_name} variants={riseItem} className="rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_55%,transparent)] p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-semibold text-[var(--foreground)]">{e.employee_name}</span>
                        <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize" style={{ background: `color-mix(in oklab, ${riskColor(e.level)} 15%, transparent)`, color: riskColor(e.level) }}>
                          {e.level} · {e.risk_score}
                        </span>
                      </div>
                      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                        <motion.div className="h-1.5 rounded-full" style={{ background: riskColor(e.level) }} initial={{ width: 0 }} animate={{ width: `${e.risk_score}%` }} transition={{ duration: 0.7 }} />
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)]">
                        <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {e.avg_daily_hours}h/day</span>
                        <span className="inline-flex items-center gap-1"><Moon size={12} /> {e.after_hours_hours}h after-hours</span>
                        <span className="inline-flex items-center gap-1"><AlarmClock size={12} /> {e.longest_no_break_minutes}m no break</span>
                      </div>
                      {e.reasons?.length > 0 && (
                        <p className="mt-2 text-xs text-[var(--muted-foreground)]">{e.reasons.join(' · ')}</p>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
                <Pagination page={burnoutPagination.page} pageSize={burnoutPagination.pageSize} totalItems={burnoutRows.length} onPageChange={burnoutPagination.setPage} onPageSizeChange={burnoutPagination.setPageSize} itemLabel="employees" />
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <HeartPulse size={28} className="text-[var(--success)]" />
                  <p className="text-sm text-[var(--muted-foreground)]">No one is trending toward burnout. Healthy team.</p>
                </div>
              )}
            </MotionCard>

            <MotionCard accent className="p-5">
              <SectionHeader eyebrow="Exceptions" title="Anomaly Detection" icon={Activity} />
              {anomalyRows.length ? (
                <>
                <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2.5">
                  {anomalyPagination.pageItems.map((a: any) => {
                    const tone = a.severity === 'warning' ? 'var(--warning)' : a.severity === 'critical' ? 'var(--danger)' : 'var(--signal)'
                    return (
                      <motion.div key={a.id} variants={riseItem} className="flex items-start gap-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: `color-mix(in oklab, ${tone} 30%, transparent)`, background: `color-mix(in oklab, ${tone} 8%, transparent)` }}>
                        <span className="mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: tone }} />
                        <div>
                          <p className="font-semibold text-[var(--foreground)]">{a.employee_name}</p>
                          <p className="text-[var(--muted-foreground)]">{a.message}</p>
                        </div>
                      </motion.div>
                    )
                  })}
                </motion.div>
                <Pagination page={anomalyPagination.page} pageSize={anomalyPagination.pageSize} totalItems={anomalyRows.length} onPageChange={anomalyPagination.setPage} onPageSizeChange={anomalyPagination.setPageSize} itemLabel="anomalies" />
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Activity size={28} className="text-[var(--success)]" />
                  <p className="text-sm text-[var(--muted-foreground)]">Nothing unusual today — everyone's within their normal patterns.</p>
                </div>
              )}
            </MotionCard>
          </div>

          {/* Team pulse */}
          <MotionCard className="p-5">
            <SectionHeader eyebrow="Team pulse" title="How Everyone Compares" icon={Users2} />
            <p className="mb-4 text-xs text-[var(--muted-foreground)]">
              Percentiles relative to today's active team (100 = ahead of everyone). A gentle benchmark, not a ranking.
            </p>
            {pulse?.employees?.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={pulse.employees} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="teamPulseFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ct.palette?.[0]} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={ct.palette?.[0]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                  <XAxis dataKey="employee_name" {...axisProps(ct)} />
                  <YAxis domain={[0, 100]} unit="%" {...axisProps(ct)} />
                  <Tooltip {...ct.tooltip} formatter={(v: number) => [`${v}th percentile`, 'Productivity']} />
                  <Area type="monotone" dataKey="productivity_percentile" stroke={ct.palette?.[0]} strokeWidth={2.5} fill="url(#teamPulseFill)" dot={{ r: 3, fill: ct.palette?.[0], strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-[var(--muted-foreground)]">No active team members today.</p>
            )}
          </MotionCard>
        </>
      )}
    </PageShell>
  )
}

function MiniStat({
  label,
  value,
  sub,
  tone,
  modalTone = 'primary',
  hint,
  details,
}: {
  label: string
  value: string
  sub?: string
  tone?: string
  modalTone?: 'primary' | 'signal' | 'success' | 'warning' | 'danger'
  hint?: string
  details: StatInsightDetails
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
        aria-label={`Explain ${label}`}
        className="group rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_55%,transparent)] p-3 text-left outline-none transition-colors hover:border-[color-mix(in_oklab,var(--primary)_48%,var(--border))] hover:bg-[color-mix(in_oklab,var(--secondary)_70%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="ms-eyebrow">{label}</p>
          <ChevronRight size={14} className="shrink-0 text-[var(--primary)] transition-transform group-hover:translate-x-0.5" />
        </div>
        <p className="ms-num mt-1 text-xl font-bold" style={{ color: tone || 'var(--foreground)' }}>{value}</p>
        {sub && <p className="text-[10px] text-[var(--muted-foreground)]">{sub}</p>}
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">View explanation</p>
      </motion.button>
      <StatInsightModal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        headline={value}
        hint={hint ?? sub}
        tone={modalTone}
        details={details}
      />
    </>
  )
}
