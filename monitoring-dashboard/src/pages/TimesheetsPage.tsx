import { useState } from 'react'
import { employeeService } from '../services/api'
import toast from 'react-hot-toast'
import { Calendar, Download, FileSpreadsheet, TimerReset, Clock3, CalendarClock } from 'lucide-react'
import * as XLSX from 'xlsx'
import ThemedSelect from '../components/ThemedSelect'
import { APP_TZ, formatHMSPadded } from '../utils/time'
import { PageShell, MotionCard, SectionHeader, StatTile } from '../components/ui'
import Pagination, { usePagination } from '../components/Pagination'

interface TimesheetEntry {
  employee_name: string
  first_activity: string
  last_activity: string
  productive_hours: number
  idle_hours: number
  offline_hours: number
  total_hours: number
}

export default function TimesheetsPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const [timesheetData, setTimesheetData] = useState<TimesheetEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const timesheetPagination = usePagination(timesheetData, 10)

  const loadTimesheetData = async () => {
    try {
      setLoading(true)
      const [year, month] = selectedMonth.split('-').map(Number)

      const data = await employeeService.getMonthlyTimesheet(year, month)

      setTimesheetData(data)
      setDataLoaded(true)
      toast.success(`Loaded timesheet for ${getMonthName(month)} ${year}`)
    } catch (error) {
      toast.error('Failed to load timesheet data')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const exportToExcel = () => {
    if (timesheetData.length === 0) {
      toast.error('No data to export')
      return
    }

    try {
      const [year, month] = selectedMonth.split('-').map(Number)
      const monthName = getMonthName(month)

      // Prepare main data
      const mainData = timesheetData.map((entry, index) => ({
        'Sr no': index + 1,
        'Employee name': entry.employee_name,
        'Days present': (entry as any).days_present ?? '',
        'First activity': formatDateTime(entry.first_activity),
        'Last activity': formatDateTime(entry.last_activity),
        'Productive hours': formatHours(entry.productive_hours),
        'Idle hours': formatHours(entry.idle_hours),
        'Offline hours': formatHours(entry.offline_hours),
        'Total hours': formatHours(entry.total_hours),
      }))

      const workbook = XLSX.utils.book_new()

      // Add main sheet
      const mainSheet = XLSX.utils.json_to_sheet(mainData)
      XLSX.utils.book_append_sheet(workbook, mainSheet, 'Timesheet')

      // Download file
      const fileName = `Timesheet_${monthName}_${year}.xlsx`
      XLSX.writeFile(workbook, fileName)

      toast.success(`Exported ${fileName}`)
    } catch (error) {
      toast.error('Failed to export Excel file')
      console.error(error)
    }
  }

  const getMonthName = (month: number): string => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December']
    return months[month - 1]
  }

  const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString)
    // Render in the business timezone so the exported times match the employee's
    // local wall clock, not the browser's.
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: APP_TZ,
    })
  }

  const formatHours = (hours: number): string => formatHMSPadded(hours * 3600)

  const [year, month] = selectedMonth.split('-').map(Number)
  const monthName = getMonthName(month)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date()
    date.setMonth(date.getMonth() - i)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    return { value, label }
  })

  // Aggregate summary metrics (display only; not exported)
  const totalProductive = timesheetData.reduce((sum, e) => sum + e.productive_hours, 0)
  const totalTracked = timesheetData.reduce((sum, e) => sum + e.total_hours, 0)

  return (
    <PageShell
      eyebrow="Monthly work ledger"
      title="Timesheets"
      description="Generate auditable monthly attendance and activity summaries for payroll, compliance, and client reporting."
      icon={TimerReset}
      actions={
        <>
          <ThemedSelect
            value={selectedMonth}
            onChange={(nextValue) => {
              setSelectedMonth(nextValue)
              setDataLoaded(false)
            }}
            options={monthOptions}
            className="dashboard-control px-3 py-2 text-[13px]"
          />
          <button
            onClick={loadTimesheetData}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-b-white"></div>
                Loading...
              </>
            ) : (
              <>
                <FileSpreadsheet size={18} />
                Load Data
              </>
            )}
          </button>
          <button
            onClick={exportToExcel}
            disabled={!dataLoaded || timesheetData.length === 0}
            className="btn-secondary"
          >
            <Download size={18} />
            Export
          </button>
        </>
      }
    >
      {/* Context strip */}
      <MotionCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--signal)_16%,transparent)] text-[var(--signal)]">
            <Calendar size={18} />
          </span>
          <div>
            <p className="ms-eyebrow">Reporting period</p>
            <p className="font-display text-sm font-semibold text-[var(--foreground)]">
              {monthName} {year}
            </p>
          </div>
        </div>
        {dataLoaded && (
          <span className="rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_80%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
            {timesheetData.length} employee{timesheetData.length !== 1 ? 's' : ''}
          </span>
        )}
      </MotionCard>

      {/* Summary StatTiles */}
      {dataLoaded && timesheetData.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            label="Employees"
            numeric={timesheetData.length}
            icon={FileSpreadsheet}
            tone="primary"
            details={{
              eyebrow: 'Monthly workforce',
              description: `Employees represented in the ${monthName} ${year} ledger.`,
              itemLabel: 'employees',
              items: timesheetData.map((entry) => ({ label: entry.employee_name, value: formatHours(entry.total_hours), numeric: entry.total_hours, secondary: `${formatHours(entry.productive_hours)} productive` })),
            }}
          />
          <StatTile
            label="Productive hours"
            value={formatHours(totalProductive)}
            icon={Clock3}
            tone="success"
            hint="Total across all employees"
            details={{
              eyebrow: 'Productive-time breakdown',
              description: `Productive hours by employee for ${monthName} ${year}.`,
              itemLabel: 'employees',
              items: [...timesheetData].sort((a, b) => b.productive_hours - a.productive_hours).map((entry) => ({ label: entry.employee_name, value: formatHours(entry.productive_hours), numeric: entry.productive_hours, secondary: `${formatHours(entry.total_hours)} tracked` })),
            }}
          />
          <StatTile
            label="Tracked hours"
            value={formatHours(totalTracked)}
            icon={CalendarClock}
            tone="signal"
            hint="Total across all employees"
            details={{
              eyebrow: 'Tracked-time breakdown',
              description: `Total tracked hours by employee for ${monthName} ${year}.`,
              itemLabel: 'employees',
              items: [...timesheetData].sort((a, b) => b.total_hours - a.total_hours).map((entry) => ({ label: entry.employee_name, value: formatHours(entry.total_hours), numeric: entry.total_hours, secondary: `${formatHours(entry.idle_hours)} idle · ${formatHours(entry.offline_hours)} offline` })),
            }}
          />
        </div>
      )}

      {/* Table */}
      {dataLoaded && (
        <MotionCard hover={false} className="overflow-hidden p-5">
          <SectionHeader
            eyebrow="Detailed ledger"
            title="Monthly Timesheet"
            icon={TimerReset}
          />
          <div className="pro-table-wrap">
            <div className="overflow-x-auto">
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>Sr no</th>
                    <th>Employee name</th>
                    <th>First activity</th>
                    <th>Last activity</th>
                    <th>Productive hours</th>
                    <th>Idle hours</th>
                    <th>Offline hours</th>
                    <th>Total hours</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheetData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-[var(--muted-foreground)]">
                        No timesheet data available for this month
                      </td>
                    </tr>
                  ) : (
                    timesheetPagination.pageItems.map((entry, index) => (
                      <tr key={index}>
                        <td className="whitespace-nowrap">
                          {(timesheetPagination.page - 1) * timesheetPagination.pageSize + index + 1}
                        </td>
                        <td className="whitespace-nowrap font-semibold">
                          {entry.employee_name}
                        </td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">
                          {formatDateTime(entry.first_activity)}
                        </td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">
                          {formatDateTime(entry.last_activity)}
                        </td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">
                          {formatHours(entry.productive_hours)}
                        </td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">
                          {formatHours(entry.idle_hours)}
                        </td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">
                          {formatHours(entry.offline_hours)}
                        </td>
                        <td className="whitespace-nowrap font-semibold">
                          {formatHours(entry.total_hours)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            page={timesheetPagination.page}
            pageSize={timesheetPagination.pageSize}
            totalItems={timesheetData.length}
            onPageChange={timesheetPagination.setPage}
            onPageSizeChange={timesheetPagination.setPageSize}
            itemLabel="employees"
          />
        </MotionCard>
      )}

      {/* Empty state */}
      {!dataLoaded && !loading && (
        <MotionCard hover={false} className="p-5">
          <div className="empty-state">
            <FileSpreadsheet className="mb-3" size={38} />
            <p className="mb-2">
              Select a month and click "Load Data" to view timesheet
            </p>
            <p className="text-sm">
              You can export the data to Excel format after loading
            </p>
          </div>
        </MotionCard>
      )}
    </PageShell>
  )
}
