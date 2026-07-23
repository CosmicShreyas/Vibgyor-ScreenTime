import { useEffect, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'

/**
 * Resolves the design-system chart tokens (--chart-1..6, grid, axis) to concrete
 * color strings so Recharts can consume them, and re-resolves whenever the theme
 * changes. This is the single source of truth for every graph's colors.
 */
export interface ChartTheme {
  /** Ordered categorical palette for series. */
  palette: string[]
  grid: string
  axis: string
  /** Named roles for common series so meaning stays consistent across pages. */
  work: string
  idle: string
  offline: string
  productive: string
  neutral: string
  unproductive: string
  /** Props to spread onto the Recharts Tooltip for a themed container. */
  tooltip: {
    contentStyle: React.CSSProperties
    labelStyle: React.CSSProperties
    itemStyle: React.CSSProperties
    cursor: { fill: string }
  }
}

function readVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = styles.getPropertyValue(name).trim()
  return v || fallback
}

function resolve(): ChartTheme {
  const s = getComputedStyle(document.documentElement)
  const palette = [
    readVar(s, '--chart-1', '#3b66f5'),
    readVar(s, '--chart-2', '#22b8a6'),
    readVar(s, '--chart-3', '#8b5cf6'),
    readVar(s, '--chart-4', '#f5a524'),
    readVar(s, '--chart-5', '#ef4761'),
    readVar(s, '--chart-6', '#64748b'),
  ]
  const grid = readVar(s, '--chart-grid', 'rgba(148,163,184,0.25)')
  const axis = readVar(s, '--chart-axis', '#64748b')
  const card = readVar(s, '--card', '#ffffff')
  const foreground = readVar(s, '--foreground', '#0f172a')
  const border = readVar(s, '--border', 'rgba(148,163,184,0.35)')
  const muted = readVar(s, '--muted-foreground', '#64748b')

  return {
    palette,
    grid,
    axis,
    work: palette[0],
    idle: `color-mix(in oklab, ${palette[0]} 42%, transparent)`,
    offline: palette[5],
    productive: readVar(s, '--success', '#16a34a'),
    neutral: palette[1],
    unproductive: readVar(s, '--danger', '#ef4761'),
    tooltip: {
      contentStyle: {
        background: card,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow-md)',
        color: foreground,
        fontSize: 12,
        padding: '8px 12px',
      },
      labelStyle: { color: muted, fontWeight: 600, marginBottom: 4 },
      itemStyle: { color: foreground },
      cursor: { fill: 'color-mix(in oklab, var(--accent) 45%, transparent)' },
    },
  }
}

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme()
  const [ct, setCt] = useState<ChartTheme>(() =>
    typeof window !== 'undefined' ? resolve() : ({} as ChartTheme)
  )

  useEffect(() => {
    // Re-resolve on the next frame so the .dark class swap has applied.
    const id = requestAnimationFrame(() => setCt(resolve()))
    return () => cancelAnimationFrame(id)
  }, [theme])

  return ct
}

/** Shared axis props for a clean, quiet look. */
export function axisProps(ct: ChartTheme) {
  return {
    stroke: ct.axis,
    tick: { fill: ct.axis, fontSize: 12 },
    tickLine: false,
    axisLine: { stroke: ct.grid },
  }
}
