import { useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ActivityHistoryItem } from '../services/api'
import { APP_TZ, formatHourLabel, formatTimeIntelligent, zonedClockParts } from '../utils/time'
import { axisProps, useChartTheme } from '../utils/chartTheme'
import DurationChartTooltip from './DurationChartTooltip'
import ThemedSelect from './ThemedSelect'
import { MotionCard, SectionHeader } from './ui'

const INTERVAL_OPTIONS = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 hour' },
]

function dateKey(timestamp: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: APP_TZ,
  }).formatToParts(new Date(timestamp))
  const values: Record<string, string> = {}
  for (const part of parts) if (part.type !== 'literal') values[part.type] = part.value
  return `${values.year}-${values.month}-${values.day}`
}

function minuteLabel(minuteOfDay: number) {
  const hour = Math.floor(minuteOfDay / 60)
  const minute = minuteOfDay % 60
  if (minute === 0) return formatHourLabel(hour)
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`
}

export function aggregateActivityHistory(items: ActivityHistoryItem[], intervalMinutes: number) {
  const buckets = new Map<string, { date: string; minute: number; work: number; idle: number }>()

  for (const item of items) {
    const date = dateKey(item.timestamp)
    const parts = zonedClockParts(item.timestamp)
    const minute = Math.floor((parts.hour * 60 + parts.minute) / intervalMinutes) * intervalMinutes
    const key = `${date}-${String(minute).padStart(4, '0')}`
    const bucket = buckets.get(key) ?? { date, minute, work: 0, idle: 0 }
    bucket.work += Math.max(0, item.work_seconds || 0)
    bucket.idle += Math.max(0, item.idle_seconds || 0)
    buckets.set(key, bucket)
  }

  const sorted = [...buckets.values()].sort((a, b) =>
    a.date === b.date ? a.minute - b.minute : a.date.localeCompare(b.date)
  )
  const dates = [...new Set(sorted.map((bucket) => bucket.date))]
  const filled: Array<{ date: string; minute: number; work: number; idle: number }> = []

  // Preserve the chosen cadence on the x-axis even when no telemetry arrived
  // in a bucket. This prevents 2 PM and 4 PM from appearing adjacent as if only
  // one interval separated them.
  for (const date of dates) {
    const dayBuckets = sorted.filter((bucket) => bucket.date === date)
    const byMinute = new Map(dayBuckets.map((bucket) => [bucket.minute, bucket]))
    const firstMinute = dayBuckets[0]?.minute ?? 0
    const lastMinute = dayBuckets[dayBuckets.length - 1]?.minute ?? firstMinute
    for (let minute = firstMinute; minute <= lastMinute; minute += intervalMinutes) {
      filled.push(byMinute.get(minute) ?? { date, minute, work: 0, idle: 0 })
    }
  }

  return filled.map((bucket) => ({
    time: minuteLabel(bucket.minute),
    work: bucket.work,
    idle: bucket.idle,
  }))
}

export default function ActivityTimelineChart({
  activity,
  rangeLabel,
}: {
  activity: ActivityHistoryItem[]
  rangeLabel: string
}) {
  const [intervalMinutes, setIntervalMinutes] = useState(60)
  const ct = useChartTheme()
  const data = useMemo(
    () => aggregateActivityHistory(activity, intervalMinutes),
    [activity, intervalMinutes]
  )

  return (
    <MotionCard className="p-5">
      <SectionHeader
        eyebrow="Work vs idle"
        title="Activity Timeline"
        icon={Activity}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs font-semibold text-[var(--muted-foreground)]">{rangeLabel}</span>
            <div className="w-28">
              <ThemedSelect
                value={String(intervalMinutes)}
                onChange={(value) => setIntervalMinutes(Number(value))}
                options={INTERVAL_OPTIONS}
                showIndicator={false}
                className="min-h-9 py-1.5 text-xs"
              />
            </div>
          </div>
        }
      />

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="activity-work-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ct.palette?.[0]} stopOpacity={0.3} />
                <stop offset="100%" stopColor={ct.palette?.[0]} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="activity-idle-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--warning)" stopOpacity={0.26} />
                <stop offset="100%" stopColor="var(--warning)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={ct.grid} vertical={false} />
            <XAxis dataKey="time" {...axisProps(ct)} minTickGap={28} />
            <YAxis
              {...axisProps(ct)}
              width={54}
              tickFormatter={(value) => formatTimeIntelligent(Number(value))}
              label={{ value: 'Duration', angle: -90, position: 'insideLeft', fill: ct.axis, fontSize: 12 }}
            />
            <Tooltip content={<DurationChartTooltip />} cursor={{ stroke: ct.grid, strokeDasharray: '4 4' }} />
            <Area type="monotone" dataKey="work" stroke={ct.palette?.[0]} strokeWidth={2.5} fill="url(#activity-work-fill)" name="Work Time" dot={false} activeDot={{ r: 4 }} />
            <Area type="monotone" dataKey="idle" stroke="var(--warning)" strokeWidth={2.5} fill="url(#activity-idle-fill)" name="Idle Time" dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">No activity data for this range.</p>
      )}
    </MotionCard>
  )
}
