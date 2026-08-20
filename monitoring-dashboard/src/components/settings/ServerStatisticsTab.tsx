import { useEffect, useState } from 'react'
import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api from '../../services/api'
import { MotionCard, SectionHeader, StatTile } from '../ui'

type Sample = { timestamp: string; cpuPercent: number; memoryUsedBytes: number; memoryTotalBytes: number; diskUsedBytes: number; diskTotalBytes: number }
const pct = (used: number, total: number) => total > 0 ? (used / total) * 100 : 0
const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`

export default function ServerStatisticsTab() {
  const [history, setHistory] = useState<Sample[]>([])
  const [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    try { setHistory((await api.get('/server-statistics', { params: { hours: 24 } })).data.history ?? []) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load(); const id = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(id) }, [])
  const latest = history.length > 0 ? history[history.length - 1] : undefined
  const chart = history.map(item => ({ ...item, time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), memoryPercent: pct(item.memoryUsedBytes, item.memoryTotalBytes), diskPercent: pct(item.diskUsedBytes, item.diskTotalBytes) }))
  return <div className="space-y-5 p-6">
    <div className="flex items-start justify-between gap-4"><div><SectionHeader eyebrow="Infrastructure health" title="Server Statistics" icon={Activity} /><p className="mt-1 text-sm text-[var(--muted-foreground)]">CPU, memory, and disk are sampled once per minute. History is retained for seven days.</p></div><button onClick={() => void load()} disabled={loading} className="rounded-lg border border-[var(--border)] p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /></button></div>
    {!latest && !loading ? <MotionCard className="p-6 text-sm text-[var(--muted-foreground)]">No sample yet. The first one is collected shortly after the server starts.</MotionCard> : <>
      <div className="grid gap-4 md:grid-cols-3"><StatTile label="CPU usage" value={`${latest?.cpuPercent?.toFixed(1) ?? '—'}%`} icon={Cpu} tone="primary" hint="Current host usage" /><StatTile label="Memory usage" value={latest ? `${pct(latest.memoryUsedBytes, latest.memoryTotalBytes).toFixed(1)}%` : '—'} icon={MemoryStick} tone="signal" hint={latest ? `${gb(latest.memoryUsedBytes)} / ${gb(latest.memoryTotalBytes)}` : undefined} /><StatTile label="Disk usage" value={latest ? `${pct(latest.diskUsedBytes, latest.diskTotalBytes).toFixed(1)}%` : '—'} icon={HardDrive} tone="warning" hint={latest ? `${gb(latest.diskUsedBytes)} / ${gb(latest.diskTotalBytes)}` : undefined} /></div>
      <MotionCard className="p-5"><h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Last 24 hours</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="time" minTickGap={42} tick={{ fontSize: 11 }} /><YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} /><Area type="monotone" dataKey="cpuPercent" name="CPU" stroke="#3b82f6" fill="#3b82f633" /><Area type="monotone" dataKey="memoryPercent" name="Memory" stroke="#10b981" fill="#10b98122" /><Area type="monotone" dataKey="diskPercent" name="Disk" stroke="#f59e0b" fill="#f59e0b22" /></AreaChart></ResponsiveContainer></div></MotionCard>
    </>}
  </div>
}
