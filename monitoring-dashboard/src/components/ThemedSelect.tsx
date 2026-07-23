import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface ThemedSelectOption {
  value: string
  label: string
}

interface ThemedSelectProps {
  value: string
  options: ThemedSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  showIndicator?: boolean
}

export default function ThemedSelect({
  value,
  options,
  onChange,
  placeholder = 'Select',
  className = '',
  disabled = false,
  showIndicator = true,
}: ThemedSelectProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  )

  useEffect(() => {
    if (!isOpen) return

    const selectedIndex = options.findIndex((option) => option.value === value)
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0)

    const updateMenuPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return

      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const openAbove = spaceBelow < 190 && spaceAbove > spaceBelow
      const availableSpace = openAbove ? spaceAbove : spaceBelow
      const maxHeight = Math.min(280, Math.max(120, availableSpace - 16))

      setMenuStyle({
        left: rect.left,
        top: openAbove ? undefined : rect.bottom + 7,
        bottom: openAbove ? window.innerHeight - rect.top + 7 : undefined,
        width: rect.width,
        maxHeight,
        transformOrigin: openAbove ? 'bottom center' : 'top center',
      })
    }

    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return
      setIsOpen(false)
    }

    updateMenuPosition()
    document.addEventListener('mousedown', closeOnOutside)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, options, value])

  const selectOption = (nextValue: string) => {
    onChange(nextValue)
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return

    if (event.key === 'Escape') {
      setIsOpen(false)
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (options.length === 0) return
      if (!isOpen) {
        setIsOpen(true)
        return
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setHighlightedIndex((current) => {
        const start = current < 0 ? 0 : current
        return (start + direction + options.length) % options.length
      })
      return
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (options.length === 0) return
      setIsOpen(true)
      setHighlightedIndex(event.key === 'Home' ? 0 : options.length - 1)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (isOpen && highlightedIndex >= 0 && options[highlightedIndex]) {
        selectOption(options[highlightedIndex].value)
      } else {
        setIsOpen(true)
      }
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        data-open={isOpen || undefined}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleKeyDown}
        className={`dashboard-control themed-select-trigger group flex min-h-[2.45rem] w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {showIndicator && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)] shadow-[0_0_10px_var(--primary)]" />}
          <span className={`truncate ${selectedOption ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <span className="themed-select-chevron flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--primary)] transition-colors group-hover:bg-[color-mix(in_oklab,var(--primary)_18%,transparent)]">
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            style={menuStyle}
            className="themed-select-menu fixed z-[9999] overflow-hidden p-1.5 text-[13px] text-[var(--foreground)]"
          >
            <div className="custom-scrollbar max-h-[inherit] overflow-y-auto">
              {options.map((option, index) => {
                const selected = option.value === value
                const highlighted = index === highlightedIndex
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectOption(option.value)}
                    className={`themed-select-option flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left font-semibold transition ${
                      selected
                        ? 'is-selected text-[var(--primary-foreground)]'
                        : highlighted
                          ? 'bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] text-[var(--foreground)]'
                          : 'text-[var(--foreground)]'
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
