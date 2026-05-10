"use client"

import { useAuth } from "@clerk/nextjs"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Notification } from "@/components/ui/notification-popover"
import { getBackendWebSocketBaseUrl } from "@/lib/backend-url-client"

interface UseNotificationsOptions {
  userId?: string
  enableRealtime?: boolean
}

type BackendNotification = {
  id: string
  type: string
  title: string
  message: string
  data?: Record<string, unknown>
  read: boolean
  created_at: string
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { userId, enableRealtime = true } = options
  const { getToken } = useAuth()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/notifications?limit=100")
      if (!response.ok) {
        throw new Error(`Failed to fetch notifications: ${response.status}`)
      }

      const data = await response.json()
      const rows: BackendNotification[] = data.notifications || []
      const mapped = rows.map(mapBackendNotification)
      setNotifications(mapped)
      setError(null)
    } catch (err) {
      console.error("Failed to fetch notifications:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [userId])

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_ids: [notificationId] }),
      })
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, status: "read" } : n)),
      )
    } catch (err) {
      console.error("Failed to mark notification as read:", err)
    }
  }, [])

  const archiveNotification = useCallback(async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/archive`, {
        method: "PATCH",
      })
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, status: "archived" } : n)),
      )
    } catch (err) {
      console.error("Failed to archive notification:", err)
    }
  }, [])

  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}`, {
        method: "DELETE",
      })
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
    } catch (err) {
      console.error("Failed to delete notification:", err)
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" })
      setNotifications((prev) =>
        prev.map((n) => (n.status === "unread" ? { ...n, status: "read" } : n)),
      )
    } catch (err) {
      console.error("Failed to mark all as read:", err)
    }
  }, [])

  const clearAll = useCallback(async () => {
    try {
      await fetch("/api/notifications", { method: "DELETE" })
      setNotifications([])
    } catch (err) {
      console.error("Failed to clear all notifications:", err)
    }
  }, [])

  useEffect(() => {
    void fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    if (!enableRealtime || !userId) {
      return
    }

    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false
    let reconnectAttempts = 0
    const maxReconnectAttempts = 3
    const wsBase = getBackendWebSocketBaseUrl()

    const connect = async () => {
      try {
        const token = await getToken()
        if (closed) return

        const params = new URLSearchParams({ user_id: userId })
        if (token) {
          params.set("token", token)
        }
        socket = new WebSocket(`${wsBase}/ws/notifications?${params.toString()}`)
        socket.onopen = () => {
          reconnectAttempts = 0
        }
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data ?? "{}")
            if (payload?.type === "notification:new" && payload.notification) {
              const incoming = mapBackendNotification(payload.notification)
              setNotifications((prev) => {
                if (prev.some((n) => n.id === incoming.id)) return prev
                return [incoming, ...prev]
              })
            }
            if (payload?.type === "notification:read" && Array.isArray(payload.notification_ids)) {
              const readIds = new Set<string>(payload.notification_ids)
              setNotifications((prev) =>
                prev.map((n) => (readIds.has(n.id) ? { ...n, status: "read" } : n)),
              )
            }
          } catch (parseErr) {
            console.error("Invalid notification websocket payload:", parseErr)
          }
        }
        socket.onerror = () => {
          if (!closed) {
            socket?.close()
          }
        }
        socket.onclose = () => {
          if (closed) return
          if (reconnectAttempts >= maxReconnectAttempts) {
            console.warn("Notification websocket unavailable; realtime updates paused.")
            return
          }
          reconnectAttempts += 1
          reconnectTimer = setTimeout(() => {
            void connect()
          }, Math.min(5000, 1500 * reconnectAttempts))
        }
      } catch (connectErr) {
        console.warn("Notification websocket connection failed:", connectErr)
        if (reconnectAttempts >= maxReconnectAttempts) {
          return
        }
        reconnectAttempts += 1
        reconnectTimer = setTimeout(() => {
          if (!closed) void connect()
        }, Math.min(5000, 1500 * reconnectAttempts))
      }
    }

    void connect()

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (socket) socket.close()
    }
  }, [enableRealtime, getToken, userId])

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.status === "unread").length,
    [notifications],
  )

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch: fetchNotifications,
    markAsRead,
    archiveNotification,
    deleteNotification,
    markAllAsRead,
    clearAll,
  }
}

function mapBackendNotification(notification: BackendNotification): Notification {
  return {
    id: notification.id,
    type: mapNotificationType(notification.type),
    title: notification.title,
    message: notification.message,
    timestamp: notification.created_at,
    status: notification.read ? "read" : "unread",
    metadata: notification.data || {},
  }
}

function mapNotificationType(
  backendType: string,
): "info" | "success" | "warning" | "error" {
  const typeMap: Record<string, "info" | "success" | "warning" | "error"> = {
    "assignment.new": "info",
    "assignment.reassigned": "info",
    "review.completed": "success",
    "comment.added": "info",
    "comment.reply": "info",
    "comment.mention": "info",
    "change_request.created": "warning",
    "change_request.resolved": "success",
    "review.overdue_soon": "warning",
    "review.overdue": "error",
  }
  return typeMap[backendType] || "info"
}
