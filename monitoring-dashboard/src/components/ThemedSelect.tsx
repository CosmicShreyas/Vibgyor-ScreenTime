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
}

export default function ThemedSelect({
  value,
  options,
  onChange,
  placeholder = 'Select',
  className = '',
  disabled = false,
}: ThemedSelectProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  )

  useEffect(() => {
    if (!isOpen) return

    const updateMenuPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return

      const spaceBelow = window.innerHeight - rect.bottom
      const maxHeight = Math.min(260, Math.max(160, spaceBelow - 16))

      setMenuStyle({
        left: rect.left,
        top: rect.bottom + 6,
        width: rect.width,
        maxHeight,
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
  }, [isOpen])

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

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setIsOpen((open) => !open)
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
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleKeyDown}
        className={`dashboard-control flex min-h-[2.35rem] w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] font-semibold shadow-sm transition hover:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span className={`truncate ${selectedOption ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[var(--primary)]">
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            style={menuStyle}
            className="fixed z-[9999] overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--primary)_34%,var(--border))] bg-[color-mix(in_oklab,var(--card)_94%,var(--primary)_6%)] p-1.5 text-[13px] text-[var(--foreground)] shadow-[0_22px_70px_-32px_var(--primary)] backdrop-blur-xl"
          >
            <div className="custom-scrollbar max-h-[inherit] overflow-y-auto">
              {options.map((option) => {
                const selected = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectOption(option.value)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left font-semibold transition ${
                      selected
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'text-[var(--foreground)] hover:bg-[color-mix(in_oklab,var(--primary)_16%,transparent)]'
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
