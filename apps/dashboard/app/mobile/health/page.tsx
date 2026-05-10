'use client'

import { useEffect, useState, useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import { Activity, Server, Database, Cpu, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'

interface Health {
  status: string
  queue_depth: number
  failure_rate: number
  active_workers: number
  analyses_last_hour: number
  avg_analysis_duration_s: number
  neo4j_connected: boolean
  redis_connected: boolean
  celery_workers_online: number
  pending_analyses: number
  running_analyses: number
}

const STATUS = {
  healthy:  { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2, label: 'Healthy'  },
  degraded: { color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20',   icon: AlertTriangle, label: 'Degraded' },
  down:     { color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',          icon: XCircle,      label: 'Down'     },
}

function Metric({ label, value, sub, ok, icon: Icon }: {
  label: string; value: string | number; sub?: string; ok?: boolean; icon: React.ElementType
}) {
  return (
    <div className={`bg-white/[0.04] border rounded-2xl p-4 flex flex-col gap-2 ${
      ok === false ? 'border-red-500/20 bg-red-500/5' : ok === true ? 'border-emerald-500/20' : 'border-white/[0.07]'
    }`}>
      <div className="flex items-center gap-2">
        <Icon size={14} className={ok === false ? 'text-red-400' : 'text-gray-400'} />
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold leading-none ${ok === false ? 'text-red-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

export default function HealthPage() {
  const { user }          = useUser()
  const [h, setH]         = useState<Health | null>(null)
  const [loading, setL]   = useState(true)
  const [updated, setUpd] = useState<Date | null>(null)

  const isTL = (user?.publicMetadata?.role as string) === 'reviewer'

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard/health/mobile')
      if (r.ok) { setH(await r.json()); setUpd(new Date()) }
    } catch { /* silent */ } finally { setL(false) }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [load])

  if (!isTL) return (
    <div className="flex flex-col items-center py-20 px-4">
      <Server size={32} className="text-gray-600 mb-4" />
      <p className="text-gray-400 text-sm text-center">Platform health is only available for Tech Leads</p>
    </div>
  )

  if (loading) return (
    <div className="flex flex-col gap-3 p-4">
      <div className="h-24 rounded-2xl bg-white/5 animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}
      </div>
    </div>
  )

  if (!h) return (
    <div className="flex flex-col items-center py-20 px-4">
      <XCircle size={32} className="text-red-400 mb-3" />
      <p className="text-gray-400 text-sm">Unable to reach platform</p>
      <button onClick={load} className="mt-4 flex items-center gap-2 text-indigo-400 text-sm">
        <RefreshCw size={14} /> Retry
      </button>
    </div>
  )

  const key = (h.status as keyof typeof STATUS) in STATUS ? h.status as keyof typeof STATUS : 'down'
  const cfg = STATUS[key]
  const Icon = cfg.icon

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Platform Health</h1>
        <button onClick={load}
          className="flex items-center gap-1.5 text-xs text-gray-400 bg-white/5 border border-white/[0.07] px-3 py-1.5 rounded-full">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {/* Global status */}
      <div className={`border rounded-2xl p-4 flex items-center gap-4 ${cfg.bg}`}>
        <Icon size={36} className={cfg.color} />
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Statut global</p>
          <p className={`text-2xl font-bold ${cfg.color}`}>{cfg.label}</p>
          {updated && <p className="text-[10px] text-gray-600 mt-0.5">Updated {updated.toLocaleTimeString()}</p>}
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        <Metric icon={Activity} label="Queue depth"     value={h.queue_depth}  sub={`${h.pending_analyses} pending`}  ok={h.queue_depth < 20} />
        <Metric icon={Activity} label="Failure rate"    value={`${h.failure_rate.toFixed(1)}%`} sub="Last hour" ok={h.failure_rate < 5} />
        <Metric icon={Cpu}      label="Workers online"  value={h.celery_workers_online} sub={`${h.running_analyses} running`} ok={h.celery_workers_online > 0} />
        <Metric icon={Activity} label="Analyses / h"    value={h.analyses_last_hour}    sub={`avg ${h.avg_analysis_duration_s.toFixed(0)}s`} />
      </div>

      {/* Services */}
      <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">Services</p>
        <div className="flex flex-col gap-3">
          {[
            { label: 'Neo4j Graph DB', ok: h.neo4j_connected,          icon: Database },
            { label: 'Redis / Queue',  ok: h.redis_connected,           icon: Server   },
            { label: 'Celery Workers', ok: h.celery_workers_online > 0, icon: Cpu      },
          ].map(({ label, ok, icon: SIcon }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SIcon size={14} className="text-gray-500" />
                <span className="text-sm text-gray-300">{label}</span>
              </div>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {ok ? 'Online' : 'Offline'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alert banner */}
      {key !== 'healthy' && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-yellow-400">Platform issue detected</p>
            <p className="text-xs text-yellow-400/70 mt-0.5">
              {h.failure_rate > 20 ? `High failure rate: ${h.failure_rate.toFixed(1)}%`
               : h.queue_depth > 50 ? `Queue congestion: ${h.queue_depth} waiting`
               : 'Check Grafana dashboards for details'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
