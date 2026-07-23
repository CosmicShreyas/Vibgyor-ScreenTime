export interface DashboardCacheEntry<T> {
  data: T
  updatedAt: number
}

export const DASHBOARD_PRESENCE_REFRESH_MS = 30_000
export const DASHBOARD_DATA_REFRESH_MS = 60_000
export const DASHBOARD_CACHE_MAX_AGE_MS = 5 * 60_000

const entries = new Map<string, DashboardCacheEntry<unknown>>()

export function readDashboardCache<T>(key: string): DashboardCacheEntry<T> | null {
  const entry = entries.get(key) as DashboardCacheEntry<T> | undefined
  if (!entry) return null

  if (Date.now() - entry.updatedAt > DASHBOARD_CACHE_MAX_AGE_MS) {
    entries.delete(key)
    return null
  }

  return entry
}

export function writeDashboardCache<T>(key: string, data: T): DashboardCacheEntry<T> {
  const entry = { data, updatedAt: Date.now() }
  entries.set(key, entry)
  return entry
}

