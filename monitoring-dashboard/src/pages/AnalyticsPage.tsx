import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, Trophy, AlertTriangle, Sparkles, Activity, Gauge } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import DateRangeFilter from '../components/DateRangeFilter'
import DurationChartTooltip from '../components/DurationChartTooltip'
import {
  PageShell,
  MotionCard,
  SectionHeader,
  StatTile,
  Skeleton,
  SkeletonCard,
} from '../components/ui'
import { staggerContainer, riseItem } from '../components/ui/motion'
import { analyticsService, TeamOverview, ProductivityTrendPoint, Alert } from '../services/api'
import { formatDuration, formatTimeIntelligent, getTodayLocalDate, daysBetweenStr } from '../utils/time'
import { useChartTheme, axisProps } from '../utils/chartTheme'
import { downloadCsv } from '../utils/csv'
import { Download } from 'lucide-react'
import toast from 'react-hot-toast'

interface ProductivityTooltipProps {
  active?: boolean
  label?: string
  payload?: Array<{
    value?: number | string
    payload?: { fullDate?: string }
  }>
}

function ProductivityTooltip({ active, label, payload }: ProductivityTooltipProps) {
  if (!active || !payload?.length) return null

  const score = Math.max(0, Math.min(100, Number(payload[0].value) || 0))
  const tone = score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)'
  const status = score >= 70 ? 'Strong' : score >= 40 ? 'Moderate' : 'Needs attention'
  const fullDate = payload[0].payload?.fullDate || label

  return (
    <div className="min-w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-md)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_72%,transparent)] px-3.5 py-2.5">
        <TrendingUp size={14} className="text-[var(--primary)]" />
        <p className="text-xs font-bold text-[var(--foreground)]">{fullDate}</p>
      </div>
      <div className="px-3.5 py-3">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Productivity score</p>
            <p className="ms-num mt-1 text-2xl font-bold text-[var(--foreground)]">{Math.round(score)}%</p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase"
            style={{ color: tone, background: `color-mix(in oklab, ${tone} 13%, transparent)` }}
          >
            {status}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--muted)]">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${score}%`, background: tone }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-[var(--muted-foreground)]">
          <span>0%</span>
          <span>Target 70%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<TeamOverview | null>(null)
  const [trend, setTrend] = useState<ProductivityTrendPoint[]>([])
  const [insights, setInsights] = useState<string[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const today = getTodayLocalDate()
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  })
  const [endDate, setEndDate] = useState(today)
  const [loading, setLoading] = useState(true)
  const ct = useChartTheme()

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate])

  const load = async () => {
    setLoading(true)
    try {
      const days = daysBetweenStr(startDate, endDate)
      const [ov, tr, ins, al] = await Promise.all([
        // Overview / insights reflect the whole selected range; trend spans the
        // range's day-count anchored on its end date; alerts aggregate the range.
        analyticsService.getOverview(startDate, endDate),
        analyticsService.getTrend(days, undefined, endDate),
        analyticsService.getInsights(startDate, endDate),
        analyticsService.getAlerts(startDate, endDate),
      ])
      setOverview(ov)
      setTrend(tr)
      setInsights(ins.insights)
      setAlerts(al.alerts)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  const trendData = trend.map((t) => ({
    date: t.date.slice(5), // MM-DD
    fullDate: new Date(`${t.date}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    Productivity: t.productivity_score,
    Work: t.work_seconds,
    Idle: t.idle_seconds,
  }))

  const scoreColor = (s: number) =>
    s >= 70 ? 'var(--success)' : s >= 40 ? 'var(--warning)' : 'var(--danger)'

  const exportCsv = () => {
    if (trend.length === 0 && !overview) {
      toast.error('No analytics data to export')
      return
    }
    const rows: (string | number)[][] = []
    rows.push([`Productivity trend (${startDate} to ${endDate})`])
    rows.push(['Date', 'Productivity %', 'Work hours', 'Idle hours'])
    trend.forEach((t) =>
      rows.push([
        t.date,
        t.productivity_score,
        (t.work_seconds / 3600).toFixed(2),
        (t.idle_seconds / 3600).toFixed(2),
      ])
    )
    if (overview?.employees?.length) {
      rows.push([])
      rows.push([`Team overview (${overview.date})`])
      rows.push(['Employee', 'Productivity %', 'Work seconds', 'Idle seconds'])
      overview.employees.forEach((e) =>
        rows.push([e.employee_name, e.productivity_score, e.work_seconds, e.idle_seconds])
      )
    }
    downloadCsv(`Analytics_${startDate}_to_${endDate}`, rows)
    toast.success('Analytics exported')
  }

  return (
    <PageShell
      eyebrow="Productivity intelligence"
      title="Analytics"
      description="Team-wide productivity trends, top performers, and daily insights derived from tracked activity."
      icon={BarChart3}
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
          <button onClick={exportCsv} className="btn-secondary">
            <Download size={16} />
            Export
          </button>
        </div>
      }
    >
      {loading ? (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <MotionCard className="p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-[260px] w-full" />
          </MotionCard>
          <MotionCard className="p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-[260px] w-full" />
          </MotionCard>
        </>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label="Avg productivity"
              numeric={overview?.average_productivity ?? 0}
              suffix="%"
              icon={Gauge}
              tone="primary"
              hint="Team-wide today"
            />
            <StatTile
              label="Active alerts"
              numeric={alerts.length}
              icon={AlertTriangle}
              tone={alerts.some((a) => a.severity === 'critical') ? 'danger' : alerts.length ? 'warning' : 'success'}
              hint={alerts.length ? 'Needs review' : 'All clear'}
            />
            <StatTile
              label="Daily insights"
              numeric={insights.length}
              icon={Sparkles}
              tone="signal"
              hint="Generated today"
            />
          </div>

          {insights.length > 0 && (
            <MotionCard accent className="p-5">
              <SectionHeader eyebrow="Signal" title="Today's Insights" icon={Sparkles} />
              <motion.ul
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-2.5 lg:grid-cols-2"
              >
                {insights.map((i, idx) => (
                  <motion.li
                    key={idx}
                    variants={riseItem}
                    className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--signal)_7%,transparent)] px-4 py-3 text-sm text-[var(--muted-foreground)]"
                  >
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--signal)]" />
                    <span className="leading-relaxed">{i}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </MotionCard>
          )}

          {/* Top performer / needs attention */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <MotionCard className="relative overflow-hidden p-5">
              <span
                className="pointer-events-none absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full opacity-20 blur-2xl"
                style={{ background: 'var(--success)' }}
              />
              <div className="mb-3 flex items-center gap-2 ms-eyebrow">
                <Trophy size={14} style={{ color: 'var(--warning)' }} /> Top Performer Today
              </div>
              {overview?.top_performer ? (
                <>
                  <p className="font-display text-xl font-bold text-[var(--foreground)]">
                    {overview.top_performer.employee_name}
                  </p>
                  <p
                    className="ms-num mt-1 text-4xl font-bold"
                    style={{ color: scoreColor(overview.top_performer.productivity_score) }}
                  >
                    {overview.top_performer.productivity_score}%
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {formatDuration(overview.top_performer.work_seconds)} of tracked work
                  </p>
                </>
              ) : (
                <p className="text-[var(--muted-foreground)]">No activity yet today.</p>
              )}
            </MotionCard>

            <MotionCard className="relative overflow-hidden p-5">
              <span
                className="pointer-events-none absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full opacity-20 blur-2xl"
                style={{ background: 'var(--danger)' }}
              />
              <div className="mb-3 flex items-center gap-2 ms-eyebrow">
                <AlertTriangle size={14} style={{ color: 'var(--danger)' }} /> Needs Attention
              </div>
              {overview?.needs_attention ? (
                <>
                  <p className="font-display text-xl font-bold text-[var(--foreground)]">
                    {overview.needs_attention.employee_name}
                  </p>
                  <p
                    className="ms-num mt-1 text-4xl font-bold"
                    style={{ color: scoreColor(overview.needs_attention.productivity_score) }}
                  >
                    {overview.needs_attention.productivity_score}%
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {formatDuration(overview.needs_attention.idle_seconds)} idle
                  </p>
                </>
              ) : (
                <p className="text-[var(--muted-foreground)]">Everyone's on track.</p>
              )}
            </MotionCard>
          </div>

          {/* Productivity trend */}
          <MotionCard className="p-5">
            <SectionHeader eyebrow="Trend" title="Productivity Trend" icon={TrendingUp} />
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="prodFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ct.palette?.[0]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={ct.palette?.[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                <XAxis dataKey="date" {...axisProps(ct)} />
                <YAxis domain={[0, 100]} unit="%" {...axisProps(ct)} />
                <Tooltip content={<ProductivityTooltip />} cursor={{ stroke: ct.grid, strokeDasharray: '4 4' }} />
                <Area
                  type="monotone"
                  dataKey="Productivity"
                  stroke={ct.palette?.[0]}
                  strokeWidth={2.5}
                  fill="url(#prodFill)"
                  dot={{ r: 2.5, fill: ct.palette?.[0], strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </MotionCard>

          {/* Work vs Idle per day */}
          <MotionCard className="p-5">
            <SectionHeader eyebrow="Breakdown" title="Work vs Idle (hours/day)" icon={Activity} />
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="workWaveFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ct.work} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={ct.work} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="idleWaveFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ct.palette?.[1]} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={ct.palette?.[1]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                <XAxis dataKey="date" {...axisProps(ct)} />
                <YAxis {...axisProps(ct)} width={54} tickFormatter={(value) => formatTimeIntelligent(Number(value))} />
                <Tooltip content={<DurationChartTooltip />} cursor={{ stroke: ct.grid, strokeDasharray: '4 4' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area type="monotone" dataKey="Work" stroke={ct.work} strokeWidth={2.5} fill="url(#workWaveFill)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="Idle" stroke={ct.palette?.[1]} strokeWidth={2.5} fill="url(#idleWaveFill)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </MotionCard>
        </>
      )}
    </PageShell>
  )
}
