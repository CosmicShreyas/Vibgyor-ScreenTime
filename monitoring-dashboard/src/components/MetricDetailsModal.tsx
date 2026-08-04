import { useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { Activity, BarChart3, Clock3, MapPin, PauseCircle, UserX, Users, X } from 'lucide-react'
import Portal from './ui/Portal'
import { formatRelativeTime, formatTimeIntelligent } from '../utils/time'
import Pagination, { usePagination } from './Pagination'

export type MetricTone = 'primary' | 'success' | 'warning' | 'danger'

export interface MetricEmployeeRow {
  name: string
  status: 'active' | 'idle' | 'paused' | 'offline'
  workSeconds: number
  idleSeconds: number
  lastUpdate?: string
  location?: string
}

interface MetricDetailsModalProps {
  open: boolean
  onClose: () => void
  title: string
  eyebrow: string
  headline: string
  description: string
  tone: MetricTone
  rows: MetricEmployeeRow[]
  populationSize: number
}

const toneColors: Record<MetricTone, string> = {
  primary: 'var(--primary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
}

const statusColors = {
  active: 'var(--success)',
  idle: 'var(--warning)',
  paused: 'var(--danger)',
  offline: 'var(--danger)',
}

export default function MetricDetailsModal({
  open,
  onClose,
  title,
  eyebrow,
  headline,
  description,
  tone,
  rows,
  populationSize,
}: MetricDetailsModalProps) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const toneColor = toneColors[tone]

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

  const analysis = useMemo(() => {
    const counts = {
      active: rows.filter((row) => row.status === 'active').length,
      idle: rows.filter((row) => row.status === 'idle').length,
      paused: rows.filter((row) => row.status === 'paused').length,
      offline: rows.filter((row) => row.status === 'offline').length,
    }
    const totalWork = rows.reduce((sum, row) => sum + row.workSeconds, 0)
    const totalIdle = rows.reduce((sum, row) => sum + row.idleSeconds, 0)
    const ranked = [...rows].sort((a, b) => b.workSeconds - a.workSeconds)
    const maxWork = Math.max(1, ...ranked.map((row) => row.workSeconds))
    return { counts, totalWork, totalIdle, ranked, maxWork }
  }, [rows])
  const tablePagination = usePagination(analysis.ranked, 8)

  if (!open) return null

  const selectedPercent = populationSize > 0 ? Math.round((rows.length / populationSize) * 100) : 0
  const statusTotal = Math.max(1, rows.length)

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-sm sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="metric-details-title"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
          className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_88%,transparent)] shadow-2xl backdrop-blur-xl"
        >
          <header className="flex items-start justify-between gap-5 border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <div>
              <p className="ms-eyebrow" style={{ color: toneColor }}>{eyebrow}</p>
              <h2 id="metric-details-title" className="mt-1 font-display text-2xl font-semibold text-[var(--foreground)]">{title}</h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">{description}</p>
            </div>
            <button
              ref={closeButton}
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_72%,transparent)] text-[var(--muted-foreground)] transition hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              <X size={18} />
            </button>
          </header>

          <div className="overflow-y-auto p-5 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_52%,transparent)] p-5">
                <div className="flex items-center gap-5">
                  <div
                    className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `conic-gradient(${toneColor} ${selectedPercent * 3.6}deg, color-mix(in oklab, var(--muted) 82%, transparent) 0deg)` }}
                    aria-label={`${selectedPercent}% of the workforce`}
                  >
                    <div className="flex h-[92px] w-[92px] flex-col items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--card)_94%,transparent)]">
                      <span className="ms-num text-2xl font-bold text-[var(--foreground)]">{selectedPercent}%</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">workforce</span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="ms-eyebrow">Current measure</p>
                    <p className="ms-num mt-2 text-4xl font-bold text-[var(--foreground)]">{headline}</p>
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">{rows.length} matching employee{rows.length === 1 ? '' : 's'} out of {populationSize}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_52%,transparent)] p-5">
                <div className="mb-4 flex items-center gap-2">
                  <BarChart3 size={17} className="text-[var(--primary)]" />
                  <h3 className="font-display font-semibold text-[var(--foreground)]">Status composition</h3>
                </div>
                <div className="flex h-3 overflow-hidden rounded-full bg-[var(--muted)]">
                  {(['active', 'idle', 'paused', 'offline'] as const).map((status) => (
                    <div
                      key={status}
                      style={{ width: `${(analysis.counts[status] / statusTotal) * 100}%`, background: statusColors[status] }}
                    />
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatusSummary icon={Activity} label="Active" value={analysis.counts.active} color={statusColors.active} />
                  <StatusSummary icon={Clock3} label="Idle" value={analysis.counts.idle} color={statusColors.idle} />
                  <StatusSummary icon={PauseCircle} label="Paused" value={analysis.counts.paused} color={statusColors.paused} />
                  <StatusSummary icon={UserX} label="Offline" value={analysis.counts.offline} color={statusColors.offline} />
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_44%,transparent)] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Clock3 size={17} className="text-[var(--warning)]" />
                    <h3 className="font-display font-semibold text-[var(--foreground)]">Work-time comparison</h3>
                  </div>
                  <span className="text-xs text-[var(--muted-foreground)]">Top {Math.min(8, rows.length)}</span>
                </div>
                {analysis.ranked.length === 0 ? (
                  <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">No employees in this segment.</p>
                ) : (
                  <div className="space-y-3">
                    {analysis.ranked.slice(0, 8).map((row) => (
                      <div key={row.name}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                          <span className="truncate font-semibold text-[var(--foreground)]">{row.name}</span>
                          <span className="ms-num text-[var(--muted-foreground)]">{formatTimeIntelligent(row.workSeconds)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                          <div className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--signal)]" style={{ width: `${Math.max(2, (row.workSeconds / analysis.maxWork) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 self-start">
                <SummaryBox label="Employees" value={String(rows.length)} icon={Users} color={toneColor} />
                <SummaryBox label="Work time" value={formatTimeIntelligent(analysis.totalWork)} icon={Activity} color="var(--success)" />
                <SummaryBox label="Idle time" value={formatTimeIntelligent(analysis.totalIdle)} icon={Clock3} color="var(--warning)" />
                <SummaryBox label="Locations" value={String(new Set(rows.map((row) => row.location).filter(Boolean)).size)} icon={MapPin} color="var(--signal)" />
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)]">
              <div className="flex items-center justify-between bg-[color-mix(in_oklab,var(--secondary)_58%,transparent)] px-5 py-3.5">
                <h3 className="font-display font-semibold text-[var(--foreground)]">Employee breakdown</h3>
                <span className="text-xs font-semibold text-[var(--muted-foreground)]">{rows.length} records</span>
              </div>
              <div className="max-h-[300px] overflow-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="sticky top-0 bg-[color-mix(in_oklab,var(--card)_96%,transparent)]">
                    <tr className="border-y border-[var(--border)]">
                      <th className="ms-eyebrow px-5 py-3 text-left">Employee</th>
                      <th className="ms-eyebrow px-5 py-3 text-left">Status</th>
                      <th className="ms-eyebrow px-5 py-3 text-right">Work</th>
                      <th className="ms-eyebrow px-5 py-3 text-right">Idle</th>
                      <th className="ms-eyebrow px-5 py-3 text-left">Last update</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tablePagination.pageItems.map((row) => (
                      <tr key={row.name} className="border-b border-[var(--border)] last:border-b-0">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-[var(--foreground)]">{row.name}</p>
                          {row.location && <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{row.location}</p>}
                        </td>
                        <td className="px-5 py-3"><span className={`status-pill status-${row.status}`}>{row.status === 'paused' ? 'Has paused monitoring' : row.status}</span></td>
                        <td className="ms-num px-5 py-3 text-right text-[var(--foreground)]">{formatTimeIntelligent(row.workSeconds)}</td>
                        <td className="ms-num px-5 py-3 text-right text-[var(--foreground)]">{formatTimeIntelligent(row.idleSeconds)}</td>
                        <td className="px-5 py-3 text-[var(--muted-foreground)]">{row.lastUpdate ? formatRelativeTime(row.lastUpdate) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={tablePagination.page}
                pageSize={tablePagination.pageSize}
                totalItems={analysis.ranked.length}
                onPageChange={tablePagination.setPage}
                onPageSizeChange={tablePagination.setPageSize}
                itemLabel="employees"
              />
            </div>
          </div>
        </motion.section>
      </motion.div>
    </Portal>
  )
}

function StatusSummary({ icon: Icon, label, value, color }: { icon: typeof Activity; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_62%,transparent)] p-3">
      <Icon size={15} style={{ color }} />
      <p className="ms-num mt-2 text-xl font-bold text-[var(--foreground)]">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
    </div>
  )
}

function SummaryBox({ icon: Icon, label, value, color }: { icon: typeof Activity; label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_50%,transparent)] p-4">
      <Icon size={17} style={{ color }} />
      <p className="ms-num mt-3 truncate text-xl font-bold text-[var(--foreground)]">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
    </div>
  )
}
