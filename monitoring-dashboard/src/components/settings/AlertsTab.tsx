import { useState, useEffect } from 'react'
import { Save, RefreshCw, BellRing } from 'lucide-react'
import { analyticsService, AlertsConfig } from '../../services/api'
import toast from 'react-hot-toast'

export default function AlertsTab() {
  const [config, setConfig] = useState<AlertsConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      setConfig(await analyticsService.getAlertsConfig())
    } catch {
      toast.error('Failed to load alert settings')
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    if (!config) return
    setSaving(true)
    try {
      const updated = await analyticsService.updateAlertsConfig(config)
      setConfig(updated)
      toast.success('Alert settings saved')
    } catch {
      toast.error('Failed to save alert settings')
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof AlertsConfig>(key: K, value: AlertsConfig[K]) =>
    setConfig((c) => (c ? { ...c, [key]: value } : c))

  if (loading || !config) {
    return <div className="p-6 text-center text-[var(--muted-foreground)]">Loading…</div>
  }

  const numberField = (
    label: string,
    key: keyof AlertsConfig,
    suffix: string,
    help: string
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={config[key] as number}
          onChange={(e) => set(key, Number(e.target.value) as any)}
          className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">{suffix}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{help}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <BellRing className="w-5 h-5 text-amber-500" /> Alert Thresholds
        </h3>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary" disabled={saving}>
            <RefreshCw size={16} /> Reload
          </button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm font-medium text-gray-900 dark:text-white">Enable alerts</span>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {numberField('High idle time', 'highIdleMinutes', 'minutes', 'Flag when idle time in a day exceeds this.')}
        {numberField('Low productivity', 'lowProductivityScore', '% score', 'Flag when the productivity score falls below this.')}
        {numberField('Offline during shift', 'offlineDuringShiftMinutes', 'minutes', 'Flag when a client is offline this long during shift hours.')}
        {numberField('Unproductive overuse', 'unproductiveSiteMinutes', 'minutes', 'Flag when time on unproductive apps/sites exceeds this.')}
        {numberField('Suspected fake activity', 'suspectedFakeMinutes', 'minutes', 'Flag when auto-clicker / jiggler / macro activity exceeds this in a day.')}
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config.emailAdminsOnAlert}
          onChange={(e) => set('emailAdminsOnAlert', e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm text-gray-900 dark:text-white">Email admins when alerts fire (uses admin emails from Dashboard settings)</span>
      </label>
    </div>
  )
}
