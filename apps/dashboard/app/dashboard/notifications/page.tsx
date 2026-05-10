"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Archive,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode2,
  Filter,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react"

import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider"

type NotificationStatus = "unread" | "read" | "archived"

type DashboardNotification = {
  id: string
  type: string
  title: string
  message: string
  data: Record<string, unknown>
  status: NotificationStatus
  created_at: string
  read_at: string | null
}

type FilterKey = "all" | "unread" | "read" | "archived"

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "unread", label: "Non lues" },
  { key: "read", label: "Lues" },
  { key: "archived", label: "Archivees" },
]

const ORANGE = "#E8713A"

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function normalizeNotification(input: Record<string, unknown>): DashboardNotification {
  const read = Boolean(input.read)
  const data = typeof input.data === "object" && input.data !== null
    ? input.data as Record<string, unknown>
    : {}

  return {
    id: readString(input.id) ?? crypto.randomUUID(),
    type: readString(input.type) ?? "info",
    title: readString(input.title) ?? "Notification",
    message: readString(input.message) ?? readString(input.body) ?? "",
    data,
    status: read ? "read" : "unread",
    created_at: readString(input.created_at) ?? new Date().toISOString(),
    read_at: readString(input.read_at),
  }
}

function getNotificationLink(notification: DashboardNotification): string | null {
  const analysisId = readString(notification.data.analysis_id)
  const sessionId = readString(notification.data.session_id)

  if (notification.type === "live_session.invite") {
    return sessionId ? `/dashboard/review-session/${sessionId}` : null
  }

  if (
    notification.type.startsWith("assignment.") ||
    notification.type.startsWith("review.") ||
    notification.type.startsWith("comment.") ||
    notification.type.startsWith("change_request.")
  ) {
    return analysisId ? `/dashboard/diff/${analysisId}` : null
  }

  return analysisId ? `/dashboard/diff/${analysisId}` : null
}

function getNotificationVisual(type: string): {
  icon: LucideIcon
  label: string
  accent: string
  bg: string
  border: string
} {
  if (type.includes("overdue") || type.includes("change_request")) {
    return {
      icon: ShieldAlert,
      label: "Attention",
      accent: "#f97316",
      bg: "rgba(249,115,22,0.10)",
      border: "rgba(249,115,22,0.24)",
    }
  }

  if (type.includes("completed") || type.includes("resolved")) {
    return {
      icon: CheckCircle2,
      label: "Terminee",
      accent: "#16a34a",
      bg: "rgba(22,163,74,0.10)",
      border: "rgba(22,163,74,0.24)",
    }
  }

  if (type.includes("comment") || type.includes("mention")) {
    return {
      icon: MessageSquare,
      label: "Discussion",
      accent: "#2563eb",
      bg: "rgba(37,99,235,0.10)",
      border: "rgba(37,99,235,0.22)",
    }
  }

  if (type.includes("assignment") || type.includes("review")) {
    return {
      icon: FileCode2,
      label: "Review",
      accent: ORANGE,
      bg: "rgba(232,113,58,0.11)",
      border: "rgba(232,113,58,0.26)",
    }
  }

  return {
    icon: Bell,
    label: "Systeme",
    accent: "#6366f1",
    bg: "rgba(99,102,241,0.10)",
    border: "rgba(99,102,241,0.22)",
  }
}

function relativeTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Date inconnue"

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return "A l'instant"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} j`
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

function fullDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Date inconnue"
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function DashboardNotificationsPage() {
  const router = useRouter()
  const currentUser = useDashboardUser()
  const [notifications, setNotifications] = useState<DashboardNotification[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/notifications?limit=100&unread_only=false", {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = await response.json()
      const rawItems = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.notifications)
        ? payload.notifications
        : Array.isArray(payload.items)
        ? payload.items
        : []

      const nextItems = rawItems
        .filter((item: unknown): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .map(normalizeNotification)

      setNotifications(nextItems)
      setSelectedId((current) => {
        if (current && nextItems.some((item) => item.id === current)) return current
        return nextItems[0]?.id ?? null
      })
      setError(null)
    } catch (err) {
      console.error("Failed to load notifications:", err)
      setError("Impossible de charger les notifications.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  const stats = useMemo(() => {
    const unread = notifications.filter((item) => item.status === "unread").length
    const archived = notifications.filter((item) => item.status === "archived").length
    const actionable = notifications.filter((item) => getNotificationLink(item)).length
    return {
      total: notifications.length,
      unread,
      archived,
      actionable,
    }
  }, [notifications])

  const filteredNotifications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return notifications.filter((item) => {
      if (activeFilter !== "all" && item.status !== activeFilter) return false
      if (!normalizedQuery) return true
      return (
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.message.toLowerCase().includes(normalizedQuery) ||
        item.type.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [activeFilter, notifications, query])

  const selectedNotification = useMemo(() => {
    return (
      notifications.find((item) => item.id === selectedId) ??
      filteredNotifications[0] ??
      notifications[0] ??
      null
    )
  }, [filteredNotifications, notifications, selectedId])

  const updateStatus = useCallback((id: string, status: NotificationStatus) => {
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)))
  }, [])

  const markAsRead = useCallback(async (id: string) => {
    updateStatus(id, "read")
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_ids: [id] }),
      })
    } catch (err) {
      console.error("Failed to mark notification as read:", err)
    }
  }, [updateStatus])

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((item) => item.status === "unread" ? { ...item, status: "read" } : item))
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" })
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err)
    }
  }, [])

  const archiveNotification = useCallback(async (id: string) => {
    updateStatus(id, "archived")
    try {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/archive`, { method: "PATCH" })
    } catch (err) {
      console.error("Failed to archive notification:", err)
    }
  }, [updateStatus])

  const deleteNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id))
    setSelectedId((current) => (current === id ? null : current))
    try {
      await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" })
    } catch (err) {
      console.error("Failed to delete notification:", err)
    }
  }, [])

  const clearAll = useCallback(async () => {
    setNotifications([])
    setSelectedId(null)
    try {
      await fetch("/api/notifications", { method: "DELETE" })
    } catch (err) {
      console.error("Failed to clear notifications:", err)
    }
  }, [])

  const openNotification = useCallback((notification: DashboardNotification) => {
    if (notification.status === "unread") {
      void markAsRead(notification.id)
    }
    const link = getNotificationLink(notification)
    if (link) router.push(link)
  }, [markAsRead, router])

  return (
    <main className="grid-pattern min-h-full bg-page p-4 text-foreground sm:p-6">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
        <section className="overflow-hidden rounded-lg border border-graphite-card bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b border-graphite-card p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md" style={{ background: "rgba(232,113,58,0.12)", color: ORANGE }}>
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Centre de notifications
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                  Notifications
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Suivez les assignments, commentaires, demandes de changement et alertes de review.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadNotifications()}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-graphite-card bg-card-inner px-3 text-sm font-medium text-foreground transition-colors hover:bg-card-hover"
              >
                <RefreshCw className="h-4 w-4" />
                Actualiser
              </button>
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={stats.unread === 0}
                className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                style={{ borderColor: "rgba(22,163,74,0.28)", background: "rgba(22,163,74,0.10)", color: "#16a34a" }}
              >
                <CheckCheck className="h-4 w-4" />
                Marquer tout lu
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={notifications.length === 0}
                className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                style={{ borderColor: "rgba(239,68,68,0.22)", background: "rgba(239,68,68,0.08)", color: "#ef4444" }}
              >
                <Trash2 className="h-4 w-4" />
                Vider
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-graphite-card md:grid-cols-4">
            {[
              { label: "Total", value: stats.total, icon: Inbox, color: ORANGE },
              { label: "Non lues", value: stats.unread, icon: Bell, color: "#2563eb" },
              { label: "Actionnables", value: stats.actionable, icon: ExternalLink, color: "#16a34a" },
              { label: "Archivees", value: stats.archived, icon: Archive, color: "#64748b" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3 border-r border-graphite-card p-4 last:border-r-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-md" style={{ background: `${stat.color}18`, color: stat.color }}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xl font-semibold text-foreground">{stat.value}</div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid min-h-[620px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="flex flex-col overflow-hidden rounded-lg border border-graphite-card bg-card shadow-sm">
            <div className="border-b border-graphite-card p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher..."
                  className="h-10 w-full rounded-md border border-graphite-card bg-card-inner pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-orange-accent"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-card-hover hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="border-b border-graphite-card p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                Filtres
              </div>
              <div className="grid grid-cols-2 gap-2">
                {FILTERS.map((filter) => {
                  const active = activeFilter === filter.key
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setActiveFilter(filter.key)}
                      className="h-8 rounded-md border px-2 text-xs font-semibold transition-colors"
                      style={{
                        borderColor: active ? ORANGE : "var(--border-card)",
                        background: active ? "rgba(232,113,58,0.12)" : "var(--bg-card-inner)",
                        color: active ? ORANGE : "var(--text-muted)",
                      }}
                    >
                      {filter.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-2 p-3">
                  {[0, 1, 2, 3, 4].map((item) => (
                    <div key={item} className="h-20 animate-pulse rounded-md bg-card-inner" />
                  ))}
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-card-inner text-muted-foreground">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">Aucune notification</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ajustez les filtres ou revenez plus tard.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredNotifications.map((notification) => {
                    const visual = getNotificationVisual(notification.type)
                    const Icon = visual.icon
                    const selected = selectedNotification?.id === notification.id
                    const unread = notification.status === "unread"

                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => setSelectedId(notification.id)}
                        className="flex w-full gap-3 px-3 py-3 text-left transition-colors hover:bg-card-hover"
                        style={{
                          background: selected
                            ? "linear-gradient(90deg, rgba(232,113,58,0.13), transparent)"
                            : unread
                            ? "rgba(37,99,235,0.04)"
                            : "transparent",
                          borderLeft: selected ? `3px solid ${ORANGE}` : "3px solid transparent",
                        }}
                      >
                        <div
                          className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border"
                          style={{ background: visual.bg, borderColor: visual.border, color: visual.accent }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {notification.title}
                            </div>
                            {unread && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {notification.message || "Aucun detail disponible."}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {relativeTime(notification.created_at)}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </aside>

          <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-graphite-card bg-card shadow-sm">
            {error && (
              <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {error}
              </div>
            )}

            {!selectedNotification ? (
              <div className="flex min-h-[520px] flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-card-inner text-muted-foreground">
                  <Inbox className="h-7 w-7" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Selectionnez une notification</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Les details, actions rapides et metadata apparaitront ici.
                </p>
              </div>
            ) : (
              <NotificationDetails
                notification={selectedNotification}
                onRead={() => markAsRead(selectedNotification.id)}
                onArchive={() => archiveNotification(selectedNotification.id)}
                onDelete={() => deleteNotification(selectedNotification.id)}
                onOpen={() => openNotification(selectedNotification)}
              />
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-lg border border-graphite-card bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Settings2 className="h-4 w-4" style={{ color: ORANGE }} />
                <h2 className="text-sm font-semibold text-foreground">Preferences rapides</h2>
              </div>
              <div className="space-y-3">
                {[
                  { label: "Notifications desktop", value: "Actif" },
                  { label: "Sons", value: "Desactive" },
                  { label: "Apercu du message", value: "Actif" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-md border border-graphite-card bg-card-inner px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                    <span className="text-xs font-semibold text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-graphite-card bg-card p-4 shadow-sm">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Session
              </div>
              <div className="rounded-md border border-graphite-card bg-card-inner p-3">
                <div className="text-sm font-semibold text-foreground">{currentUser.name ?? "Utilisateur"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{currentUser.role}</div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-md border border-graphite-card bg-card-inner p-3">
                  <div className="text-lg font-semibold text-foreground">{stats.unread}</div>
                  <div className="text-[11px] text-muted-foreground">A traiter</div>
                </div>
                <div className="rounded-md border border-graphite-card bg-card-inner p-3">
                  <div className="text-lg font-semibold text-foreground">{stats.actionable}</div>
                  <div className="text-[11px] text-muted-foreground">Liens</div>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

function NotificationDetails({
  notification,
  onRead,
  onArchive,
  onDelete,
  onOpen,
}: {
  notification: DashboardNotification
  onRead: () => void
  onArchive: () => void
  onDelete: () => void
  onOpen: () => void
}) {
  const visual = getNotificationVisual(notification.type)
  const Icon = visual.icon
  const actionUrl = getNotificationLink(notification)
  const metadataEntries = Object.entries(notification.data).filter(([, value]) => value != null)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-graphite-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-4">
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border"
              style={{ background: visual.bg, borderColor: visual.border, color: visual.accent }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded px-2 py-1 text-[11px] font-semibold"
                  style={{ background: visual.bg, color: visual.accent, border: `1px solid ${visual.border}` }}
                >
                  {visual.label}
                </span>
                <span className="text-xs text-muted-foreground">{fullDate(notification.created_at)}</span>
                {notification.status === "unread" && (
                  <span className="rounded bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-500">
                    Non lue
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                {notification.title}
              </h2>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {notification.status === "unread" && (
              <button
                type="button"
                onClick={onRead}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-graphite-card bg-card-inner px-3 text-sm font-semibold text-foreground hover:bg-card-hover"
              >
                <Check className="h-4 w-4" />
                Lu
              </button>
            )}
            <button
              type="button"
              onClick={onArchive}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-graphite-card bg-card-inner px-3 text-sm font-semibold text-foreground hover:bg-card-hover"
            >
              <Archive className="h-4 w-4" />
              Archiver
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold"
              style={{ borderColor: "rgba(239,68,68,0.24)", background: "rgba(239,68,68,0.08)", color: "#ef4444" }}
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="rounded-lg border border-graphite-card bg-card-inner p-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Message
          </div>
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
            {notification.message || "Aucun detail disponible."}
          </p>
        </div>

        {actionUrl && (
          <button
            type="button"
            onClick={onOpen}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white"
            style={{ background: ORANGE }}
          >
            Ouvrir la review
            <ExternalLink className="h-4 w-4" />
          </button>
        )}

        <div className="mt-6">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Metadata
          </div>
          {metadataEntries.length === 0 ? (
            <div className="rounded-lg border border-graphite-card bg-card-inner p-4 text-sm text-muted-foreground">
              Aucune metadata attachee a cette notification.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {metadataEntries.map(([key, value]) => (
                <div key={key} className="rounded-md border border-graphite-card bg-card-inner p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{key}</div>
                  <div className="mt-1 break-words text-sm font-medium text-foreground">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
