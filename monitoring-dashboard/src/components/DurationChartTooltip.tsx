import { Clock3 } from 'lucide-react'
import { formatHMS } from '../utils/time'

interface DurationChartTooltipProps {
  active?: boolean
  label?: string
  payload?: Array<{
    color?: string
    name?: string
    value?: number | string
  }>
}

export default function DurationChartTooltip({ active, label, payload }: DurationChartTooltipProps) {
  if (!active || !payload?.length) return null

  const rows = payload.filter((item) => Number.isFinite(Number(item.value)))
  const total = rows.reduce((sum, item) => sum + Number(item.value), 0)

  return (
    <div className="min-w-52 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-lg)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_72%,transparent)] px-3.5 py-2.5">
        <Clock3 size={14} className="text-[var(--primary)]" />
        <p className="text-xs font-bold text-[var(--foreground)]">{label}</p>
      </div>
      <div className="space-y-2.5 px-3.5 py-3">
        {rows.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-6 text-xs">
            <span className="flex items-center gap-2 font-semibold text-[var(--muted-foreground)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              {item.name}
            </span>
            <span className="ms-num font-bold text-[var(--foreground)]">{formatHMS(Number(item.value))}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-6 border-t border-[var(--border)] pt-2.5 text-xs">
          <span className="font-semibold text-[var(--muted-foreground)]">Total tracked</span>
          <span className="ms-num font-bold text-[var(--primary)]">{formatHMS(total)}</span>
        </div>
      </div>
    </div>
  )
}
