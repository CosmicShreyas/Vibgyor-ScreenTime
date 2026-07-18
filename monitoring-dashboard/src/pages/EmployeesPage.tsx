import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, Eye, Users, Activity, Clock3, UserX } from 'lucide-react'
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

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [filteredEmployees, setFilteredEmployees] = useState<EmployeeSummary[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

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
      case 'offline':
        return 'status-offline'
      default:
        return 'status-offline'
    }
  }

  const activeCount = employees.filter((e) => e.status === 'active').length
  const idleCount = employees.filter((e) => e.status === 'idle').length
  const offlineCount = employees.filter((e) => e.status === 'offline').length

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
      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Employees" numeric={employees.length} icon={Users} tone="primary" hint="Total tracked" />
        <StatTile label="Active" numeric={activeCount} icon={Activity} tone="success" hint="Working now" />
        <StatTile label="Idle" numeric={idleCount} icon={Clock3} tone="warning" hint="Present but inactive" />
        <StatTile label="Offline" numeric={offlineCount} icon={UserX} tone="danger" hint="Not connected" />
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
                filteredEmployees.map((employee) => (
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
                        {employee.status.charAt(0).toUpperCase() + employee.status.slice(1)}
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
      </MotionCard>
    </PageShell>
  )
}
