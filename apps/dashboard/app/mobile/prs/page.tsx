'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Clock, AlertTriangle, GitPullRequest } from 'lucide-react'

interface PR {
  id: string; title?: string; repo_name?: string; project_name?: string
  risk_level?: string; status: string; created_at: string; findings_count?: number
}

const TABS = [
  { key: 'new_attention',    label: 'New',      emoji: '🔴', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { key: 'return',           label: 'Return',   emoji: '↩️', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { key: 'approved',         label: 'Approved', emoji: '✅', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { key: 'waiting_reviewer', label: 'Waiting',  emoji: '⏳', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { key: 'drafts',           label: 'Drafts',   emoji: '📝', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { key: 'waiting_author',   label: 'Action',   emoji: '⚡', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
]

const RISK_COLORS: Record<string,string> = {
  CRITICAL:'bg-red-500/15 text-red-400', HIGH:'bg-orange-500/15 text-orange-400',
  MEDIUM:'bg-yellow-500/15 text-yellow-400', LOW:'bg-green-500/15 text-green-400',
}

function ago(d: string) {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
  return h < 1 ? `${Math.floor((Date.now()-new Date(d).getTime())/60000)}m ago` : h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`
}

export default function AllPRsPage() {
  const [tab, setTab]   = useState('new_attention')
  const [prs, setPrs]   = useState<PR[]>([])
  const [loading, setL] = useState(false)
  const router          = useRouter()

  const load = useCallback(async (t: string) => {
    setL(true)
    try {
      const r = await fetch(`/api/dashboard/analyses?status=${t}&limit=30`)
      if (r.ok) { const d = await r.json(); setPrs(d.items || d.analyses || []) }
    } catch { /* silent */ } finally { setL(false) }
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-lg font-bold">All PRs</h1>
        <p className="text-xs text-gray-500 mt-0.5">{prs.length} pull request{prs.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto" style={{scrollbarWidth:'none'}}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${tab === t.key ? t.color : 'bg-white/5 text-gray-400 border-white/10'}`}>
            <span>{t.emoji}</span><span>{t.label}</span>
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex flex-col gap-3 px-4">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      ) : prs.length === 0 ? (
        <div className="flex flex-col items-center py-16">
          <GitPullRequest size={32} className="text-gray-600 mb-3" />
          <p className="text-gray-500 text-sm">No PRs in this category</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-4 pb-4">
          {prs.map(pr => (
            <button key={pr.id} onClick={() => router.push(`/mobile/analysis/${pr.id}`)}
              className="w-full text-left bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded-2xl p-4 transition-all active:scale-[0.98]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{pr.title || `Analysis #${pr.id.slice(0,8)}`}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">{pr.project_name || pr.repo_name || 'Unknown'}</p>
                </div>
                {pr.risk_level && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${RISK_COLORS[pr.risk_level] || 'bg-gray-500/15 text-gray-400'}`}>
                    {pr.risk_level}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3">
                  {pr.findings_count !== undefined && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-500">
                      <AlertTriangle size={11} />{pr.findings_count} findings
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[11px] text-gray-500">
                    <Clock size={11} />{ago(pr.created_at)}
                  </span>
                </div>
                <ChevronRight size={14} className="text-gray-600" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
