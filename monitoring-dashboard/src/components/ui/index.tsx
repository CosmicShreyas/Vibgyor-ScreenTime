import { ReactNode, useState } from 'react'
import { motion, type MotionProps } from 'framer-motion'
import { ChevronRight, LucideIcon } from 'lucide-react'
import { staggerContainer, riseItem, popItem } from './motion'
import { useCountUp } from './useCountUp'
import StatInsightModal, { type StatInsightDetails } from '../StatInsightModal'

export { default as Portal } from './Portal'

/* -------------------------------------------------------------------------- */
/* Card — the glass surface used everywhere                                    */
/* -------------------------------------------------------------------------- */
export function Card({
  children,
  className = '',
  hover = false,
  accent = false,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
  accent?: boolean
}) {
  return (
    <div
      className={`ms-card ${hover ? 'ms-card-hover' : ''} ${accent ? 'ms-card-accent' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/** Motion-enabled card that reveals as a stagger child. */
export function MotionCard({
  children,
  className = '',
  hover = true,
  accent = false,
  whileHover,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
  accent?: boolean
  /** Optional framer-motion hover animation (e.g. { y: -3 }). */
  whileHover?: MotionProps['whileHover']
}) {
  return (
    <motion.div
      variants={riseItem}
      whileHover={whileHover}
      className={`ms-card ${hover ? 'ms-card-hover' : ''} ${accent ? 'ms-card-accent' : ''} ${className}`}
    >
      {children}
    </motion.div>
  )
}

/** Wrap a group of MotionCards to get staggered entrance. */
export function Stagger({
  children,
  className = '',
  animateOnMount = true,
}: {
  children: ReactNode
  className?: string
  animateOnMount?: boolean
}) {
  return (
    <motion.div variants={staggerContainer} initial={animateOnMount ? 'hidden' : false} animate="show" className={className}>
      {children}
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */
/* SectionHeader — consistent eyebrow + title + optional icon/action          */
/* -------------------------------------------------------------------------- */
export function SectionHeader({
  eyebrow,
  title,
  icon: Icon,
  action,
  className = '',
}: {
  eyebrow?: string
  title: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`mb-4 flex items-start justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] text-[var(--primary)]">
            <Icon size={18} strokeWidth={2.2} />
          </span>
        )}
        <div>
          {eyebrow && <p className="ms-eyebrow">{eyebrow}</p>}
          <h2 className="font-display text-lg font-semibold text-[var(--foreground)]">{title}</h2>
        </div>
      </div>
      {action}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* LiveBadge — pulsing live indicator                                          */
/* -------------------------------------------------------------------------- */
export function LiveBadge({ label = 'Live', tone = 'success' }: { label?: string; tone?: 'success' | 'signal' }) {
  const color = tone === 'signal' ? 'var(--signal)' : 'var(--success)'
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_80%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted-foreground)]">
      <span className="ms-live-dot" style={{ background: color }} />
      {label}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Skeleton — shimmer placeholders                                             */
/* -------------------------------------------------------------------------- */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`ms-skeleton ${className}`} />
}

export function SkeletonCard() {
  return (
    <Card className="p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
      <Skeleton className="mt-4 h-2 w-full" />
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* StatTile — animated KPI with count-up                                       */
/* -------------------------------------------------------------------------- */
export function StatTile({
  label,
  value,
  numeric,
  suffix = '',
  icon: Icon,
  tone = 'primary',
  hint,
  onClick,
  details,
}: {
  label: string
  /** Display string when the value isn't a plain number (e.g. "2h 14m"). */
  value?: string
  /** Provide a number to get the count-up animation. */
  numeric?: number
  suffix?: string
  icon?: LucideIcon
  tone?: 'primary' | 'signal' | 'success' | 'warning' | 'danger'
  hint?: string
  onClick?: () => void
  details?: StatInsightDetails
}) {
  const [showDetails, setShowDetails] = useState(false)
  const toneColor =
    tone === 'signal' ? 'var(--signal)'
    : tone === 'success' ? 'var(--success)'
    : tone === 'warning' ? 'var(--warning)'
    : tone === 'danger' ? 'var(--danger)'
    : 'var(--primary)'

  const animated = useCountUp(numeric ?? 0)
  const display = numeric !== undefined ? `${Math.round(animated)}${suffix}` : value ?? ''

  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="ms-eyebrow truncate">{label}</p>
          <p className="ms-num mt-2 text-3xl font-bold text-[var(--foreground)]">{display}</p>
          {hint && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p>}
        </div>
        {Icon && (
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
            style={{ background: `color-mix(in oklab, ${toneColor} 15%, transparent)`, color: toneColor }}
          >
            <Icon size={20} strokeWidth={2.2} />
          </span>
        )}
      </div>
      {onClick && (
        <span className="mt-4 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: toneColor }}>
          View details <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </>
  )

  const handleClick = onClick ?? (() => setShowDetails(true))

  return (
    <>
      <motion.button
        type="button"
        variants={riseItem}
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.99 }}
        onClick={handleClick}
        aria-label={`View details for ${label}`}
        className="ms-card ms-card-hover ms-card-accent group w-full overflow-hidden p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
      >
        {content}
      </motion.button>
      {!onClick && (
        <StatInsightModal
          open={showDetails}
          onClose={() => setShowDetails(false)}
          title={label}
          headline={numeric !== undefined ? `${numeric}${suffix}` : value ?? ''}
          hint={hint}
          tone={tone}
          details={details}
        />
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* PageShell — animated page hero + staggered content                          */
/* -------------------------------------------------------------------------- */
export function PageShell({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  children,
  animateOnMount = true,
}: {
  eyebrow?: string
  title: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
  animateOnMount?: boolean
}) {
  return (
    <div className="app-page">
      <motion.header
        variants={popItem}
        initial={animateOnMount ? 'hidden' : false}
        animate="show"
        className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-5 sm:p-6"
        style={{
          background:
            'radial-gradient(120% 140% at 0% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 55%), radial-gradient(120% 140% at 100% 0%, color-mix(in oklab, var(--signal) 12%, transparent), transparent 60%), color-mix(in oklab, var(--card) 52%, transparent)',
          backdropFilter: 'blur(8px) saturate(1.08)',
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            {Icon && (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] text-[var(--primary)] shadow-[0_10px_30px_-16px_var(--primary)]">
                <Icon size={22} strokeWidth={2.2} />
              </span>
            )}
            <div className="min-w-0">
              {eyebrow && <p className="ms-eyebrow">{eyebrow}</p>}
              <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                {title}
              </h1>
              {description && (
                <p className="mt-1.5 max-w-2xl text-sm text-[var(--muted-foreground)]">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
        </div>
      </motion.header>

      <Stagger className="space-y-5" animateOnMount={animateOnMount}>{children}</Stagger>
    </div>
  )
}
