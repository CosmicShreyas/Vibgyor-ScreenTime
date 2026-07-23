import { Calendar } from 'lucide-react'
import ThemedDatePicker from './ThemedDatePicker'
import { addDaysStr, getTodayLocalDate } from '../utils/time'

interface DateRangePreset {
  label: string
  /** Number of days the range should span, counting back from today (1 = today only). */
  days: number
}

interface DateRangeFilterProps {
  startDate: string
  endDate: string
  onChange: (startDate: string, endDate: string) => void
  /** Latest selectable day (defaults to today). */
  max?: string
  /** Quick-select chips. Pass an empty array to hide them. */
  presets?: DateRangePreset[]
  className?: string
}

const DEFAULT_PRESETS: DateRangePreset[] = [
  { label: 'Today', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
]

/**
 * Standard from–to date range control used across the dashboard. Wraps two
 * ThemedDatePickers with mutual min/max clamping (so `from` can never exceed
 * `to`), a "to" separator, and optional quick-select presets. Single-day ranges
 * (from === to) are valid. Matches the Command Center's filter styling so every
 * page's range filter looks and behaves identically.
 */
export default function DateRangeFilter({
  startDate,
  endDate,
  onChange,
  max = getTodayLocalDate(),
  presets = DEFAULT_PRESETS,
  className = '',
}: DateRangeFilterProps) {
  const dateInputClass = 'dashboard-control px-3 py-2 text-[13px]'

  const applyPreset = (days: number) => {
    const end = max
    const start = days <= 1 ? end : addDaysStr(end, -(days - 1))
    onChange(start, end)
  }

  // A preset is "active" when the current range exactly matches it.
  const isPresetActive = (days: number) => {
    const expectedStart = days <= 1 ? max : addDaysStr(max, -(days - 1))
    return endDate === max && startDate === expectedStart
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_80%,transparent)] px-2.5 py-1.5 ${className}`}
    >
      {presets.length > 0 && (
        <div className="flex items-center gap-1">
          {presets.map((preset) => {
            const active = isPresetActive(preset.days)
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.days)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                  active
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_10px_24px_-16px_var(--primary)]'
                    : 'text-[var(--muted-foreground)] hover:bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] hover:text-[var(--primary)]'
                }`}
              >
                {preset.label}
              </button>
            )
          })}
          <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
        </div>
      )}

      <Calendar className="text-[var(--muted-foreground)]" size={16} />
      <ThemedDatePicker
        value={startDate}
        onChange={(v) => onChange(v, endDate < v ? v : endDate)}
        max={endDate}
        className={dateInputClass}
      />
      <span className="text-xs text-[var(--muted-foreground)]">to</span>
      <ThemedDatePicker
        value={endDate}
        onChange={(v) => onChange(startDate, v)}
        min={startDate}
        max={max}
        className={dateInputClass}
      />
    </div>
  )
}
