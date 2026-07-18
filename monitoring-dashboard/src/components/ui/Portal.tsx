import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders children into document.body via a portal.
 *
 * Needed because the page content is wrapped in an animated `motion.div` whose
 * transform creates a containing block — any `position: fixed` overlay rendered
 * inside it is positioned relative to that wrapper (offset by the sidebar and
 * top bar) instead of the viewport, which left a strip of the app uncovered at
 * the top. Portaling to <body> guarantees a true full-viewport overlay.
 */
export default function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])
  if (!mounted) return null
  return createPortal(children, document.body)
}
