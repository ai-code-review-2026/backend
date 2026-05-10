"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import { 
  Bell, 
  Check, 
  Archive, 
  Trash2, 
  AlertCircle,
  CheckCircle,
  Info,
  Clock,
  X,
  Settings,
  Filter
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType = "info" | "success" | "warning" | "error"

export type NotificationStatus = "unread" | "read" | "archived"

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: Date | string
  status: NotificationStatus
  actionUrl?: string
  actionLabel?: string
  metadata?: Record<string, any>
}

// ─── Notification Icon ────────────────────────────────────────────────────────

function NotificationIcon({ type }: { type: NotificationType }) {
  const iconMap = {
    info: Info,
    success: CheckCircle,
    warning: AlertCircle,
    error: AlertCircle,
  }
  
  const colorMap = {
    info: "text-blue-500",
    success: "text-green-500",
    warning: "text-amber-500",
    error: "text-red-500",
  }
  
  const bgMap = {
    info: "bg-blue-100 dark:bg-blue-950/30",
    success: "bg-green-100 dark:bg-green-950/30",
    warning: "bg-amber-100 dark:bg-amber-950/30",
    error: "bg-red-100 dark:bg-red-950/30",
  }
  
  const Icon = iconMap[type]
  
  return (
    <div className={cn("p-2 rounded-lg", bgMap[type])}>
      <Icon className={cn("h-4 w-4", colorMap[type])} />
    </div>
  )
}

// ─── Notification Item ────────────────────────────────────────────────────────

interface NotificationItemProps {
  notification: Notification
  onRead: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onClick?: (notification: Notification) => void
}

