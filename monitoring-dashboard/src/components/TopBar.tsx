import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Moon, Sun, LogOut, Search } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { LiveBadge } from './ui'

/**
 * Command bar across the top of the console: environment badge, live clock,
 * theme toggle, and profile/logout. Sticky and glassy so it stays present while
 * content scrolls beneath it.
 */
export default function TopBar() {
  const { theme, toggleTheme } = useTheme()
  const { logout } = useAuth()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  const date = now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
      className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--background)_82%,transparent)] px-4 backdrop-blur-xl sm:px-6"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() =>
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
          }
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition hover:border-[var(--ring)] hover:text-[var(--foreground)]"
          title="Search (Ctrl/⌘ K)"
        >
          <Search size={13} className="text-[var(--primary)]" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="hidden rounded border border-[var(--border)] px-1 text-[10px] font-semibold sm:inline">⌘K</kbd>
        </button>
        <LiveBadge label="All systems live" />
      </div>

      <div className="flex items-center gap-2.5">
        <div className="hidden text-right sm:block">
          <p className="ms-num text-sm font-semibold leading-none text-[var(--foreground)]">{time}</p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{date}</p>
        </div>
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] transition hover:border-[var(--ring)] hover:text-[var(--foreground)]"
          title={theme === 'light' ? 'Dark mode' : 'Light mode'}
        >
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <button
          onClick={logout}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-xs font-semibold text-[var(--danger)] transition hover:border-[color-mix(in_oklab,var(--danger)_40%,transparent)] hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]"
          title="Sign out"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </motion.header>
  )
}
