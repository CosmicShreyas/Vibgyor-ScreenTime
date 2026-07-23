import { useMemo, useState } from 'react'
import { ChevronDown, Globe2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatHMS } from '../utils/time'
import { useChartTheme } from '../utils/chartTheme'

export interface BrowserUsageItem {
  browser?: string
  title: string
  url: string
  duration: number
  percentage?: number
}

interface BrowserUsageChild {
  browser: string
  url: string
  duration: number
}

export interface BrowserUsageGroup {
  key: string
  title: string
  duration: number
  percentage: number
  children: BrowserUsageChild[]
}

export function groupBrowserUsage(tabs: BrowserUsageItem[]): BrowserUsageGroup[] {
  const total = tabs.reduce((sum, tab) => sum + Math.max(0, tab.duration || 0), 0)
  const groups = new Map<string, { title: string; duration: number; children: Map<string, BrowserUsageChild> }>()

  tabs.filter((tab) => tab.duration > 0).forEach((tab) => {
    const title = tab.title.trim() || 'Untitled browser page'
    const key = title.replace(/\s+/g, ' ').toLocaleLowerCase()
    const group = groups.get(key) || { title, duration: 0, children: new Map<string, BrowserUsageChild>() }
    group.duration += tab.duration

    const browser = tab.browser?.trim() || 'Browser'
    const url = tab.url?.trim() || ''
    const childKey = `${browser.toLocaleLowerCase()}|${url.toLocaleLowerCase()}`
    const child = group.children.get(childKey)
    if (child) child.duration += tab.duration
    else group.children.set(childKey, { browser, url, duration: tab.duration })
    groups.set(key, group)
  })

  return Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      title: group.title,
      duration: group.duration,
      percentage: total > 0 ? (group.duration / total) * 100 : 0,
      children: Array.from(group.children.values()).sort((a, b) => b.duration - a.duration),
    }))
    .sort((a, b) => b.duration - a.duration)
}

export default function BrowserUsageBreakdown({ tabs }: { tabs: BrowserUsageItem[] }) {
  const ct = useChartTheme()
  const palette = ct.palette || []
  const groups = useMemo(() => groupBrowserUsage(tabs), [tabs])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const toggle = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (groups.length === 0) {
    return <p className="py-8 text-center text-[var(--muted-foreground)]">No browser tab activity in this range.</p>
  }

  const chartGroups = groups.slice(0, 10)
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="flex items-center justify-center">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={chartGroups}
              isAnimationActive={false}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={94}
              paddingAngle={2}
              cornerRadius={4}
              dataKey="duration"
              nameKey="title"
              stroke="var(--card)"
              strokeWidth={2}
            >
              {chartGroups.map((group, index) => (
                <Cell key={group.key} fill={palette[index % palette.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [formatHMS(value), name]} {...ct.tooltip} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="custom-scrollbar max-h-[330px] space-y-2 overflow-y-auto pr-1">
        {groups.map((group, index) => {
          const open = expanded.has(group.key)
          const color = palette[index % palette.length]
          return (
            <div key={group.key} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_58%,transparent)]">
              <button
                type="button"
                onClick={() => toggle(group.key)}
                aria-expanded={open}
                className="w-full px-3.5 py-3 text-left transition hover:bg-[var(--accent)]"
              >
                <div className="flex items-center gap-3">
                  <ChevronDown size={16} className={`shrink-0 text-[var(--muted-foreground)] transition-transform ${open ? 'rotate-180' : ''}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-[var(--foreground)]" title={group.title}>{group.title}</span>
                      <span className="ms-num shrink-0 text-sm text-[var(--muted-foreground)]">{formatHMS(group.duration)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(2, Math.min(100, group.percentage))}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">
                      {group.children.length} browser/URL {group.children.length === 1 ? 'entry' : 'entries'}
                    </p>
                  </div>
                </div>
              </button>

              {open && (
                <div className="border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_50%,transparent)] px-4 py-2.5">
                  {group.children.map((child, childIndex) => (
                    <div key={`${child.browser}-${child.url}-${childIndex}`} className="flex gap-2 border-b border-[var(--border)] py-2 last:border-b-0">
                      <Globe2 size={14} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[var(--foreground)]">{child.browser}</span>
                          <span className="ms-num text-xs text-[var(--muted-foreground)]">{formatHMS(child.duration)}</span>
                        </div>
                        <p className="mt-0.5 break-all text-[11px] text-[var(--muted-foreground)]">
                          {child.url || 'URL unavailable for this activity record'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
