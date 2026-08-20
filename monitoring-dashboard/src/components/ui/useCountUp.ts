import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number from 0 → target on mount (and whenever target changes),
 * respecting prefers-reduced-motion. Returns the current animated value.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target)
  const valueRef = useRef(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (reduce || !Number.isFinite(target)) {
      valueRef.current = target
      setValue(target)
      return
    }

    const start = performance.now()
    // Refreshes should animate from the value already on screen. Restarting at
    // zero made every background cache update look like a full-card flicker.
    const from = valueRef.current
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      const nextValue = from + (target - from) * eased
      valueRef.current = nextValue
      setValue(nextValue)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, durationMs])

  return value
}
