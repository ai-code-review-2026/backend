'use client'

import { useEffect, useState } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { GitPullRequest, CheckCircle2, AlertTriangle, Clock, LogOut } from 'lucide-react'

interface Stats {
  total_analyses: number
  completed_analyses: number
  pending_analyses: number
  findings_this_week: number
  approved_prs: number
  return_prs: number
}

function Card({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number
  color: 'indigo' | 'emerald' | 'yellow' | 'orange'
}) {
  const MAP = {
    indigo:  'text-indigo-400 bg-indigo-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
    yellow:  'text-yellow-400 bg-yellow-500/10',
    orange:  'text-orange-400 bg-orange-500/10',
  }
  const cls = MAP[color]
  return (
    <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4 flex flex-col gap-2">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${cls}`}>
        <Icon size={16} className={cls.split(' ')[0]} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
    </div>
  )
}

export default function MobileDashboardPage() {
  const { user }     = useUser()
  const { signOut }  = useClerk()
  const router       = useRouter()
  const [stats, setS] = useState<Stats | null>(null)
  const [loading, setL] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/statistics/mobile')
      .then(r => r.json()).then(setS).catch(console.error).finally(() => setL(false))
  }, [])

  const role = (user?.publicMetadata?.role as string) || 'developer'
  const name = user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'User'

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Bonjour</p>
          <p className="text-lg font-bold text-white truncate">{name}</p>
          <p className="text-xs text-indigo-400 mt-0.5 capitalize">{role}</p>
        </div>
        <button onClick={async () => { await signOut(); router.push('/sign-in') }}
          className="flex items-center gap-1.5 text-xs text-gray-500 bg-white/5 border border-white/[0.07] px-3 py-2 rounded-xl">
          <LogOut size={12} /> Sign out
        </button>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3">
          <Card icon={GitPullRequest} label="Total analyses"    value={stats.total_analyses}      color="indigo"  />
          <Card icon={CheckCircle2}   label="PRs approuvées"    value={stats.approved_prs}         color="emerald" />
          <Card icon={AlertTriangle}  label="Findings / semaine" value={stats.findings_this_week}  color="yellow"  />
          <Card icon={Clock}          label="PRs a corriger"    value={stats.return_prs}           color="orange"  />
        </div>
      ) : null}

      {/* Quick actions */}
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">Actions rapides</p>
        <div className="flex flex-col gap-2">
          <button onClick={() => router.push('/mobile/prs')}
            className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4 active:scale-[0.98] transition-all">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={16} className="text-red-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Nouvelles analyses</p>
              <p className="text-xs text-gray-500">PRs en attente de revue</p>
            </div>
          </button>

          <button onClick={() => router.push('/mobile/notifications')}
            className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4 active:scale-[0.98] transition-all">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <GitPullRequest size={16} className="text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">PRs renvoyees</p>
              <p className="text-xs text-gray-500">Corrections requises</p>
            </div>
          </button>

          <a href="/dashboard" target="_blank"
            className="flex items-center gap-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 active:scale-[0.98] transition-all">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <CheckCircle2 size={16} className="text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-indigo-300">Ouvrir le dashboard complet</p>
              <p className="text-xs text-indigo-400/60">Web app avec toutes les fonctionnalites</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}