function NotificationItem({
  notification,
  onRead,
  onArchive,
  onDelete,
  onClick,
}: NotificationItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  
  const timestamp = useMemo(() => {
    const date = typeof notification.timestamp === "string" 
      ? new Date(notification.timestamp) 
      : notification.timestamp
    return formatDistanceToNow(date, { addSuffix: true })
  }, [notification.timestamp])
  
  const isUnread = notification.status === "unread"
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative p-4 rounded-lg transition-all cursor-pointer",
        "hover:bg-gray-50 dark:hover:bg-gray-800/50",
        isUnread && "bg-blue-50/50 dark:bg-blue-950/20 border-l-2 border-blue-500"
      )}
      onClick={() => {
        if (isUnread) {
          onRead(notification.id)
        }
        onClick?.(notification)
      }}
    >
      <div className="flex gap-3">
        <NotificationIcon type={notification.type} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className={cn(
              "text-sm font-medium text-gray-900 dark:text-white truncate",
              isUnread && "font-semibold"
            )}>
              {notification.title}
            </h4>
            
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 shrink-0"
                >
                  {isUnread && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRead(notification.id)
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                  
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation()
                      onArchive(notification.id)
                    }}
                  >
                    <Archive className="h-3 w-3" />
                  </Button>
                  
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-red-500 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(notification.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {notification.message}
          </p>
          
          <div className="flex items-center gap-2 mt-2">
            <Clock className="h-3 w-3 text-gray-400" />
            <span className="text-xs text-muted-foreground">
              {timestamp}
            </span>
            
            {isUnread && (
              <Badge variant="secondary" className="ml-auto text-xs">
                New
              </Badge>
            )}
          </div>
          
          {notification.actionUrl && notification.actionLabel && (
            <Button
              size="sm"
              variant="link"
              className="mt-2 p-0 h-auto text-blue-600 dark:text-blue-400"
              onClick={(e) => {
                e.stopPropagation()
                window.location.href = notification.actionUrl!
              }}
            >
              {notification.actionLabel} →
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: string }) {
  const messages = {
    all: "No notifications yet",
    unread: "No unread notifications",
    archived: "No archived notifications",
  }
  
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
        <Bell className="h-8 w-8 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        {messages[tab as keyof typeof messages]}
      </p>
      <p className="text-xs text-muted-foreground mt-1 text-center">
        You&apos;re all caught up! Check back later for updates.
      </p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface NotificationPopoverProps {
  notifications: Notification[]
  onNotificationRead?: (id: string) => void
  onNotificationArchive?: (id: string) => void
  onNotificationDelete?: (id: string) => void
  onMarkAllAsRead?: () => void
  onClearAll?: () => void
  onNotificationClick?: (notification: Notification) => void
  className?: string
}

export function NotificationPopover({
  notifications: initialNotifications = [],
  onNotificationRead,
  onNotificationArchive,
  onNotificationDelete,
  onMarkAllAsRead,
  onClearAll,
  onNotificationClick,
  className,
}: NotificationPopoverProps) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "archived">("all")
  
  // Update local state when prop changes
  React.useEffect(() => {
    setNotifications(initialNotifications)
  }, [initialNotifications])
  
  const unreadCount = useMemo(
    () => notifications.filter((n) => n.status === "unread").length,
    [notifications]
  )
  
  const filteredNotifications = useMemo(() => {
    switch (activeTab) {
      case "unread":
        return notifications.filter((n) => n.status === "unread")
      case "archived":
        return notifications.filter((n) => n.status === "archived")
      default:
        return notifications.filter((n) => n.status !== "archived")
    }
  }, [notifications, activeTab])
  
  const handleRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: "read" as const } : n))
    )
    onNotificationRead?.(id)
  }
  
  const handleArchive = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: "archived" as const } : n))
    )
    onNotificationArchive?.(id)
  }
  
  const handleDelete = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    onNotificationDelete?.(id)
  }
  
  const handleMarkAllAsRead = () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, status: n.status === "unread" ? "read" as const : n.status }))
    )
    onMarkAllAsRead?.()
  }
  
  const handleClearAll = () => {
    setNotifications([])
    onClearAll?.()
  }
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
        >
          <Bell className="h-5 w-5" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 flex items-center justify-center"
              >
                <span className="text-xs font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      
      <PopoverContent
        align="end"
        className="w-[calc(100vw-2rem)] sm:w-[380px] md:w-[420px] max-w-[420px] p-0 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {unreadCount} unread
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
            >
              <Check className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
            
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <div className="border-b border-gray-200 dark:border-gray-800 px-4">
            <TabsList className="w-full grid grid-cols-3 bg-transparent p-0 h-auto">
              <TabsTrigger 
                value="all" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
              >
                All
              </TabsTrigger>
              <TabsTrigger 
                value="unread"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
              >
                Unread
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="archived"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
              >
                Archived
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="all" className="m-0">
            <ScrollArea className="h-[500px]">
              <AnimatePresence mode="popLayout">
                {filteredNotifications.length === 0 ? (
                  <EmptyState tab="all" />
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredNotifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onRead={handleRead}
                        onArchive={handleArchive}
                        onDelete={handleDelete}
                        onClick={onNotificationClick}
                      />
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="unread" className="m-0">
            <ScrollArea className="h-[500px]">
              <AnimatePresence mode="popLayout">
                {filteredNotifications.length === 0 ? (
                  <EmptyState tab="unread" />
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredNotifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onRead={handleRead}
                        onArchive={handleArchive}
                        onDelete={handleDelete}
                        onClick={onNotificationClick}
                      />
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="archived" className="m-0">
            <ScrollArea className="h-[500px]">
              <AnimatePresence mode="popLayout">
                {filteredNotifications.length === 0 ? (
                  <EmptyState tab="archived" />
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredNotifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onRead={handleRead}
                        onArchive={handleArchive}
                        onDelete={handleDelete}
                        onClick={onNotificationClick}
                      />
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </TabsContent>
        </Tabs>
        
        {/* Footer */}
        {filteredNotifications.length > 0 && (
          <>
            <Separator />
            <div className="p-3 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClearAll}
                className="text-red-600 hover:text-red-700 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear all
              </Button>
              
              <Button
                size="sm"
                variant="link"
                className="text-blue-600 dark:text-blue-400"
                onClick={() => setOpen(false)}
              >
                View all notifications →
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
