import { useState, useEffect } from 'react'
import { employeeService, EmployeeSummary, screenshotService, Screenshot } from '../services/api'
import { formatDateTime, formatClock, formatRelativeTime } from '../utils/time'
import toast from 'react-hot-toast'
import { Archive, Calendar, Download, GalleryHorizontalEnd, ImageOff, Maximize2, X } from 'lucide-react'
import { motion } from 'framer-motion'
import ThemedSelect from '../components/ThemedSelect'
import DateRangeFilter from '../components/DateRangeFilter'
import { PageShell, MotionCard, SectionHeader, Skeleton, Portal } from '../components/ui'
import { staggerContainer, popItem } from '../components/ui/motion'
import Pagination, { usePagination } from '../components/Pagination'

interface EmployeeScreenshotSummary {
  employeeName: string
  latestScreenshot: Screenshot
  totalCount: number
}

export default function ScreenshotsPage() {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all')
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isCreatingBackup, setIsCreatingBackup] = useState(false)

  // Date range state - default to past 10 days
  const [endDate, setEndDate] = useState<string>(() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })
  const [startDate, setStartDate] = useState<string>(() => {
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
    return `${tenDaysAgo.getFullYear()}-${String(tenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(tenDaysAgo.getDate()).padStart(2, '0')}`
  })

  // Employee screenshot summaries
  const [employeeSummaries, setEmployeeSummaries] = useState<EmployeeScreenshotSummary[]>([])
  const summaryPagination = usePagination(employeeSummaries, 12)
  const screenshotPagination = usePagination(screenshots, 12)

  useEffect(() => {
    loadEmployees()
  }, [])

  useEffect(() => {
    loadScreenshots()
    summaryPagination.setPage(1)
    screenshotPagination.setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee, startDate, endDate])

  const loadEmployees = async () => {
    try {
      const data = await employeeService.getAll()
      setEmployees(data)
    } catch (error) {
      toast.error('Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  const loadScreenshots = async () => {
    try {
      setLoading(true)
      const employeeName = selectedEmployee === 'all' ? undefined : selectedEmployee

      // Fetch screenshots with filters
      const data = await screenshotService.getScreenshotsWithFilters(
        startDate,
        endDate,
        employeeName
      )

      setScreenshots(data)

      // Calculate employee summaries (latest screenshot + count per employee)
      if (selectedEmployee === 'all') {
        const summariesMap = new Map<string, EmployeeScreenshotSummary>()

        data.forEach(screenshot => {
          const empName = screenshot.employee_name
          if (!empName) return

          if (!summariesMap.has(empName)) {
            summariesMap.set(empName, {
              employeeName: empName,
              latestScreenshot: screenshot,
              totalCount: 1
            })
          } else {
            const summary = summariesMap.get(empName)!
            summary.totalCount++
            // Update if this screenshot is more recent
            if (new Date(screenshot.captured_at) > new Date(summary.latestScreenshot.captured_at)) {
              summary.latestScreenshot = screenshot
            }
          }
        })

        setEmployeeSummaries(Array.from(summariesMap.values()))
      }

    } catch (error) {
      toast.error('Failed to load screenshots')
    } finally {
      setLoading(false)
    }
  }

  const handleEmployeeCardClick = (employeeName: string) => {
    setSelectedEmployee(employeeName)
  }

  const handleCreateBackup = async () => {
    try {
      setIsCreatingBackup(true)
      toast.loading('Creating backup archive...', { id: 'backup' })

      const response = await fetch('/api/screenshot-archive/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          employeeName: selectedEmployee === 'all' ? undefined : selectedEmployee,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create backup')
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch ? filenameMatch[1] : 'screenshots_backup.zip'

      // Download the file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success('Backup created successfully!', { id: 'backup' })
    } catch (error) {
      console.error('Failed to create backup:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create backup', { id: 'backup' })
    } finally {
      setIsCreatingBackup(false)
    }
  }

  if (loading && employees.length === 0) {
    return (
      <PageShell
        eyebrow="Screen capture audit"
        title="Evidence Vault"
        description="Review captured screens by employee and date range, then package verified records for offline retention."
        icon={GalleryHorizontalEnd}
      >
        <MotionCard className="p-4">
          <Skeleton className="h-4 w-40" />
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </MotionCard>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <MotionCard key={i} className="overflow-hidden p-0">
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="p-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-2 h-3 w-16" />
              </div>
            </MotionCard>
          ))}
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      eyebrow="Screen capture audit"
      title="Evidence Vault"
      description="Review captured screens by employee and date range, then package verified records for offline retention."
      icon={GalleryHorizontalEnd}
      actions={
        <button
          onClick={handleCreateBackup}
          disabled={isCreatingBackup || screenshots.length === 0}
          className="btn-success"
        >
          <Archive size={18} />
          {isCreatingBackup ? 'Creating Backup...' : 'Create Backup'}
        </button>
      }
    >
      {/* Filters Section */}
      <MotionCard accent className="p-5">
        <SectionHeader eyebrow="Scope" title="Capture Filters" icon={Calendar} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          {/* Employee Filter */}
          <div>
            <label className="ms-eyebrow mb-1.5 block">Employee</label>
            <ThemedSelect
              value={selectedEmployee}
              onChange={setSelectedEmployee}
              className="dashboard-control w-full px-3 py-2 text-[13px]"
              options={[
                { value: 'all', label: 'All Employees' },
                ...employees.map((emp) => ({ value: emp.name, label: emp.name })),
              ]}
            />
          </div>

          {/* Date range */}
          <div>
            <label className="ms-eyebrow mb-1.5 block">Date range</label>
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onChange={(s, e) => {
                setStartDate(s)
                setEndDate(e)
              }}
            />
          </div>
        </div>
      </MotionCard>

      {/* Employee Cards - Show when "All Employees" is selected */}
      {selectedEmployee === 'all' && employeeSummaries.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_38%,transparent)]">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {summaryPagination.pageItems.map((summary) => (
            <motion.div
              key={summary.employeeName}
              variants={popItem}
              whileHover={{ y: -4 }}
              onClick={() => handleEmployeeCardClick(summary.employeeName)}
              className="ms-card ms-card-hover group cursor-pointer overflow-hidden p-0"
            >
              {/* Screenshot Thumbnail */}
              <div className="relative aspect-video overflow-hidden bg-[var(--muted)]">
                <img
                  src={screenshotService.getScreenshotUrl(summary.latestScreenshot.id)}
                  alt={`${summary.employeeName} screenshot`}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
                {/* Expand affordance */}
                <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100">
                  <Maximize2 size={14} />
                </div>
                {/* Capture time overlay */}
                <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  {formatClock(summary.latestScreenshot.captured_at)}
                </div>
              </div>

              {/* Employee Info */}
              <div className="p-3">
                <div className="mb-2 flex items-center gap-3">
                  <div className="avatar h-8 w-8">
                    <span className="text-sm">
                      {summary.employeeName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {summary.employeeName}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatRelativeTime(summary.latestScreenshot.captured_at)}
                    </p>
                  </div>
                </div>

                {/* Screenshot count badge */}
                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Total Screenshots
                  </span>
                  <span className="ms-num rounded-lg bg-[color-mix(in_oklab,var(--primary)_13%,transparent)] px-2 py-1 text-xs font-bold text-[var(--primary)]">
                    {summary.totalCount}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
        <Pagination
          page={summaryPagination.page}
          pageSize={summaryPagination.pageSize}
          totalItems={employeeSummaries.length}
          onPageChange={summaryPagination.setPage}
          onPageSizeChange={summaryPagination.setPageSize}
          itemLabel="employees"
        />
        </div>
      ) : selectedEmployee !== 'all' ? (
        /* Screenshots Grid for Selected Employee */
        <MotionCard className="p-5">
          <SectionHeader
            eyebrow="Gallery"
            title={selectedEmployee}
            icon={GalleryHorizontalEnd}
            action={
              <span className="ms-num rounded-lg bg-[color-mix(in_oklab,var(--primary)_13%,transparent)] px-2.5 py-1 text-xs font-bold text-[var(--primary)]">
                {screenshots.length} captures
              </span>
            }
          />
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="aspect-video w-full rounded-[var(--radius-sm)]" />
                  <Skeleton className="mt-2 h-4 w-24" />
                  <Skeleton className="mt-1.5 h-3 w-32" />
                </div>
              ))}
            </div>
          ) : screenshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center text-[var(--muted-foreground)]">
              <ImageOff size={40} className="opacity-50" />
              <p className="mt-3">No screenshots available for the selected filters</p>
            </div>
          ) : (
            <>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {screenshotPagination.pageItems.map((screenshot) => (
                <motion.div
                  key={screenshot.id}
                  variants={popItem}
                  whileHover={{ y: -4 }}
                  className="group cursor-pointer"
                  onClick={() => setSelectedImage(screenshotService.getScreenshotUrl(screenshot.id))}
                >
                  <div className="relative aspect-video overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--muted)] shadow-sm transition-shadow duration-300 group-hover:shadow-lg group-hover:ring-1 group-hover:ring-[var(--primary)]">
                    <img
                      src={screenshotService.getScreenshotUrl(screenshot.id)}
                      alt="Screenshot"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    {/* Bottom gradient + timestamp overlay */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
                    <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      {formatClock(screenshot.captured_at)}
                    </div>
                    {/* Expand affordance */}
                    <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100">
                      <Maximize2 size={14} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {screenshot.employee_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatDateTime(screenshot.captured_at)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
            <Pagination
              page={screenshotPagination.page}
              pageSize={screenshotPagination.pageSize}
              totalItems={screenshots.length}
              onPageChange={screenshotPagination.setPage}
              onPageSizeChange={screenshotPagination.setPageSize}
              itemLabel="screenshots"
            />
            </>
          )}
        </MotionCard>
      ) : (
        <MotionCard className="flex flex-col items-center justify-center p-14 text-center text-[var(--muted-foreground)]">
          <Download size={42} className="opacity-50" />
          <p className="mt-3">No screenshots available for the selected date range</p>
        </MotionCard>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <Portal>
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_oklab,var(--background)_55%,transparent)] p-4 backdrop-blur-2xl"
          onClick={() => setSelectedImage(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
            className="relative max-h-full max-w-7xl"
          >
            {/* Top Bar with Time and Close */}
            <div className="absolute -top-14 left-0 right-0 flex items-center justify-between text-white">
              {/* Time Display */}
              <div className="rounded-lg border border-white/10 bg-black/50 px-4 py-2 text-sm font-medium backdrop-blur-sm">
                {(() => {
                  const currentIndex = screenshots.findIndex(
                    s => screenshotService.getScreenshotUrl(s.id) === selectedImage
                  )
                  if (currentIndex !== -1) {
                    return formatDateTime(screenshots[currentIndex].captured_at)
                  }
                  return ''
                })()}
              </div>

              {/* Close Button */}
              <button
                onClick={() => setSelectedImage(null)}
                aria-label="Close preview"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-[var(--danger)]"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Navigation Arrows */}
            {screenshots.length > 1 && (
              <>
                {/* Left Arrow */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const currentIndex = screenshots.findIndex(
                      s => screenshotService.getScreenshotUrl(s.id) === selectedImage
                    )
                    if (currentIndex > 0) {
                      setSelectedImage(screenshotService.getScreenshotUrl(screenshots[currentIndex - 1].id))
                    }
                  }}
                  disabled={screenshots.findIndex(s => screenshotService.getScreenshotUrl(s.id) === selectedImage) === 0}
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-4 text-white backdrop-blur-sm transition-all hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                {/* Right Arrow */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const currentIndex = screenshots.findIndex(
                      s => screenshotService.getScreenshotUrl(s.id) === selectedImage
                    )
                    if (currentIndex < screenshots.length - 1) {
                      setSelectedImage(screenshotService.getScreenshotUrl(screenshots[currentIndex + 1].id))
                    }
                  }}
                  disabled={screenshots.findIndex(s => screenshotService.getScreenshotUrl(s.id) === selectedImage) === screenshots.length - 1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-4 text-white backdrop-blur-sm transition-all hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            {/* Image Counter */}
            {screenshots.length > 1 && (
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 rounded-lg border border-white/10 bg-black/50 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                {screenshots.findIndex(s => screenshotService.getScreenshotUrl(s.id) === selectedImage) + 1} / {screenshots.length}
              </div>
            )}

            <img
              src={selectedImage}
              alt="Screenshot"
              className="max-h-[90vh] max-w-full rounded-[var(--radius)] object-contain shadow-2xl ring-1 ring-white/10"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        </div>
        </Portal>
      )}
    </PageShell>
  )
}
