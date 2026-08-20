import { useMemo, useState } from 'react'
import { employeeService } from '../services/api'
import toast from 'react-hot-toast'
import { Calendar, Download, FileSpreadsheet, TimerReset, Clock3, CalendarClock } from 'lucide-react'
import * as XLSX from 'xlsx'
import ThemedSelect from '../components/ThemedSelect'
import ThemedDatePicker from '../components/ThemedDatePicker'
import { APP_TZ, formatHMSPadded } from '../utils/time'
import { PageShell, MotionCard, SectionHeader, StatTile } from '../components/ui'
import Pagination, { usePagination } from '../components/Pagination'

type ReportingPeriod = 'daily' | 'weekly' | 'monthly'
type DayStatus = 'present' | 'absent' | 'week_off' | 'week_off_worked' | 'upcoming'

interface DailyTimesheetEntry {
  date: string
  is_working_day: boolean
  status: DayStatus
  first_activity: string | null
  last_activity: string | null
  productive_hours: number
  idle_hours: number
  offline_hours: number
  total_hours: number
}

interface TimesheetEntry {
  employee_name: string
  first_activity: string | null
  last_activity: string | null
  days_present: number
  working_days: number
  non_working_days: number
  absent_days: number
  productive_hours: number
  idle_hours: number
  offline_hours: number
  total_hours: number
  daily_breakdown: DailyTimesheetEntry[]
}

interface DailyLedgerRow extends DailyTimesheetEntry {
  employee_name: string
}

const dateKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`

const currentDateKey = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values: Record<string, string> = {}
  parts.forEach((part) => { if (part.type !== 'literal') values[part.type] = part.value })
  return `${values.year}-${values.month}-${values.day}`
}

const isoWeekValue = (dateString: string): string => {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const isoWeekRange = (value: string): { startDate: string; endDate: string } => {
  const match = /^(\d{4})-W(\d{2})$/.exec(value)
  if (!match) throw new Error('Invalid ISO week')
  const year = Number(match[1])
  const week = Number(match[2])
  const januaryFourth = new Date(Date.UTC(year, 0, 4))
  const januaryFourthDay = januaryFourth.getUTCDay() || 7
  const monday = new Date(januaryFourth)
  monday.setUTCDate(januaryFourth.getUTCDate() - januaryFourthDay + 1 + (week - 1) * 7)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return { startDate: dateKey(monday), endDate: dateKey(sunday) }
}

const getMonthName = (month: number): string => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return months[month - 1]
}

const formatCalendarDate = (value: string, includeYear = true): string =>
  new Date(`${value}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: includeYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  })

const statusLabel = (status: DayStatus): string => ({
  present: 'Present',
  absent: 'Absent',
  week_off: 'Week off',
  week_off_worked: 'Week off · worked',
  upcoming: 'Upcoming',
}[status])

const statusClass = (status: DayStatus): string => {
  if (status === 'present') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500'
  if (status === 'absent') return 'border-rose-500/25 bg-rose-500/10 text-rose-500'
  if (status === 'week_off_worked') return 'border-sky-500/25 bg-sky-500/10 text-sky-500'
  if (status === 'upcoming') return 'border-slate-500/25 bg-slate-500/10 text-[var(--muted-foreground)]'
  return 'border-amber-500/25 bg-amber-500/10 text-amber-500'
}

