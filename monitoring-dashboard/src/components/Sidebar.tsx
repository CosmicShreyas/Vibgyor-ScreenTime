import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BarChart3,
  Briefcase,
  BellRing,
  ChevronLeft,
  ChevronRight,
  GalleryHorizontalEnd,
  HeartPulse,
  KeyRound,
  PanelsTopLeft,
  Radar,
  Settings2,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useRestrictedMode } from '../contexts/RestrictedModeContext'
import { useEffect, useState } from 'react'
import OTPModal from './OTPModal'

const NAV = [
  { to: '/dashboard', icon: PanelsTopLeft, label: 'Command Center', group: 'Monitor' },
  { to: '/employees', icon: UsersRound, label: 'Workforce', group: 'Monitor' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics', group: 'Insight' },
  { to: '/wellbeing', icon: HeartPulse, label: 'Wellbeing', group: 'Insight' },
  { to: '/alerts', icon: BellRing, label: 'Alerts Center', group: 'Insight' },
  { to: '/screenshots', icon: GalleryHorizontalEnd, label: 'Evidence Vault', group: 'Insight' },
  { to: '/timesheets', icon: Briefcase, label: 'Timesheets', group: 'Insight' },
]

export default function Sidebar() {
  const { logout: _logout } = useAuth()
  const { isRestricted, refreshRestrictedMode } = useRestrictedMode()
  const location = useLocation()
  const [showOTPModal, setShowOTPModal] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(
    () => window.innerWidth < 768 || localStorage.getItem('sidebar_collapsed') === 'true'
  )

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', isCollapsed ? '4.75rem' : '16rem')
    localStorage.setItem('sidebar_collapsed', String(isCollapsed))
  }, [isCollapsed])

  const handleSettingsClick = (e: React.MouseEvent) => {
    if (isRestricted) {
      e.preventDefault()
      setShowOTPModal(true)
    }
  }

  const groups = Array.from(new Set(NAV.map((n) => n.group)))

  return (
    <motion.aside
      initial={{ x: -24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
      className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--sidebar-border)] bg-[color-mix(in_oklab,var(--sidebar)_92%,transparent)] backdrop-blur-xl transition-[width] duration-300 ${
        isCollapsed ? 'w-[4.75rem]' : 'w-[16rem]'
      }`}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-[var(--sidebar-border)] px-4">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--signal)] text-white shadow-[0_10px_28px_-12px_var(--primary)]">
          <Radar size={19} strokeWidth={2.3} />
        </div>
        <div className={`min-w-0 ${isCollapsed ? 'hidden' : 'block'}`}>
          <h1 className="font-display text-[15px] font-bold leading-tight text-[var(--sidebar-foreground)]">ScreenTime</h1>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Operations Suite</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed((v) => !v)}
          className="ml-auto hidden h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] transition hover:border-[var(--ring)] hover:text-[var(--foreground)] md:flex"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        {groups.map((group) => (
          <div key={group} className="mb-4">
            {!isCollapsed && (
              <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                {group}
              </p>
            )}
            <div className="space-y-1">
              {NAV.filter((n) => n.group === group).map((item) => {
                const active = location.pathname === item.to
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors duration-200 ${
                      active
                        ? 'text-[var(--primary-foreground)]'
                        : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]'
                    } ${isCollapsed ? 'justify-center' : ''}`}
                    title={item.label}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[color-mix(in_oklab,var(--primary)_78%,var(--signal))] shadow-[0_12px_30px_-16px_var(--primary)]"
                      />
                    )}
                    <item.icon size={18} strokeWidth={2.15} className="relative z-10" />
                    {!isCollapsed && <span className="relative z-10 truncate">{item.label}</span>}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}

        {/* Control panel entry (settings) */}
        <div className="mb-1">
          {!isCollapsed && (
            <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              System
            </p>
          )}
          {isRestricted ? (
            <button
              onClick={handleSettingsClick}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] ${isCollapsed ? 'justify-center' : ''}`}
              title="Settings locked"
            >
              <KeyRound size={18} className="text-[var(--danger)]" />
              {!isCollapsed && <span className="truncate">Control Panel</span>}
            </button>
          ) : (
            <NavLink
              to="/settings"
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors duration-200 ${
                location.pathname === '/settings'
                  ? 'text-[var(--primary-foreground)]'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title="Control Panel"
            >
              {location.pathname === '/settings' && (
                <motion.span
                  layoutId="nav-active"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[color-mix(in_oklab,var(--primary)_78%,var(--signal))]"
                />
              )}
              <Settings2 size={18} strokeWidth={2.15} className="relative z-10" />
              {!isCollapsed && <span className="relative z-10 truncate">Control Panel</span>}
            </NavLink>
          )}
        </div>
      </nav>

      {/* Footer status */}
      {!isCollapsed && (
        <div className="border-t border-[var(--sidebar-border)] p-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5">
            <span className="ms-live-dot" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--foreground)]">Client fleet online</p>
              <p className="text-[10px] text-[var(--muted-foreground)]">Realtime stream active</p>
            </div>
          </div>
        </div>
      )}

      <OTPModal isOpen={showOTPModal} onClose={() => setShowOTPModal(false)} onSuccess={refreshRestrictedMode} />
    </motion.aside>
  )
}
