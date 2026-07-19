import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

interface ThemedDatePickerProps {
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  className?: string
}

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const weekdayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const viewportPadding = 12
const preferredPanelWidth = 286

const toDate = (value?: string) => {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

const toValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDisplayDate = (value: string) => {
  const date = toDate(value)
  if (!date) return 'Select date'
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`
}

const isSameDay = (first: Date | null, second: Date | null) => {
  if (!first || !second) return false
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate()
}

export default function ThemedDatePicker({ value, onChange, min, max, className = '' }: ThemedDatePickerProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const selectedDate = useMemo(() => toDate(value) ?? new Date(), [value])
  const minDate = useMemo(() => toDate(min), [min])
  const maxDate = useMemo(() => toDate(max), [max])
  const [isOpen, setIsOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  useEffect(() => {
    if (!isOpen) return
    setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [isOpen, selectedDate])

  useEffect(() => {
    if (!isOpen) return

    const updatePanelPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return

      const panelRect = panelRef.current?.getBoundingClientRect()
      const panelWidth = Math.min(Math.max(preferredPanelWidth, rect.width), window.innerWidth - viewportPadding * 2)
      const panelHeight = panelRect?.height ?? 356
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
      const spaceAbove = rect.top - viewportPadding
      const opensAbove = spaceBelow < panelHeight && spaceAbove > spaceBelow
      const desiredLeft = rect.right - panelWidth
      const left = Math.min(
        Math.max(viewportPadding, desiredLeft),
        window.innerWidth - panelWidth - viewportPadding
      )
      const desiredTop = opensAbove ? rect.top - panelHeight - 8 : rect.bottom + 8
      const top = Math.min(
        Math.max(viewportPadding, desiredTop),
        window.innerHeight - panelHeight - viewportPadding
      )

      setPanelStyle({
        left,
        top,
        width: panelWidth,
        maxHeight: window.innerHeight - viewportPadding * 2,
      })
    }

    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setIsOpen(false)
    }

    updatePanelPosition()
    document.addEventListener('mousedown', closeOnOutside)
    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)

    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [isOpen])

  const calendarDays = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
    const startDate = new Date(firstDay)
    startDate.setDate(firstDay.getDate() - firstDay.getDay())

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + index)
      return date
    })
  }, [visibleMonth])

  const isDateDisabled = (date: Date) => {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    if (minDate && dayStart < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()).getTime()) return true
    if (maxDate && dayStart > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate()).getTime()) return true
    return false
  }

  const selectDate = (date: Date) => {
    if (isDateDisabled(date)) return
    onChange(toValue(date))
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  const moveMonth = (amount: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1))
  }

  const selectToday = () => {
    const today = new Date()
    selectDate(today)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`dashboard-control flex min-h-[2.35rem] items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-semibold tabular-nums shadow-sm transition hover:border-[var(--ring)] ${className}`}
      >
        <span>{formatDisplayDate(value)}</span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[var(--primary)]">
          <CalendarDays className="h-4 w-4" />
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            style={panelStyle}
            className="fixed z-[9999] overflow-y-auto rounded-xl border border-[color-mix(in_oklab,var(--primary)_34%,var(--border))] bg-[color-mix(in_oklab,var(--card)_94%,var(--primary)_6%)] p-3 text-[13px] text-[var(--foreground)] shadow-[0_22px_70px_-32px_var(--primary)] backdrop-blur-xl"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-sm font-bold text-[var(--foreground)]">
                  {monthNames[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
                </p>
                <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">Select a date</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] hover:text-[var(--primary)]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] hover:text-[var(--primary)]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {weekdayNames.map((day) => (
                <div key={day} className="py-1 text-center text-[11px] font-bold text-[var(--muted-foreground)]">
                  {day}
                </div>
              ))}

              {calendarDays.map((date) => {
                const inCurrentMonth = date.getMonth() === visibleMonth.getMonth()
                const selected = isSameDay(date, toDate(value))
                const today = isSameDay(date, new Date())
                const disabled = isDateDisabled(date)

                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectDate(date)}
                    className={`flex h-8 items-center justify-center rounded-lg text-xs font-bold transition ${
                      selected
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_12px_28px_-18px_var(--primary)]'
                        : today
                        ? 'border border-[color-mix(in_oklab,var(--primary)_45%,transparent)] text-[var(--primary)]'
                        : inCurrentMonth
                        ? 'text-[var(--foreground)] hover:bg-[color-mix(in_oklab,var(--primary)_14%,transparent)]'
                        : 'text-[color-mix(in_oklab,var(--muted-foreground)_52%,transparent)] hover:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]'
                    } disabled:cursor-not-allowed disabled:opacity-30`}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={selectToday}
                disabled={isDateDisabled(new Date())}
                className="rounded-lg bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] px-3 py-1.5 text-xs font-bold text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Today
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
