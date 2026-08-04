import { useEffect, useMemo, useRef } from 'react'
import { BarChart3, ListFilter, X } from 'lucide-react'
import { motion } from 'framer-motion'
import Portal from './ui/Portal'
import Pagination, { usePagination } from './Pagination'

export interface StatInsightItem {
  label: string
  value: string
  numeric?: number
  secondary?: string
}

export interface StatInsightDetails {
  eyebrow?: string
  description?: string
  items?: StatInsightItem[]
  itemLabel?: string
}

const toneColors = {
  primary: 'var(--primary)',
  signal: 'var(--signal)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
}

export default function StatInsightModal({
  open,
  onClose,
  title,
  headline,
  hint,
  tone,
  details,
}: {
  open: boolean
  onClose: () => void
  title: string
  headline: string
  hint?: string
  tone: keyof typeof toneColors
  details?: StatInsightDetails
}) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const rows = details?.items?.length
    ? details.items
    : [{ label: title, value: headline, secondary: hint }]
  const pagination = usePagination(rows, 8)
  const color = toneColors[tone]
  const maxValue = useMemo(
    () => Math.max(1, ...rows.map((item) => Math.max(0, item.numeric ?? 0))),
    [rows]
  )
  const chartRows = rows.filter((item) => typeof item.numeric === 'number').slice(0, 8)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => closeButton.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        event.preventDefault()
        closeButton.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-sm sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="stat-insight-title"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
          className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_90%,transparent)] shadow-2xl backdrop-blur-xl"
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <div>
              <p className="ms-eyebrow" style={{ color }}>{details?.eyebrow ?? 'Metric details'}</p>
              <h2 id="stat-insight-title" className="mt-1 font-display text-2xl font-semibold text-[var(--foreground)]">{title}</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {details?.description ?? hint ?? 'A closer look at the currently displayed metric.'}
              </p>
            </div>
            <button ref={closeButton} type="button" onClick={onClose} aria-label="Close details" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted-foreground)] transition hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">
              <X size={18} />
            </button>
          </header>

          <div className="overflow-y-auto p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
              <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_52%,transparent)] p-5">
                <p className="ms-eyebrow">Current value</p>
                <p className="ms-num mt-3 break-words text-4xl font-bold text-[var(--foreground)]">{headline}</p>
                {hint && <p className="mt-2 text-sm text-[var(--muted-foreground)]">{hint}</p>}
                <p className="mt-5 text-xs font-semibold text-[var(--muted-foreground)]">{rows.length} supporting record{rows.length === 1 ? '' : 's'}</p>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_44%,transparent)] p-5">
                <div className="mb-4 flex items-center gap-2">
                  <BarChart3 size={17} style={{ color }} />
                  <h3 className="font-display font-semibold text-[var(--foreground)]">Relative breakdown</h3>
                </div>
                {chartRows.length ? (
                  <div className="space-y-3">
                    {chartRows.map((item, index) => (
                      <div key={`${item.label}-${index}`}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                          <span className="truncate font-semibold text-[var(--foreground)]">{item.label}</span>
                          <span className="ms-num text-[var(--muted-foreground)]">{item.value}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(2, ((item.numeric ?? 0) / maxValue) * 100)}%`, background: color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-28 flex-col items-center justify-center text-center text-sm text-[var(--muted-foreground)]">
                    <ListFilter size={24} className="mb-2" style={{ color }} />
                    This metric is descriptive; its supporting values are listed below.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)]">
              <div className="flex items-center justify-between bg-[color-mix(in_oklab,var(--secondary)_58%,transparent)] px-5 py-3.5">
                <h3 className="font-display font-semibold text-[var(--foreground)]">Supporting details</h3>
                <span className="text-xs text-[var(--muted-foreground)]">{rows.length} records</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-y border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_94%,transparent)]">
                    <tr>
                      <th className="ms-eyebrow px-5 py-3 text-left">Item</th>
                      <th className="ms-eyebrow px-5 py-3 text-left">Context</th>
                      <th className="ms-eyebrow px-5 py-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.pageItems.map((item, index) => (
                      <tr key={`${item.label}-${index}`} className="border-b border-[var(--border)] last:border-b-0">
                        <td className="px-5 py-3 font-semibold text-[var(--foreground)]">{item.label}</td>
                        <td className="px-5 py-3 text-[var(--muted-foreground)]">{item.secondary ?? '—'}</td>
                        <td className="ms-num px-5 py-3 text-right font-semibold text-[var(--foreground)]">{item.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={pagination.page} pageSize={pagination.pageSize} totalItems={rows.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemLabel={details?.itemLabel ?? 'records'} />
            </div>
          </div>
        </motion.section>
      </motion.div>
    </Portal>
  )
}

