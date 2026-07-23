import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Search, Eye, Users, Activity, Clock3, PauseCircle, UserX } from 'lucide-react'
import { employeeService, EmployeeSummary } from '../services/api'
import { formatRelativeTime, formatTimeIntelligent } from '../utils/time'
import { websocketService } from '../services/websocket'
import toast from 'react-hot-toast'
import {
  PageShell,
  MotionCard,
  Stagger,
  StatTile,
  SectionHeader,
  LiveBadge,
  Skeleton,
} from '../components/ui'
import { motion } from 'framer-motion'
import { staggerContainer, riseItem } from '../components/ui/motion'
import MetricDetailsModal, { MetricEmployeeRow, MetricTone } from '../components/MetricDetailsModal'
import Pagination, { usePagination } from '../components/Pagination'

export default function EmployeesPage() {
  type WorkforceMetric = 'employees' | 'active' | 'idle' | 'paused' | 'offline'
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [filteredEmployees, setFilteredEmployees] = useState<EmployeeSummary[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeMetric, setActiveMetric] = useState<WorkforceMetric | null>(null)

  useEffect(() => {
    loadEmployees()
    websocketService.connect()

    const handleUpdate = () => {
      loadEmployees()
    }

    websocketService.on('employee_update', handleUpdate)

    return () => {
      websocketService.off('employee_update', handleUpdate)
    }
  }, [])

  useEffect(() => {
    if (searchQuery) {
      setFilteredEmployees(
        employees.filter((emp) =>
          emp.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    } else {
      setFilteredEmployees(employees)
    }
  }, [searchQuery, employees])

  const loadEmployees = async () => {
    try {
      const data = await employeeService.getAll()
      console.log('📊 Employees data received:', data)
      console.log('📍 Employees with location:', data.filter(e => e.location).length)
      data.forEach(emp => {
        if (emp.location) {
          console.log(`  ✅ ${emp.name}: ${emp.location.city}, ${emp.location.state}`)
        } else {
          console.log(`  ❌ ${emp.name}: No location`)
        }
      })
      setEmployees(data)
      setFilteredEmployees(data)
    } catch (error) {
      toast.error('Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'status-active'
      case 'idle':
        return 'status-idle'
      case 'paused':
        return 'status-paused'
      case 'offline':
        return 'status-offline'
      default:
        return 'status-offline'
    }
  }

  const activeCount = employees.filter((e) => e.status === 'active').length
  const idleCount = employees.filter((e) => e.status === 'idle').length
  const pausedCount = employees.filter((e) => e.status === 'paused').length
  const offlineCount = employees.filter((e) => e.status === 'offline').length
  const metricRows = useMemo<MetricEmployeeRow[]>(() => employees.map((employee) => ({
    name: employee.name,
    status: employee.status,
    workSeconds: employee.work_time_today,
    idleSeconds: employee.idle_time_today,
    lastUpdate: employee.last_update,
    location: employee.location ? [employee.location.city, employee.location.state].filter(Boolean).join(', ') : undefined,
  })), [employees])

  const metricConfig: Record<WorkforceMetric, {
    title: string
    eyebrow: string
    headline: string
    description: string
    tone: MetricTone
    rows: MetricEmployeeRow[]
  }> = {
    employees: {
      title: 'Complete employee roster', eyebrow: 'Workforce overview', headline: String(employees.length), tone: 'primary',
      description: 'Status composition, work-time comparison, locations, and recent connectivity for every tracked employee.', rows: metricRows,
    },
    active: {
      title: 'Active employees', eyebrow: 'Working now', headline: String(activeCount), tone: 'success',
      description: 'Employees with a current heartbeat, including today’s productive and idle-time breakdown.', rows: metricRows.filter((row) => row.status === 'active'),
    },
    idle: {
      title: 'Idle employees', eyebrow: 'Present but inactive', headline: String(idleCount), tone: 'warning',
      description: 'Connected employees without recent activity, with their latest update and tracked-time context.', rows: metricRows.filter((row) => row.status === 'idle'),
    },
    paused: {
      title: 'Paused monitoring', eyebrow: 'Client connected', headline: String(pausedCount), tone: 'danger',
      description: 'Employees whose client is online but who have deliberately paused activity collection.', rows: metricRows.filter((row) => row.status === 'paused'),
    },
    offline: {
      title: 'Offline employees', eyebrow: 'Not connected', headline: String(offlineCount), tone: 'danger',
      description: 'Disconnected employees and their most recent heartbeat, location, and activity totals.', rows: metricRows.filter((row) => row.status === 'offline'),
    },
  }
  const employeePagination = usePagination(filteredEmployees, 10)

  useEffect(() => {
    employeePagination.setPage(1)
    // Pagination should return to the first matching result when search changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  if (loading) {
    return (
      <div className="app-page">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="ms-card p-5"><Skeleton className="h-3 w-20" /><Skeleton className="mt-3 h-8 w-16" /></div>
          <div className="ms-card p-5"><Skeleton className="h-3 w-20" /><Skeleton className="mt-3 h-8 w-16" /></div>
          <div className="ms-card p-5"><Skeleton className="h-3 w-20" /><Skeleton className="mt-3 h-8 w-16" /></div>
          <div className="ms-card p-5"><Skeleton className="h-3 w-20" /><Skeleton className="mt-3 h-8 w-16" /></div>
        </div>
        <div className="ms-card p-5">
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="ms-card p-5 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <PageShell
      eyebrow="People operations"
      title="Workforce"
      description="Monitor employee presence, device activity, location context, and daily productivity from one operational view."
      icon={Users}
      actions={<LiveBadge label="Live" tone="signal" />}
    >
      {/* Status KPIs */}
      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Employees" numeric={employees.length} icon={Users} tone="primary" hint="Total tracked" onClick={() => setActiveMetric('employees')} />
        <StatTile label="Active" numeric={activeCount} icon={Activity} tone="success" hint="Working now" onClick={() => setActiveMetric('active')} />
        <StatTile label="Idle" numeric={idleCount} icon={Clock3} tone="warning" hint="Present but inactive" onClick={() => setActiveMetric('idle')} />
        <StatTile label="Paused" numeric={pausedCount} icon={PauseCircle} tone="danger" hint="Monitoring paused" onClick={() => setActiveMetric('paused')} />
        <StatTile label="Offline" numeric={offlineCount} icon={UserX} tone="danger" hint="Not connected" onClick={() => setActiveMetric('offline')} />
      </Stagger>

      {/* Search */}
      <MotionCard className="p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
            size={20}
          />
          <input
            type="text"
            placeholder="Search employees by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="dashboard-control w-full py-3 pl-11 pr-4 shadow-sm"
          />
        </div>
      </MotionCard>

      {/* Roster table */}
      <MotionCard hover={false} className="overflow-hidden p-0">
        <div className="p-5 pb-0">
          <SectionHeader
            eyebrow="Roster"
            title="Employee Directory"
            icon={Users}
            action={
              <span className="text-xs font-semibold text-[var(--muted-foreground)]">
                {filteredEmployees.length} of {employees.length}
              </span>
            }
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-[var(--border)] bg-[color-mix(in_oklab,var(--secondary)_60%,transparent)]">
                <th className="ms-eyebrow px-5 py-3 text-left font-semibold">Employee</th>
                <th className="ms-eyebrow px-5 py-3 text-left font-semibold">Status</th>
                <th className="ms-eyebrow px-5 py-3 text-left font-semibold">Work Time Today</th>
                <th className="ms-eyebrow px-5 py-3 text-left font-semibold">Idle Time Today</th>
                <th className="ms-eyebrow px-5 py-3 text-left font-semibold">Last Update</th>
                <th className="ms-eyebrow px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[var(--muted-foreground)]">
                    No employees found
                  </td>
                </tr>
              ) : (
                employeePagination.pageItems.map((employee) => (
                  <motion.tr
                    key={employee.name}
                    variants={riseItem}
                    className="group border-b border-[var(--border)] transition-colors last:border-b-0 hover:bg-[color-mix(in_oklab,var(--accent)_60%,transparent)]"
                  >
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--primary)_88%,transparent)] font-semibold text-[var(--primary-foreground)] shadow-[0_8px_20px_-12px_var(--primary)] transition-transform duration-200 group-hover:scale-105">
                          {employee.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-[var(--foreground)]">
                            {employee.name}
                          </span>
                          {employee.location && (
                            <p className="text-xs text-[var(--muted-foreground)]">
                              ({employee.location.city}, {employee.location.state})
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span className={`status-pill ${getStatusColor(employee.status)}`}>
                        {employee.status === 'paused' ? 'Has paused monitoring' : employee.status.charAt(0).toUpperCase() + employee.status.slice(1)}
                      </span>
                    </td>
                    <td className="ms-num whitespace-nowrap px-5 py-3.5 text-[var(--foreground)]">
                      {formatTimeIntelligent(employee.work_time_today)}
                    </td>
                    <td className="ms-num whitespace-nowrap px-5 py-3.5 text-[var(--foreground)]">
                      {formatTimeIntelligent(employee.idle_time_today)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-[var(--muted-foreground)]">
                      {formatRelativeTime(employee.last_update)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <Link
                        to={`/employees/${encodeURIComponent(employee.name)}`}
                        className="btn-secondary inline-flex py-2"
                      >
                        <Eye size={16} />
                        Inspect
                      </Link>
                    </td>
                  </motion.tr>
                ))
              )}
            </motion.tbody>
          </table>
        </div>
        <Pagination
          page={employeePagination.page}
          pageSize={employeePagination.pageSize}
          totalItems={filteredEmployees.length}
          onPageChange={employeePagination.setPage}
          onPageSizeChange={employeePagination.setPageSize}
          itemLabel="employees"
        />
      </MotionCard>
      {activeMetric && (
        <MetricDetailsModal
          open
          onClose={() => setActiveMetric(null)}
          populationSize={metricRows.length}
          {...metricConfig[activeMetric]}
        />
      )}
    </PageShell>
  )
}
