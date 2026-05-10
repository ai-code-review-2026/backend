"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bell,
  Check,
  CheckCheck,
  MessageSquare,
  AlertCircle,
  FileCode,
  Users,
  Clock,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider"
import type { Notification } from "@/lib/review-types"
import { cn } from "@/components/ui/utils"
import { formatCompactRelativeTime as formatRelativeTime } from "@/lib/domain/dates"
import { useAuth } from "@clerk/nextjs"
import { getBackendWebSocketBaseUrl } from "@/lib/backend-url-client"

function getNotificationIcon(type: string) {
  const iconMap: Record<string, React.ReactNode> = {
    "assignment.new": <FileCode className="h-4 w-4 text-blue-500" />,
    "assignment.reassigned": <Users className="h-4 w-4 text-purple-500" />,
    "review.completed": <Check className="h-4 w-4 text-green-500" />,
    "comment.added": <MessageSquare className="h-4 w-4 text-blue-500" />,
    "comment.reply": <MessageSquare className="h-4 w-4 text-green-500" />,
    "comment.mention": <MessageSquare className="h-4 w-4 text-orange-500" />,
    "comment.resolved": <Check className="h-4 w-4 text-green-500" />,
    "change_request.created": <AlertCircle className="h-4 w-4 text-orange-500" />,
    "change_request.resolved": <Check className="h-4 w-4 text-green-500" />,
    "review.overdue_soon": <Clock className="h-4 w-4 text-amber-500" />,
    "review.overdue": <Clock className="h-4 w-4 text-red-500" />,
    "live_session.invite": <Users className="h-4 w-4 text-purple-500" />,
    "metrics.weekly_summary": <FileCode className="h-4 w-4 text-blue-500" />,
  }
  return iconMap[type] || <Bell className="h-4 w-4 text-gray-500" />
}

function getNotificationLink(notification: Notification): string | null {
  const { type, data } = notification

  switch (type) {
    case "assignment.new":
    case "assignment.reassigned":
    case "review.completed":
      return data.analysis_id ? `/dashboard/diff/${data.analysis_id}` : null
    case "comment.added":
    case "comment.reply":
    case "comment.mention":
    case "comment.resolved":
      return data.analysis_id ? `/dashboard/diff/${data.analysis_id}` : null
    case "change_request.created":
    case "change_request.resolved":
      return data.analysis_id ? `/dashboard/diff/${data.analysis_id}` : null
    case "review.overdue_soon":
    case "review.overdue":
      return data.analysis_id ? `/dashboard/diff/${data.analysis_id}` : null
    case "live_session.invite":
      return data.session_id ? `/dashboard/review-session/${data.session_id}` : null
    default:
      return null
  }
}

