'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bell, CheckCheck, GitPullRequest, AlertTriangle, Clock } from 'lucide-react'

interface MobileNotif {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  created_at: string
  analysis_id?: string
}

const TYPE_CFG: Record<string, { icon: React.ElementType; color: string; dot: string }> = {
  analysis_complete: { icon: CheckCheck,    color: 'text-emerald-400', dot: 'bg-emerald-400' },
  review_decision:   { icon: GitPullRequest, color: 'text-indigo-400',  dot: 'bg-indigo-400'  },
  return:            { icon: AlertTriangle,  color: 'text-amber-400',   dot: 'bg-amber-400'   },
  waiting_author:    { icon: Clock,          color: 'text-orange-400',  dot: 'bg-orange-400'  },
  info:              { icon: Bell,           color: 'text-blue-400',    dot: 'bg-blue-400'    },
}

function ago(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function NotificationsPage() {
  const [items, setItems]     = useState<MobileNotif[]>([])
  const [loading, setL]       = useState(true)
  const [unread, setUnread]   = useState(0)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard/notifications?limit=50')
      if (r.ok) {
        const d = await r.json()
        const list: MobileNotif[] = d.notifications || d.items || []
        setItems(list)
        setUnread(list.filter(n => !n.read).length)
      }
    } catch { /* silent */ } finally { setL(false) }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [load])

  const markAllRead = async () => {
    try {
      await fetch('/api/dashboard/notifications/mark-all-read', { method: 'POST' })
      setItems(prev => prev.map(n => ({ ...n, read: true })))
      setUnread(0)
    } catch { /* silent */ }
  }

  const markOne = async (id: string) => {
    try {
      await fetch(`/api/dashboard/notifications/${id}/read`, { method: 'PATCH' })
      setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnread(prev => Math.max(0, prev - 1))
    } catch { /* silent */ }
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div>
          <h1 className="text-lg font-bold text-white">Notifications</h1>
          {unread > 0 && <p className="text-xs text-gray-500 mt-0.5">{unread} unread</p>}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead}
            className="flex items-center gap-1.5 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-full">
            <CheckCheck size={12} /> Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2 px-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 px-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Bell size={28} className="text-gray-600" />
          </div>
          <p className="text-gray-500 text-sm text-center">No notifications yet</p>
          <p className="text-gray-600 text-xs text-center mt-1">
            You will be notified when analyses complete or reviews are updated
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-4 pb-4">
          {items.map(n => {
            const cfg  = TYPE_CFG[n.type] || TYPE_CFG.info
            const Icon = cfg.icon
            return (
              <button key={n.id} onClick={() => markOne(n.id)}
                className={`w-full text-left flex items-start gap-3 p-4 rounded-2xl border transition-all ${
                  n.read ? 'bg-white/[0.02] border-white/[0.05]' : 'bg-white/[0.06] border-white/[0.10]'
                }`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${n.read ? 'bg-white/[0.05]' : 'bg-white/[0.08]'}`}>
                  <Icon size={18} className={cfg.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium leading-snug truncate ${n.read ? 'text-gray-300' : 'text-white'}`}>
                      {n.title}
                    </p>
                    {!n.read && <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${cfg.dot}`} />}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                  <p className="text-[10px] text-gray-600 mt-1">{ago(n.created_at)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
