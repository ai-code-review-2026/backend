'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, XCircle, Zap, Shield, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'

interface Summary {
  id: string
  status: string
  title?: string
  repo_name?: string
  project_name?: string
  risk_level?: string
  review_classification?: string
  merge_readiness?: boolean
  findings_count?: number
  findings_by_severity?: Record<string, number>
  pr_summary?: string
  change_type?: string
  test_suggestions?: string[]
  auto_fix_available?: boolean
}

const SEV_CFG: Record<string, { color: string; bg: string; emoji: string }> = {
  CRITICAL: { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',     emoji: '🔴' },
  HIGH:     { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', emoji: '🟠' },
  MEDIUM:   { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', emoji: '🟡' },
  LOW:      { color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',  emoji: '🟢' },
  INFO:     { color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',    emoji: 'ℹ️' },
}
const RISK_BG: Record<string, string> = {
  CRITICAL: 'bg-red-500/10 border border-red-500/20 text-red-400',
  HIGH:     'bg-orange-500/10 border border-orange-500/20 text-orange-400',
  MEDIUM:   'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400',
  LOW:      'bg-green-500/10 border border-green-500/20 text-green-400',
}

export default function AnalysisPage() {
  const { id }          = useParams<{ id: string }>()
  const router          = useRouter()
  const [s, setS]       = useState<Summary | null>(null)
  const [loading, setL] = useState(true)
  const [showTests, setT] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/dashboard/analyses/${id}/mobile-summary`)
      .then(r => r.ok ? r.json() : null)
      .then(setS)
      .catch(console.error)
      .finally(() => setL(false))
  }, [id])

  if (loading) return (
    <div className="flex flex-col gap-3 p-4">
      {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />)}
    </div>
  )

  if (!s) return (
    <div className="flex flex-col items-center py-20 px-4">
      <XCircle size={32} className="text-red-400 mb-3" />
      <p className="text-gray-400 text-sm">Analysis not found</p>
      <button onClick={() => router.back()} className="mt-4 text-indigo-400 text-sm">
        Go back
      </button>
    </div>
  )

  const sev  = s.findings_by_severity || {}
  const risk = s.risk_level || 'LOW'

  return (
    <div className="flex flex-col pb-6">
      {/* Back header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button onClick={() => router.back()}
          className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{s.title || `Analysis #${id.slice(0, 8)}`}</p>
          <p className="text-xs text-gray-500 truncate">{s.project_name || s.repo_name}</p>
        </div>
        <a href={`/dashboard/analyses/${id}`} target="_blank"
          className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center">
          <ExternalLink size={14} />
        </a>
      </div>

      <div className="flex flex-col gap-3 px-4">
        {/* Risk hero card */}
        <div className={`rounded-2xl p-4 border ${RISK_BG[risk] || RISK_BG.LOW}`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-medium opacity-70 uppercase tracking-wide">Risk Level</p>
              <p className="text-2xl font-bold mt-0.5">{risk}</p>
            </div>
            <span className="text-4xl">{SEV_CFG[risk]?.emoji || '🟢'}</span>
          </div>
          {s.review_classification && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10">
              Review {s.review_classification}
            </span>
          )}
        </div>

        {/* Findings breakdown */}
        <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4">
          <p className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wide">
            Findings ({s.findings_count ?? Object.values(sev).reduce((a, b) => a + b, 0)})
          </p>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(SEV_CFG).map(([k, c]) => {
              const n = sev[k] ?? 0
              return (
                <div key={k} className={`flex flex-col items-center rounded-xl p-2 border ${n > 0 ? c.bg : 'bg-white/[0.02] border-white/[0.04]'}`}>
                  <span className="text-base leading-none mb-1">{c.emoji}</span>
                  <span className={`text-lg font-bold leading-none ${n > 0 ? c.color : 'text-gray-600'}`}>{n}</span>
                  <span className={`text-[9px] font-medium mt-1 ${n > 0 ? c.color : 'text-gray-600'}`}>
                    {k.charAt(0) + k.slice(1).toLowerCase()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Merge readiness */}
        <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4 flex items-center gap-3">
          {s.merge_readiness
            ? <CheckCircle2 size={28} className="text-emerald-400 shrink-0" />
            : <XCircle size={28} className="text-red-400 shrink-0" />}
          <div>
            <p className="text-sm font-semibold">
              {s.merge_readiness ? 'Ready to merge' : 'Not ready to merge'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {s.merge_readiness ? 'All checks passed' : 'Resolve blockers before merging'}
            </p>
          </div>
        </div>

        {/* AI Summary */}
        {s.pr_summary && (
          <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">AI Summary</p>
            <p className="text-sm text-gray-300 leading-relaxed">{s.pr_summary}</p>
          </div>
        )}

        {/* Change type */}
        {s.change_type && (
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-2xl p-3">
            <span className="text-xs text-gray-400">Type de changement :</span>
            <span className="text-xs font-semibold text-indigo-300 capitalize">{s.change_type}</span>
          </div>
        )}

        {/* Auto-fix */}
        {s.auto_fix_available && (
          <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-3">
            <Zap size={16} className="text-indigo-400" />
            <span className="text-sm text-indigo-300">Auto-fix disponible</span>
            <a href={`/dashboard/analyses/${id}?tab=autofix`} target="_blank"
              className="ml-auto text-xs text-indigo-400 underline">Voir</a>
          </div>
        )}

        {/* Test suggestions */}
        {s.test_suggestions && s.test_suggestions.length > 0 && (
          <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl overflow-hidden">
            <button onClick={() => setT(v => !v)} className="w-full flex items-center gap-2 p-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex-1 text-left">
                Tests suggeres ({s.test_suggestions.length})
              </p>
              {showTests ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
            </button>
            {showTests && (
              <div className="px-4 pb-4 flex flex-col gap-2">
                {s.test_suggestions.map((t, i) => (
                  <div key={i} className="flex gap-2 text-sm text-gray-300">
                    <span className="text-emerald-400 shrink-0">{i + 1}.</span>
                    <span className="leading-relaxed">{t}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Full report */}
        <a href={`/dashboard/analyses/${id}`} target="_blank"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-all">
          <Shield size={16} /> Voir le rapport complet
        </a>
      </div>
    </div>
  )
}