export default function TimesheetsPage() {
  const today = useMemo(currentDateKey, [])
  const [reportingPeriod, setReportingPeriod] = useState<ReportingPeriod>('monthly')
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedWeek, setSelectedWeek] = useState(() => isoWeekValue(today))
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7))
  const [timesheetData, setTimesheetData] = useState<TimesheetEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)

  const selectedRange = useMemo(() => {
    if (reportingPeriod === 'daily') {
      return {
        startDate: selectedDate,
        endDate: selectedDate,
        label: formatCalendarDate(selectedDate),
        fileLabel: `Daily_${selectedDate}`,
      }
    }
    if (reportingPeriod === 'weekly') {
      const range = isoWeekRange(selectedWeek)
      return {
        ...range,
        label: `${formatCalendarDate(range.startDate, false)} – ${formatCalendarDate(range.endDate)}`,
        fileLabel: `Weekly_${range.startDate}_to_${range.endDate}`,
      }
    }
    const [year, month] = selectedMonth.split('-').map(Number)
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return {
      startDate: `${selectedMonth}-01`,
      endDate: `${selectedMonth}-${String(lastDay).padStart(2, '0')}`,
      label: `${getMonthName(month)} ${year}`,
      fileLabel: `Monthly_${getMonthName(month)}_${year}`,
    }
  }, [reportingPeriod, selectedDate, selectedMonth, selectedWeek])

  const dailyRows = useMemo<DailyLedgerRow[]>(() =>
    timesheetData.flatMap((entry) => entry.daily_breakdown.map((day) => ({
      ...day,
      employee_name: entry.employee_name,
    }))), [timesheetData])

  const monthlyPagination = usePagination(timesheetData, 10)
  const dailyPagination = usePagination(dailyRows, 25)
  const totalProductive = timesheetData.reduce((sum, entry) => sum + entry.productive_hours, 0)
  const totalTracked = timesheetData.reduce((sum, entry) => sum + entry.total_hours, 0)
  const periodTitle = `${reportingPeriod[0].toUpperCase()}${reportingPeriod.slice(1)} Timesheet`

  const setPeriod = (value: string) => {
    setReportingPeriod(value as ReportingPeriod)
    setDataLoaded(false)
  }

  const setSelectorValue = (value: string) => {
    if (reportingPeriod === 'daily') setSelectedDate(value)
    else if (reportingPeriod === 'weekly') setSelectedWeek(isoWeekValue(value))
    else setSelectedMonth(value.slice(0, 7))
    setDataLoaded(false)
  }

  const selectorValue = reportingPeriod === 'daily'
    ? selectedDate
    : reportingPeriod === 'weekly' ? selectedRange.startDate : `${selectedMonth}-01`

  const loadTimesheetData = async () => {
    try {
      setLoading(true)
      const data = await employeeService.getTimesheetRange(selectedRange.startDate, selectedRange.endDate)
      setTimesheetData(data)
      setDataLoaded(true)
      toast.success(`Loaded ${reportingPeriod} timesheet for ${selectedRange.label}`)
    } catch (error) {
      toast.error('Failed to load timesheet data')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: APP_TZ,
    })
  }

  const formatHours = (hours: number): string => formatHMSPadded(hours * 3600)

  const exportToExcel = () => {
    if (timesheetData.length === 0) {
      toast.error('No data to export')
      return
    }

    try {
      const rows = reportingPeriod === 'monthly'
        ? timesheetData.map((entry, index) => ({
          'Sr no': index + 1,
          'Employee name': entry.employee_name,
          'Days present': entry.days_present,
          'Working days': entry.working_days,
          'Week offs': entry.non_working_days,
          'Absent days': entry.absent_days,
          'First activity': formatDateTime(entry.first_activity),
          'Last activity': formatDateTime(entry.last_activity),
          'Productive hours': formatHours(entry.productive_hours),
          'Idle hours': formatHours(entry.idle_hours),
          'Offline hours': formatHours(entry.offline_hours),
          'Total hours': formatHours(entry.total_hours),
        }))
        : dailyRows.map((entry, index) => ({
          'Sr no': index + 1,
          'Employee name': entry.employee_name,
          Date: entry.date,
          Day: formatCalendarDate(entry.date, false).split(',')[0],
          Status: statusLabel(entry.status),
          'First activity': formatDateTime(entry.first_activity),
          'Last activity': formatDateTime(entry.last_activity),
          'Productive hours': formatHours(entry.productive_hours),
          'Idle hours': formatHours(entry.idle_hours),
          'Offline hours': formatHours(entry.offline_hours),
          'Total hours': formatHours(entry.total_hours),
        }))

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Timesheet')
      const fileName = `Timesheet_${selectedRange.fileLabel}.xlsx`
      XLSX.writeFile(workbook, fileName)
      toast.success(`Exported ${fileName}`)
    } catch (error) {
      toast.error('Failed to export Excel file')
      console.error(error)
    }
  }

  return (
    <PageShell
      eyebrow="Work ledger"
      title="Timesheets"
      description="Generate daily, weekly, or monthly attendance and activity summaries. Weekly reports include all seven calendar days and identify week offs."
      icon={TimerReset}
      actions={
        <>
          <ThemedSelect
            value={reportingPeriod}
            onChange={setPeriod}
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
            className="dashboard-control min-w-[112px] px-3 py-2 text-[13px]"
          />
          <ThemedDatePicker
            value={selectorValue}
            onChange={setSelectorValue}
            selectionMode={reportingPeriod === 'daily' ? 'day' : reportingPeriod === 'weekly' ? 'week' : 'month'}
            className="min-w-[190px]"
          />
          <button onClick={loadTimesheetData} disabled={loading} className="btn-primary">
            {loading ? (
              <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-b-white" />Loading...</>
            ) : (
              <><FileSpreadsheet size={18} />Load Data</>
            )}
          </button>
          <button onClick={exportToExcel} disabled={!dataLoaded || timesheetData.length === 0} className="btn-secondary">
            <Download size={18} />Export
          </button>
        </>
      }
    >
      <MotionCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--signal)_16%,transparent)] text-[var(--signal)]">
            <Calendar size={18} />
          </span>
          <div>
            <p className="ms-eyebrow">{reportingPeriod} reporting period</p>
            <p className="font-display text-sm font-semibold text-[var(--foreground)]">{selectedRange.label}</p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Sundays are included and marked as week off.</p>
          </div>
        </div>
        {dataLoaded && (
          <span className="rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_80%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
            {timesheetData.length} employee{timesheetData.length !== 1 ? 's' : ''}
          </span>
        )}
      </MotionCard>

      {dataLoaded && timesheetData.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            label="Employees"
            numeric={timesheetData.length}
            icon={FileSpreadsheet}
            tone="primary"
            details={{
              eyebrow: `${reportingPeriod} workforce`,
              description: `Employees represented for ${selectedRange.label}.`,
              itemLabel: 'employees',
              items: timesheetData.map((entry) => ({ label: entry.employee_name, value: formatHours(entry.total_hours), numeric: entry.total_hours, secondary: `${entry.days_present} day${entry.days_present === 1 ? '' : 's'} present` })),
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
              description: `Productive hours by employee for ${selectedRange.label}.`,
              itemLabel: 'employees',
              items: [...timesheetData].sort((a, b) => b.productive_hours - a.productive_hours).map((entry) => ({ label: entry.employee_name, value: formatHours(entry.productive_hours), numeric: entry.productive_hours, secondary: `${formatHours(entry.total_hours)} total` })),
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
              description: `Total tracked hours by employee for ${selectedRange.label}.`,
              itemLabel: 'employees',
              items: [...timesheetData].sort((a, b) => b.total_hours - a.total_hours).map((entry) => ({ label: entry.employee_name, value: formatHours(entry.total_hours), numeric: entry.total_hours, secondary: `${formatHours(entry.idle_hours)} idle · ${formatHours(entry.offline_hours)} offline` })),
            }}
          />
        </div>
      )}

      {dataLoaded && (
        <MotionCard hover={false} className="overflow-hidden p-5">
          <SectionHeader eyebrow="Detailed ledger" title={periodTitle} icon={TimerReset} />
          <div className="pro-table-wrap">
            <div className="overflow-x-auto">
              {reportingPeriod === 'monthly' ? (
                <table className="pro-table">
                  <thead><tr><th>Sr no</th><th>Employee name</th><th>Attendance</th><th>First activity</th><th>Last activity</th><th>Productive hours</th><th>Idle hours</th><th>Offline hours</th><th>Total hours</th></tr></thead>
                  <tbody>
                    {timesheetData.length === 0 ? (
                      <tr><td colSpan={9} className="text-center text-[var(--muted-foreground)]">No timesheet data available for this period</td></tr>
                    ) : monthlyPagination.pageItems.map((entry, index) => (
                      <tr key={entry.employee_name}>
                        <td>{(monthlyPagination.page - 1) * monthlyPagination.pageSize + index + 1}</td>
                        <td className="whitespace-nowrap font-semibold">{entry.employee_name}</td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{entry.days_present} present · {entry.absent_days} absent · {entry.non_working_days} off</td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{formatDateTime(entry.first_activity)}</td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{formatDateTime(entry.last_activity)}</td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{formatHours(entry.productive_hours)}</td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{formatHours(entry.idle_hours)}</td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{formatHours(entry.offline_hours)}</td>
                        <td className="whitespace-nowrap font-semibold">{formatHours(entry.total_hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="pro-table">
                  <thead><tr><th>Sr no</th><th>Employee name</th><th>Date</th><th>Status</th><th>First activity</th><th>Last activity</th><th>Productive hours</th><th>Idle hours</th><th>Offline hours</th><th>Total hours</th></tr></thead>
                  <tbody>
                    {dailyRows.length === 0 ? (
                      <tr><td colSpan={10} className="text-center text-[var(--muted-foreground)]">No timesheet data available for this period</td></tr>
                    ) : dailyPagination.pageItems.map((entry, index) => (
                      <tr key={`${entry.employee_name}-${entry.date}`}>
                        <td>{(dailyPagination.page - 1) * dailyPagination.pageSize + index + 1}</td>
                        <td className="whitespace-nowrap font-semibold">{entry.employee_name}</td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{formatCalendarDate(entry.date)}</td>
                        <td><span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</span></td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{formatDateTime(entry.first_activity)}</td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{formatDateTime(entry.last_activity)}</td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{formatHours(entry.productive_hours)}</td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{formatHours(entry.idle_hours)}</td>
                        <td className="whitespace-nowrap text-[var(--muted-foreground)]">{formatHours(entry.offline_hours)}</td>
                        <td className="whitespace-nowrap font-semibold">{formatHours(entry.total_hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <Pagination
            page={reportingPeriod === 'monthly' ? monthlyPagination.page : dailyPagination.page}
            pageSize={reportingPeriod === 'monthly' ? monthlyPagination.pageSize : dailyPagination.pageSize}
            totalItems={reportingPeriod === 'monthly' ? timesheetData.length : dailyRows.length}
            onPageChange={reportingPeriod === 'monthly' ? monthlyPagination.setPage : dailyPagination.setPage}
            onPageSizeChange={reportingPeriod === 'monthly' ? monthlyPagination.setPageSize : dailyPagination.setPageSize}
            itemLabel={reportingPeriod === 'monthly' ? 'employees' : 'daily records'}
          />
        </MotionCard>
      )}

      {!dataLoaded && !loading && (
        <MotionCard hover={false} className="p-5">
          <div className="empty-state">
            <FileSpreadsheet className="mb-3" size={38} />
            <p className="mb-2">Select a daily, weekly, or monthly period and click “Load Data”.</p>
            <p className="text-sm">Weekly results include all seven dates, including the Sunday week off.</p>
          </div>
        </MotionCard>
      )}
    </PageShell>
  )
}
