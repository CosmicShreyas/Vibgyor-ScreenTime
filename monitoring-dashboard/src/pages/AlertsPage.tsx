import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Ban,
  BellRing,
  AlertCircle,
  Coffee,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  Filter,
  Gauge,
  MessageSquare,
  MousePointer2,
  RefreshCw,
  ShieldCheck,
  X,
  UsersRound,
} from 'lucide-react'
import toast from 'react-hot-toast'
import DateRangeFilter from '../components/DateRangeFilter'
import ThemedSelect from '../components/ThemedSelect'
import { MotionCard, PageShell, Skeleton, StatTile } from '../components/ui'
import { Alert, analyticsService } from '../services/api'
import { downloadCsv } from '../utils/csv'
import { formatClock, getTodayLocalDate } from '../utils/time'

const PAGE_SIZE = 6

const TYPE_LABELS: Record<Alert['type'], string> = {
  high_idle: 'High idle time',
  low_productivity: 'Low productivity',
  offline_during_shift: 'Offline during shift',
  unproductive_overuse: 'Unproductive overuse',
  suspected_fake_activity: 'Activity integrity',
  idle_explanation: 'Idle explanation',
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'All alert types' },
  ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
]

const SEVERITY_OPTIONS = [
  { value: 'all', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
]

function typeIcon(type: Alert['type']) {
  if (type === 'high_idle') return Coffee
  if (type === 'low_productivity') return Gauge
  if (type === 'offline_during_shift') return Ban
  if (type === 'suspected_fake_activity') return MousePointer2
  if (type === 'idle_explanation') return MessageSquare
  return AlertTriangle
}

function formatDurationMinutes(value: number) {
  const totalMinutes = Math.max(0, Math.round(value))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function metric(alert: Alert) {
  if (alert.type === 'low_productivity') {
    return { observed: `${alert.value}%`, threshold: `Below ${alert.threshold}%` }
  }
  if (alert.type === 'idle_explanation') {
    return { observed: `${formatDurationMinutes(alert.value)} idle`, threshold: 'Context submitted' }
  }
  return { observed: formatDurationMinutes(alert.value), threshold: `Limit ${formatDurationMinutes(alert.threshold)}` }
}

function assessment(alert: Alert) {
  if (alert.type === 'low_productivity') {
    return [
      { label: 'Recorded score', value: `${alert.value}%` },
      { label: 'Required score', value: `${alert.threshold}%` },
      { label: 'Below target', value: `${Math.max(0, alert.threshold - alert.value)} pts` },
    ]
  }

  return [
    { label: 'Recorded', value: formatDurationMinutes(alert.value) },
    { label: 'Allowed limit', value: formatDurationMinutes(alert.threshold) },
    { label: 'Over limit', value: formatDurationMinutes(Math.max(0, alert.value - alert.threshold)) },
  ]
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const today = getTodayLocalDate()
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [severity, setSeverity] = useState('all')
  const [type, setType] = useState('all')
  const [employee, setEmployee] = useState('all')
  const [loading, setLoading] = useState(true)
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const response = await analyticsService.getAlerts(startDate, endDate)
      setAlerts(response.alerts)
    } catch (error) {
      console.error(error)
      toast.error('Failed to evaluate alerts')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  const employees = useMemo(
    () => Array.from(new Set(alerts.map((alert) => alert.employee_name))).sort(),
    [alerts]
  )

  useEffect(() => {
    if (employee !== 'all' && !employees.includes(employee)) setEmployee('all')
  }, [employee, employees])

  const filteredAlerts = useMemo(
    () =>
      alerts.filter(
        (alert) =>
          (severity === 'all' || alert.severity === severity) &&
          (type === 'all' || alert.type === type) &&
          (employee === 'all' || alert.employee_name === employee)
      ),
    [alerts, employee, severity, type]
  )
  const pageCount = Math.max(1, Math.ceil(filteredAlerts.length / PAGE_SIZE))
  const visibleAlerts = filteredAlerts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => setPage(1), [startDate, endDate, severity, type, employee])
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount])

  const dismissAlert = async (alert: Alert) => {
    setDismissing((current) => new Set(current).add(alert.id))
    try {
      await analyticsService.dismissAlert(alert.id)
      setAlerts((current) => current.filter((item) => item.id !== alert.id))
      toast.success('Alert dismissed')
    } catch (error) {
      console.error(error)
      toast.error('Failed to dismiss alert')
    } finally {
      setDismissing((current) => {
        const next = new Set(current)
        next.delete(alert.id)
        return next
      })
    }
  }

  const criticalCount = alerts.filter((alert) => alert.severity === 'critical').length
  const warningCount = alerts.filter((alert) => alert.severity === 'warning').length
  const affectedPeople = new Set(alerts.map((alert) => alert.employee_name)).size
  const filtersActive = severity !== 'all' || type !== 'all' || employee !== 'all'

  const exportAlerts = () => {
    if (filteredAlerts.length === 0) {
      toast.error('No alerts to export')
      return
    }
    const rangeLabel = startDate === endDate ? startDate : `${startDate}_to_${endDate}`
    downloadCsv(`Alerts_${rangeLabel}`, [
      ['Range', 'Employee', 'Severity', 'Type', 'Observed', 'Threshold', 'Message'],
      ...filteredAlerts.map((alert) => [
        startDate === endDate ? startDate : `${startDate} → ${endDate}`,
        alert.employee_name,
        alert.severity,
        TYPE_LABELS[alert.type],
        alert.value,
        alert.threshold,
        alert.message,
      ]),
    ])
    toast.success('Alerts exported')
  }

  return (
    <PageShell
      eyebrow="Exception triage"
      title="Alerts Center"
      description="Review operational exceptions, activity-integrity signals, and productivity thresholds that need attention."
      icon={BellRing}
      actions={
        <>
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onChange={(s, e) => {
              setStartDate(s)
              setEndDate(e)
            }}
          />
          <button onClick={loadAlerts} disabled={loading} className="btn-secondary" title="Refresh alerts">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={exportAlerts} disabled={filteredAlerts.length === 0} className="btn-secondary">
            <Download size={16} />
            Export
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open alerts" numeric={alerts.length} icon={BellRing} tone={alerts.length ? 'warning' : 'success'} hint={alerts.length ? 'Needs review' : 'All clear'} />
        <StatTile label="Critical" numeric={criticalCount} icon={AlertCircle} tone={criticalCount ? 'danger' : 'success'} hint="Immediate attention" />
        <StatTile label="Warnings" numeric={warningCount} icon={AlertTriangle} tone={warningCount ? 'warning' : 'success'} hint="Threshold exceeded" />
        <StatTile label="People affected" numeric={affectedPeople} icon={UsersRound} tone="primary" hint={startDate === endDate ? `For ${startDate}` : `${startDate} → ${endDate}`} />
      </div>

      <MotionCard hover={false} className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[var(--primary)]">
            <Filter size={17} />
          </span>
          <div>
            <p className="ms-eyebrow">Queue filters</p>
            <p className="text-xs font-semibold text-[var(--muted-foreground)]">
              {filteredAlerts.length} of {alerts.length} shown
            </p>
          </div>
          {filtersActive && (
            <button
              onClick={() => {
                setSeverity('all')
                setType('all')
                setEmployee('all')
              }}
              className="ml-auto text-xs font-semibold text-[var(--primary)] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ThemedSelect value={severity} onChange={setSeverity} options={SEVERITY_OPTIONS} className="dashboard-control px-3 py-2 text-[13px]" />
          <ThemedSelect value={type} onChange={setType} options={TYPE_OPTIONS} className="dashboard-control px-3 py-2 text-[13px]" />
          <ThemedSelect
            value={employee}
            onChange={setEmployee}
            options={[{ value: 'all', label: 'All employees' }, ...employees.map((name) => ({ value: name, label: name }))]}
            className="dashboard-control px-3 py-2 text-[13px]"
          />
        </div>
      </MotionCard>

      {loading ? (
        <MotionCard hover={false} className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        </MotionCard>
      ) : filteredAlerts.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visibleAlerts.map((alert) => {
            const Icon = typeIcon(alert.type)
            const isCritical = alert.severity === 'critical'
            const tone = isCritical ? 'var(--danger)' : alert.severity === 'warning' ? 'var(--warning)' : 'var(--signal)'
            const values = metric(alert)
            const assessmentItems = assessment(alert)
            return (
              <MotionCard key={alert.id} hover={false} className="overflow-hidden p-0">
                <div className="h-1 w-full" style={{ background: tone }} />
                <div className="p-5">
                  <div className="mb-4 flex flex-wrap items-start gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `color-mix(in oklab, ${tone} 14%, transparent)`, color: tone }}
                    >
                      <Icon size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-base font-semibold text-[var(--foreground)]">{TYPE_LABELS[alert.type]}</h2>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase"
                          style={{ background: `color-mix(in oklab, ${tone} 14%, transparent)`, color: tone }}
                        >
                          {alert.severity}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                        <span>{alert.employee_name}</span>
                        <span className="h-3 w-px bg-[var(--border)]" />
                        <span className="flex items-center gap-1"><Clock3 size={12} />{formatClock(alert.created_at)}</span>
                      </div>
                    </div>
                    <div className="ml-[52px] flex shrink-0 items-center gap-2 sm:ml-0">
                      <button
                        onClick={() => dismissAlert(alert)}
                        disabled={dismissing.has(alert.id)}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs font-semibold text-[var(--muted-foreground)] transition hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-50"
                        title="Dismiss alert"
                      >
                        <X size={14} /> Dismiss
                      </button>
                      <Link
                        to={`/employees/${encodeURIComponent(alert.employee_name)}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] transition hover:border-[var(--ring)] hover:text-[var(--foreground)]"
                        title={`View ${alert.employee_name}`}
                      >
                        <ExternalLink size={15} />
                      </Link>
                    </div>
                  </div>
                  <p className="min-h-10 text-sm leading-relaxed text-[var(--muted-foreground)]">{alert.message}</p>
                  {(!alert.idle_reasons || alert.idle_reasons.length === 0) && alert.type !== 'idle_explanation' && (
                    <div
                      className="mt-4 rounded-lg border p-3.5"
                      style={{
                        borderColor: `color-mix(in oklab, ${tone} 28%, var(--border))`,
                        background: `color-mix(in oklab, ${tone} 7%, transparent)`,
                      }}
                    >
                      <div className="mb-3 flex items-center gap-2" style={{ color: tone }}>
                        <AlertCircle size={15} />
                        <p className="text-[11px] font-bold uppercase">Threshold assessment</p>
                      </div>
                      <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
                        {assessmentItems.map((item) => (
                          <div key={item.label} className="px-3 first:pl-0 last:pr-0">
                            <p className="text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">{item.label}</p>
                            <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {alert.idle_reasons && alert.idle_reasons.length > 0 && (
                    <div className="mt-4 rounded-lg border border-[color-mix(in_oklab,var(--primary)_28%,var(--border))] bg-[color-mix(in_oklab,var(--primary)_8%,transparent)] p-3.5">
                      <div className="mb-2 flex items-center gap-2 text-[var(--primary)]">
                        <MessageSquare size={15} />
                        <p className="text-[11px] font-bold uppercase">Employee response</p>
                      </div>
                      <div className="space-y-1.5">
                        {alert.idle_reasons.map((reason) => (
                          <p key={reason} className="text-sm font-medium leading-relaxed text-[var(--foreground)]">
                            &ldquo;{reason}&rdquo;
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-3 border-t border-[var(--border)] pt-3 text-xs">
                    <span className="font-semibold text-[var(--foreground)]">Observed: {values.observed}</span>
                    <span className="h-3 w-px bg-[var(--border)]" />
                    <span className="text-[var(--muted-foreground)]">{values.threshold}</span>
                  </div>
                </div>
              </MotionCard>
            )
          })}
          {pageCount > 1 && (
            <div className="col-span-full mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredAlerts.length)} of {filteredAlerts.length}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="btn-secondary h-9 px-2.5" title="Previous page"><ChevronLeft size={16} /></button>
                <span className="min-w-20 text-center text-xs font-semibold text-[var(--foreground)]">Page {page} of {pageCount}</span>
                <button onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount} className="btn-secondary h-9 px-2.5" title="Next page"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <MotionCard hover={false} className="p-5">
          <div className="empty-state min-h-52">
            <ShieldCheck className="mb-3 text-[var(--success)]" size={38} />
            <p className="mb-2 font-display font-semibold text-[var(--foreground)]">
              {filtersActive ? 'No alerts match these filters' : 'No active alerts for this date'}
            </p>
            <p className="max-w-md text-sm">
              {filtersActive ? 'Clear or adjust the filters to review other exceptions.' : 'All monitored activity is currently within the configured thresholds.'}
            </p>
          </div>
        </MotionCard>
      )}
    </PageShell>
  )
}