export function NotificationBell() {
  const currentUser = useDashboardUser()
  const { getToken } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [desktopEnabled, setDesktopEnabled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [showPreview, setShowPreview] = useState(true)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/notifications?limit=20")
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications || data || [])
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/unread-count")
      if (response.ok) {
        const data = await response.json()
        setUnreadCount(data.count || 0)
      }
    } catch (error) {
      console.error("Failed to fetch unread count:", error)
    }
  }, [])

  const fetchNotificationBehavior = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/preferences")
      if (!response.ok) return
      const data = await response.json()
      const inApp = data?.inApp ?? {}
      if (typeof inApp.desktop === "boolean") setDesktopEnabled(inApp.desktop)
      if (typeof inApp.sound === "boolean") setSoundEnabled(inApp.sound)
      if (typeof inApp.show_preview === "boolean") setShowPreview(inApp.show_preview)
    } catch (error) {
      console.error("Failed to fetch notification behavior:", error)
    }
  }, [])

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) {
      return
    }

    try {
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime)
      gainNode.gain.setValueAtTime(0.03, audioContext.currentTime)
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.1)
    } catch (error) {
      console.error("Failed to play notification sound:", error)
    }
  }, [soundEnabled])

  const showDesktopNotification = useCallback(
    (incoming: Notification) => {
      if (!desktopEnabled || typeof window === "undefined") {
        return
      }
      if (!("Notification" in window) || Notification.permission !== "granted") {
        return
      }
      if (document.visibilityState === "visible") {
        return
      }

      const notificationTitle = incoming.title || "Devora"
      const notificationBody = showPreview ? incoming.message : "You have a new notification."
      new Notification(notificationTitle, {
        body: notificationBody,
        tag: incoming.id,
      })
    },
    [desktopEnabled, showPreview],
  )

  useEffect(() => {
    fetchUnreadCount()
    fetchNotifications()
    void fetchNotificationBehavior()
  }, [fetchUnreadCount, fetchNotifications, fetchNotificationBehavior])

  useEffect(() => {
    if (open) {
      fetchNotifications()
      void fetchNotificationBehavior()
    }
  }, [open, fetchNotificationBehavior, fetchNotifications])

  useEffect(() => {
    let socket: WebSocket | null = null
    let isClosed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    const maxReconnectAttempts = 3

    const wsBase = getBackendWebSocketBaseUrl()

    const connect = async () => {
      try {
        const token = await getToken()
        if (isClosed) return

        const params = new URLSearchParams({ user_id: currentUser.id })
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
              const incoming: Notification = payload.notification
              setNotifications((prev) => {
                const exists = prev.some((n) => n.id === incoming.id)
                if (exists) return prev
                return [incoming, ...prev].slice(0, 100)
              })
              if (!incoming.read) {
                setUnreadCount((prev) => prev + 1)
                showDesktopNotification(incoming)
                playNotificationSound()
              }
            } else if (payload?.type === "notification:read" && Array.isArray(payload.notification_ids)) {
              const readIds = new Set<string>(payload.notification_ids)
              setNotifications((prev) => prev.map((n) => (readIds.has(n.id) ? { ...n, read: true } : n)))
              setUnreadCount((prev) => Math.max(0, prev - readIds.size))
            }
          } catch (error) {
            console.error("Failed to parse notification websocket message:", error)
          }
        }
        socket.onerror = () => {
          if (!isClosed) {
            socket?.close()
          }
        }

        socket.onclose = () => {
          if (isClosed) return
          if (reconnectAttempts >= maxReconnectAttempts) {
            console.warn("Notification websocket unavailable; realtime updates paused.")
            return
          }
          reconnectAttempts += 1
          reconnectTimer = setTimeout(() => {
            void connect()
          }, Math.min(5000, 1500 * reconnectAttempts))
        }
      } catch (error) {
        console.warn("Failed to connect notification websocket:", error)
        if (reconnectAttempts >= maxReconnectAttempts) {
          return
        }
        reconnectAttempts += 1
        reconnectTimer = setTimeout(() => {
          if (!isClosed) void connect()
        }, Math.min(5000, 1500 * reconnectAttempts))
      }
    }

    void connect()

    return () => {
      isClosed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      if (socket) {
        socket.close()
      }
    }
  }, [currentUser.id, getToken, playNotificationSound, showDesktopNotification])

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_ids: [notificationId] }),
      })

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error("Failed to mark notification as read:", error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      })

      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        setUnreadCount(0)
      }
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error)
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id)
    }

    const link = getNotificationLink(notification)
    if (link) {
      setOpen(false)
      window.location.href = link
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-10 w-10 rounded-full hover:bg-sidebar-accent"
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5"
              >
                <Badge
                  variant="destructive"
                  className="h-5 min-w-[20px] p-0 flex items-center justify-center text-[10px] font-bold animate-pulse"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="end" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h4 className="font-semibold text-foreground">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Notifications list */}
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification, index) => {
                const link = getNotificationLink(notification)
                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={cn(
                      "px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors",
                      !notification.read && "bg-blue-50/50 dark:bg-blue-950/20"
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex gap-3">
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          {getNotificationIcon(notification.type)}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {notification.title}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(notification.created_at)}
                          </span>
                          {link && (
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Unread indicator */}
                      {!notification.read && (
                        <div className="flex-shrink-0">
                          <div className="h-2 w-2 rounded-full bg-blue-500" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-sm text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setOpen(false)
                  window.location.href = "/dashboard/notifications"
                }}
              >
                View all notifications
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
