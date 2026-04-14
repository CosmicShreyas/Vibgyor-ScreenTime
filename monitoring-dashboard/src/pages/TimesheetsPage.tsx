import { useState } from 'react'
import { employeeService } from '../services/api'
import toast from 'react-hot-toast'
import { Calendar, Download, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

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
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const formatHours = (hours: number): string => {
    const h = Math.floor(hours)
    const m = Math.floor((hours - h) * 60)
    const s = Math.floor(((hours - h) * 60 - m) * 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const [year, month] = selectedMonth.split('-').map(Number)
  const monthName = getMonthName(month)

  return (
    <div className="p-8 bg-gray-50 dark:bg-slate-900 min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Employee's Timesheet</h1>
      </div>

      {/* Controls Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg mb-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          {/* Left side - Month selector and Load button */}
          <div className="flex-1">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Export Monthly Report</p>
            <div className="flex items-center gap-4">
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value)
                  setDataLoaded(false)
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                {Array.from({ length: 12 }, (_, i) => {
                  const date = new Date()
                  date.setMonth(date.getMonth() - i)
                  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                  const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                })}
              </select>
              
              <button
                onClick={loadTimesheetData}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Loading...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet size={18} />
                    Load Data
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right side - Export Button */}
          <div>
            <button
              onClick={exportToExcel}
              disabled={!dataLoaded || timesheetData.length === 0}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download size={18} />
              Export
            </button>
          </div>
        </div>

        {/* Month display */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="text-gray-500 dark:text-gray-400" size={18} />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Viewing: <span className="font-medium text-gray-900 dark:text-white">{monthName} {year}</span>
            </span>
          </div>
          {dataLoaded && (
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {timesheetData.length} employee{timesheetData.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Table Section */}
      {dataLoaded && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 card-shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Sr no
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Employee name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    First activity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Last activity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Productive hours
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Idle hours
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Offline hours
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total hours
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {timesheetData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      No timesheet data available for this month
                    </td>
                  </tr>
                ) : (
                  timesheetData.map((entry, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {entry.employee_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {formatDateTime(entry.first_activity)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {formatDateTime(entry.last_activity)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {formatHours(entry.productive_hours)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {formatHours(entry.idle_hours)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {formatHours(entry.offline_hours)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {formatHours(entry.total_hours)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!dataLoaded && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-12 border border-gray-200 dark:border-gray-700 card-shadow-lg text-center">
          <FileSpreadsheet className="mx-auto mb-4 text-gray-400 dark:text-gray-600" size={48} />
          <p className="text-gray-500 dark:text-gray-400 mb-2">
            Select a month and click "Load Data" to view timesheet
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            You can export the data to Excel format after loading
          </p>
        </div>
      )}
    </div>
  )
}
