import { useEffect, useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import toast from 'react-hot-toast'
import { Moon, Sun, Radar, ArrowRight, ShieldCheck, Activity, Eye, EyeOff, Clock3, MonitorUp, BarChart3 } from 'lucide-react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [featureIndex, setFeatureIndex] = useState(0)
  const { login } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(username, password)
      toast.success('Signed in')
      navigate('/dashboard')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const highlights = [
    { icon: Activity, label: 'Live productivity & attendance signals' },
    { icon: ShieldCheck, label: 'Genuine-activity anti-cheat detection' },
    { icon: Eye, label: 'Screenshot evidence & timesheets' },
    { icon: Clock3, label: 'Accurate work, idle & offline timelines' },
    { icon: MonitorUp, label: 'Application and browser activity insights' },
    { icon: BarChart3, label: 'Team analytics, alerts & wellbeing trends' },
  ]

  useEffect(() => {
    const timer = window.setInterval(
      () => setFeatureIndex((current) => (current + 1) % highlights.length),
      2800
    )
    return () => window.clearInterval(timer)
  }, [highlights.length])

  const visibleHighlights = Array.from(
    { length: 3 },
    (_, offset) => highlights[(featureIndex + offset) % highlights.length]
  )

  return (
    <div className="ms-aurora-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <button
        onClick={toggleTheme}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] transition hover:border-[var(--ring)]"
        title={theme === 'light' ? 'Dark mode' : 'Light mode'}
      >
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Brand / pitch side */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
          className="hidden flex-col justify-center lg:flex"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--signal)] text-white shadow-[0_16px_40px_-18px_var(--primary)]">
              <Radar size={26} strokeWidth={2.3} />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">ScreenTime</h1>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Operations Suite</p>
            </div>
          </div>
          <h2 className="font-display text-4xl font-bold leading-tight text-[var(--foreground)]">
            Your workforce,<br />in <span className="bg-gradient-to-r from-[var(--primary)] to-[var(--signal)] bg-clip-text text-transparent">full focus.</span>
          </h2>
          <p className="mt-4 max-w-md text-[var(--muted-foreground)]">
            A live operations console for monitoring productivity, attendance, and activity integrity across your entire client fleet.
          </p>
          <div className="mt-8 h-[136px] space-y-3 overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
            {visibleHighlights.map((h, i) => (
              <motion.div
                key={h.label}
                layout
                initial={{ opacity: 0, y: 24, filter: 'blur(5px)' }}
                animate={{ opacity: 1 - i * 0.12, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -24, filter: 'blur(5px)' }}
                transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
                className="flex items-center gap-3 text-sm text-[var(--foreground)]"
              >
                <motion.span
                  initial={{ rotate: -35, scale: 0.75 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] text-[var(--primary)]"
                >
                  <h.icon size={16} />
                </motion.span>
                {h.label}
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
          <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
            {highlights.map((highlight, index) => (
              <motion.span
                key={highlight.label}
                animate={{ width: index === featureIndex ? 18 : 5, opacity: index === featureIndex ? 1 : 0.34 }}
                className="h-1.5 rounded-full bg-[var(--primary)]"
              />
            ))}
          </div>
        </motion.div>

        {/* Form side */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
          className="flex items-center"
        >
          <div className="ms-card ms-card-accent w-full p-8">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--signal)] text-white">
                <Radar size={22} />
              </div>
              <h1 className="font-display text-xl font-bold text-[var(--foreground)]">ScreenTime</h1>
            </div>

            <h2 className="font-display text-2xl font-bold text-[var(--foreground)]">Sign in</h2>
            <p className="mb-6 mt-1 text-sm text-[var(--muted-foreground)]">Access the monitoring console</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--input)] bg-[color-mix(in_oklab,var(--card)_86%,transparent)] px-4 py-3 text-[var(--foreground)] outline-none transition focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_22%,transparent)]"
                  placeholder="admin"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Password
                </label>
                <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--input)] bg-[color-mix(in_oklab,var(--card)_86%,transparent)] px-4 py-3 pr-12 text-[var(--foreground)] outline-none transition focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_22%,transparent)]"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[var(--radius-sm)] text-[var(--muted-foreground)] outline-none transition hover:text-[var(--primary)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                </div>
              </div>
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="group flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-gradient-to-r from-[var(--primary)] to-[color-mix(in_oklab,var(--primary)_80%,var(--signal))] px-4 py-3 font-semibold text-white shadow-[0_16px_40px_-20px_var(--primary)] transition disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign in'}
                {!loading && <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />}
              </motion.button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
