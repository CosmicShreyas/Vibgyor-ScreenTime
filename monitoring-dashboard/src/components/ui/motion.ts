import type { Variants, Transition } from 'framer-motion'

/**
 * Shared motion vocabulary for the mission-control UI.
 * A small, consistent set of easings and variants so every page animates the
 * same way — page-load stagger, card reveals, and route transitions.
 */

export const easeOut: Transition['ease'] = [0.2, 0.7, 0.2, 1]

/** Container that staggers its children in on mount. */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
}

/** A single item that rises + fades in. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: easeOut } },
}

/** Subtle scale-in for hero/focal elements. */
export const popItem: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
}

/** Route/page transition wrapper variants. */
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOut } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: easeOut } },
}
