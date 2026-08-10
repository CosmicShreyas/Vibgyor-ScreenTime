import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search,
  PanelsTopLeft,
  UsersRound,
  BarChart3,
  BellRing,
  HeartPulse,
  GalleryHorizontalEnd,
  Briefcase,
  Settings2,
  User,
  CornerDownLeft,
} from 'lucide-react'
import { employeeService, EmployeeSummary } from '../services/api'

interface Item {
  id: string
  label: string
  sublabel?: string
  icon: typeof Search
  action: () => void
  group: string
}

/**
 * ⌘K / Ctrl+K command palette: fuzzy-search employees and jump to any page.
 * Mounted once in the app shell; opens globally.
 */
export default function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [employees, setEmployees] = useState<EmployeeSummary[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Global hotkey.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Load employees lazily the first time the palette opens.
  useEffect(() => {
    if (open && employees.length === 0) {
      employeeService.getAll().then(setEmployees).catch(() => {})
    }
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pages: Item[] = useMemo(
    () => [
      { id: 'p-dashboard', label: 'Command Center', icon: PanelsTopLeft, group: 'Pages', action: () => navigate('/dashboard') },
      { id: 'p-employees', label: 'Workforce', icon: UsersRound, group: 'Pages', action: () => navigate('/employees') },
      { id: 'p-analytics', label: 'Analytics', icon: BarChart3, group: 'Pages', action: () => navigate('/analytics') },
      { id: 'p-wellbeing', label: 'Wellbeing & Focus', icon: HeartPulse, group: 'Pages', action: () => navigate('/wellbeing') },
      { id: 'p-alerts', label: 'Alerts Center', icon: BellRing, group: 'Pages', action: () => navigate('/alerts') },
      { id: 'p-screenshots', label: 'Evidence Vault', icon: GalleryHorizontalEnd, group: 'Pages', action: () => navigate('/screenshots') },
      { id: 'p-timesheets', label: 'Timesheets', icon: Briefcase, group: 'Pages', action: () => navigate('/timesheets') },
      { id: 'p-settings', label: 'Control Panel', icon: Settings2, group: 'Pages', action: () => navigate('/settings') },
    ],
    [navigate]
  )

  const employeeItems: Item[] = useMemo(
    () =>
      employees.map((e) => ({
        id: `e-${e.name}`,
        label: e.name,
        sublabel: e.status,
        icon: User,
        group: 'Employees',
        action: () => navigate(`/employees/${encodeURIComponent(e.name)}`),
      })),
    [employees, navigate]
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = [...pages, ...employeeItems]
    if (!q) return all
    return all.filter((i) => i.label.toLowerCase().includes(q) || i.sublabel?.toLowerCase().includes(q))
  }, [query, pages, employeeItems])

  useEffect(() => {
    if (active >= results.length) setActive(0)
  }, [results, active])

  const run = (item: Item) => {
    item.action()
    setOpen(false)
  }

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      run(results[active])
    }
  }

  // Group results for display, preserving order.
  const groups = useMemo(() => {
    const map = new Map<string, Item[]>()
    results.forEach((r) => {
      const arr = map.get(r.group) || []
      arr.push(r)
      map.set(r.group, arr)
    })
    return Array.from(map.entries())
  }, [results])

  let runningIndex = -1

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center bg-[color-mix(in_oklab,var(--background)_55%,transparent)] px-4 pt-[12vh] backdrop-blur-2xl"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
            className="ms-card w-full max-w-xl overflow-hidden p-0 shadow-[var(--shadow-lg)]"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onListKey}
          >
            <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
              <Search size={18} className="text-[var(--muted-foreground)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employees or jump to a page…"
                className="w-full bg-transparent py-4 text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
              />
              <kbd className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted-foreground)]">ESC</kbd>
            </div>

            <div className="max-h-[54vh] overflow-y-auto custom-scrollbar p-2">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-[var(--muted-foreground)]">No matches for “{query}”.</p>
              ) : (
                groups.map(([group, items]) => (
                  <div key={group} className="mb-2">
                    <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                      {group}
                    </p>
                    {items.map((item) => {
                      runningIndex++
                      const idx = runningIndex
                      const isActive = idx === active
                      return (
                        <button
                          key={item.id}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => run(item)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                            isActive
                              ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                              : 'text-[var(--foreground)] hover:bg-[var(--accent)]'
                          }`}
                        >
                          <item.icon size={16} className={isActive ? '' : 'text-[var(--muted-foreground)]'} />
                          <span className="flex-1 truncate font-medium">{item.label}</span>
                          {item.sublabel && (
                            <span className={`text-xs capitalize ${isActive ? 'opacity-80' : 'text-[var(--muted-foreground)]'}`}>
                              {item.sublabel}
                            </span>
                          )}
                          {isActive && <CornerDownLeft size={14} className="opacity-70" />}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
