/**
 * Notifications Library
 *
 * Provides functions to fetch real-time notifications and activity events.
 * Falls back to computing events from analyses data when backend is unavailable.
 */

import { fetchDashboardAnalyses, type DashboardAnalysisItem } from "./dashboard-analyses"
import { normalizeAnalysisStatus as normalizeStatus } from "./domain/analysis-status"
import { formatRelativeTime } from "./domain/dates"
import { createPoller } from "./polling"

// ============================================================================
// Types
// ============================================================================

export type NotificationType =
  | "analysis_complete"
  | "analysis_failed"
  | "review_assigned"
  | "review_completed"
  | "vulnerability_detected"
  | "pr_detected"
  | "blocker_found"
  | "warning_found"
  | "ai_review_complete"
  | "auto_approved"

export type NotificationSeverity = "info" | "warning" | "error" | "success"

export interface Notification {
  id: string
  type: NotificationType
  severity: NotificationSeverity
  title: string
  message: string
  timestamp: string
  read: boolean
  metadata?: {
    analysisId?: string
    repo?: string
    prLabel?: string
    blockerCount?: number
    warnCount?: number
  }
}

export interface ActivityEvent {
  id: number
  type: NotificationType
  iconType: "success" | "error" | "warning" | "ai" | "pr" | "performance"
  message: string
  time: string
  timestamp: Date
}

export interface NotificationsData {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  error: string | null
}

export interface ActivityFeedData {
  events: ActivityEvent[]
  isLoading: boolean
  error: string | null
}

// ============================================================================
// Default Data
// ============================================================================

export const defaultNotificationsData: NotificationsData = {
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
}

export const defaultActivityFeedData: ActivityFeedData = {
  events: [],
  isLoading: false,
  error: null,
}

// ============================================================================
// Utility Functions
// ============================================================================

function getNotificationType(analysis: DashboardAnalysisItem): NotificationType {
  const status = normalizeStatus(analysis.status)

  if (status === "FAILED") return "analysis_failed"
  if (status === "COMPLETED") {
    if (analysis.blockerCount >= 3) return "vulnerability_detected"
    if (analysis.blockerCount > 0) return "blocker_found"
    if (analysis.warnCount > 5) return "warning_found"
    return "analysis_complete"
  }
  return "pr_detected"
}

function getSeverity(type: NotificationType): NotificationSeverity {
  switch (type) {
    case "vulnerability_detected":
    case "analysis_failed":
      return "error"
    case "blocker_found":
    case "warning_found":
      return "warning"
    case "analysis_complete":
    case "review_completed":
    case "auto_approved":
    case "ai_review_complete":
      return "success"
    default:
      return "info"
  }
}

function getIconType(type: NotificationType): ActivityEvent["iconType"] {
  switch (type) {
    case "vulnerability_detected":
    case "analysis_failed":
      return "error"
    case "blocker_found":
    case "warning_found":
      return "warning"
    case "analysis_complete":
    case "review_completed":
    case "auto_approved":
      return "success"
    case "ai_review_complete":
      return "ai"
    case "pr_detected":
      return "pr"
    default:
      return "success"
  }
}

function generateMessage(analysis: DashboardAnalysisItem): string {
  const status = normalizeStatus(analysis.status)
  const repoName = analysis.repo.split("/").pop() || analysis.repo

  if (status === "FAILED") {
    return `Analyse échouée sur ${repoName}`
  }

  if (status === "COMPLETED") {
    if (analysis.blockerCount >= 3) {
      return `${analysis.blockerCount} vulnérabilités critiques sur ${repoName}`
    }
    if (analysis.blockerCount > 0) {
      return `${analysis.blockerCount} bloqueur(s) détecté(s) sur ${repoName}`
    }
    if (analysis.warnCount > 5) {
      return `${analysis.warnCount} warnings sur ${analysis.prLabel || repoName}`
    }
    return `Analyse terminée sur ${repoName}`
  }

  if (status === "RUNNING") {
    return `Analyse en cours sur ${repoName}`
  }

  return `Nouvelle PR détectée: ${analysis.prLabel || repoName}`
}

function generateTitle(type: NotificationType): string {
  switch (type) {
    case "vulnerability_detected":
      return "Vulnérabilité détectée"
    case "analysis_failed":
      return "Analyse échouée"
    case "blocker_found":
      return "Bloqueur trouvé"
    case "warning_found":
      return "Warnings détectés"
    case "analysis_complete":
      return "Analyse terminée"
    case "review_assigned":
      return "Review assignée"
    case "review_completed":
      return "Review complétée"
    case "ai_review_complete":
      return "Revue IA complétée"
    case "auto_approved":
      return "PR approuvée automatiquement"
    case "pr_detected":
      return "Nouvelle PR"
    default:
      return "Notification"
  }
}

// ============================================================================
// Compute from Analyses (Fallback)
// ============================================================================

function computeNotificationsFromAnalyses(analyses: DashboardAnalysisItem[]): NotificationsData {
  const notifications: Notification[] = analyses
    .slice(0, 20) // Limit to recent 20
    .map((analysis) => {
      const type = getNotificationType(analysis)
      const severity = getSeverity(type)

      return {
        id: `notif_${analysis.id}`,
        type,
        severity,
        title: generateTitle(type),
        message: generateMessage(analysis),
        timestamp: analysis.createdAt,
        read: false,
        metadata: {
          analysisId: analysis.id,
          repo: analysis.repo,
          prLabel: analysis.prLabel,
          blockerCount: analysis.blockerCount,
          warnCount: analysis.warnCount,
        },
      }
    })

  // Sort by timestamp (most recent first)
  notifications.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return {
    notifications,
    unreadCount: notifications.filter(n => !n.read).length,
    isLoading: false,
    error: null,
  }
}

function computeActivityFromAnalyses(analyses: DashboardAnalysisItem[]): ActivityFeedData {
  let eventId = 0
  const events: ActivityEvent[] = analyses
    .slice(0, 10) // Limit to recent 10 for feed
    .map((analysis) => {
      const type = getNotificationType(analysis)
      const timestamp = new Date(analysis.createdAt)

      return {
        id: eventId++,
        type,
        iconType: getIconType(type),
        message: generateMessage(analysis),
        time: formatRelativeTime(timestamp),
        timestamp,
      }
    })

  // Sort by timestamp (most recent first)
  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  return {
    events,
    isLoading: false,
    error: null,
  }
}

// ============================================================================
// API Response Types
// ============================================================================

interface BackendNotification {
  id?: string
  type?: string
  severity?: string
  title?: string
  message?: string
  timestamp?: string
  created_at?: string
  read?: boolean
  is_read?: boolean
  metadata?: Record<string, unknown>
}

interface BackendNotificationsResponse {
  notifications?: BackendNotification[]
  unread_count?: number
}

interface BackendActivityEvent {
  id?: number
  type?: string
  message?: string
  timestamp?: string
  created_at?: string
}

interface BackendActivityResponse {
  events?: BackendActivityEvent[]
  activities?: BackendActivityEvent[]
}

// ============================================================================
// Normalize API Responses
// ============================================================================

function normalizeNotificationsResponse(data: BackendNotificationsResponse): NotificationsData {
  const notifications: Notification[] = (data.notifications ?? []).map((n, index) => ({
    id: n.id ?? `notif_${index}`,
    type: (n.type as NotificationType) ?? "analysis_complete",
    severity: (n.severity as NotificationSeverity) ?? "info",
    title: n.title ?? generateTitle((n.type as NotificationType) ?? "analysis_complete"),
    message: n.message ?? "",
    timestamp: n.timestamp ?? n.created_at ?? new Date().toISOString(),
    read: n.read ?? n.is_read ?? false,
    metadata: n.metadata as Notification["metadata"],
  }))

  return {
    notifications,
    unreadCount: data.unread_count ?? notifications.filter(n => !n.read).length,
    isLoading: false,
    error: null,
  }
}

function normalizeActivityResponse(data: BackendActivityResponse): ActivityFeedData {
  const rawEvents = data.events ?? data.activities ?? []
  const events: ActivityEvent[] = rawEvents.map((e, index) => {
    const type = (e.type as NotificationType) ?? "analysis_complete"
    const timestamp = new Date(e.timestamp ?? e.created_at ?? new Date())

    return {
      id: e.id ?? index,
      type,
      iconType: getIconType(type),
      message: e.message ?? "",
      time: formatRelativeTime(timestamp),
      timestamp,
    }
  })

  return {
    events,
    isLoading: false,
    error: null,
  }
}

// ============================================================================
// Main Fetch Functions
// ============================================================================

export async function fetchNotifications(options?: {
  force?: boolean
  limit?: number
}): Promise<NotificationsData> {
  const limit = options?.limit ?? 20

  try {
    // Try backend API first
    const response = await fetch(`/api/dashboard/notifications?limit=${limit}`, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })

    if (response.ok) {
      const data = await response.json() as BackendNotificationsResponse
      return normalizeNotificationsResponse(data)
    }

    // Fall back to computing from analyses
    console.warn("[notifications] Backend API unavailable, computing from analyses")
    const analyses = await fetchDashboardAnalyses({ force: options?.force, size: limit })
    return computeNotificationsFromAnalyses(analyses)

  } catch (error) {
    console.error("[notifications] Error fetching:", error)

    // Try fallback
    try {
      const analyses = await fetchDashboardAnalyses({ force: options?.force, size: limit })
      return computeNotificationsFromAnalyses(analyses)
    } catch {
      return {
        ...defaultNotificationsData,
        error: "Erreur lors du chargement des notifications",
      }
    }
  }
}

export async function fetchActivityFeed(options?: {
  force?: boolean
  limit?: number
}): Promise<ActivityFeedData> {
  const limit = options?.limit ?? 10

  try {
    // Try backend API first
    const response = await fetch(`/api/dashboard/activity?limit=${limit}`, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })

    if (response.ok) {
      const data = await response.json() as BackendActivityResponse
      return normalizeActivityResponse(data)
    }

    // Fall back to computing from analyses
    console.warn("[activity-feed] Backend API unavailable, computing from analyses")
    const analyses = await fetchDashboardAnalyses({ force: options?.force, size: limit })
    return computeActivityFromAnalyses(analyses)

  } catch (error) {
    console.error("[activity-feed] Error fetching:", error)

    // Try fallback
    try {
      const analyses = await fetchDashboardAnalyses({ force: options?.force, size: limit })
      return computeActivityFromAnalyses(analyses)
    } catch {
      return {
        ...defaultActivityFeedData,
        error: "Erreur lors du chargement de l'activité",
      }
    }
  }
}

// ============================================================================
// Notification Actions
// ============================================================================

export async function markNotificationRead(notificationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/dashboard/notifications/${notificationId}/read`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    })

    if (response.ok) {
      return { success: true }
    }

    // If backend fails, we still mark it locally (soft fail)
    return { success: true }
  } catch (error) {
    console.error("[notifications] Mark read error:", error)
    return { success: true } // Soft fail - still allow UI to update
  }
}

export async function markAllNotificationsRead(): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("/api/dashboard/notifications/read-all", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    })

    if (response.ok) {
      return { success: true }
    }

    return { success: true } // Soft fail
  } catch (error) {
    console.error("[notifications] Mark all read error:", error)
    return { success: true } // Soft fail
  }
}

// ============================================================================
// Polling for Real-time Updates
// ============================================================================

const NOTIFICATIONS_POLL_INTERVAL_MS = 30_000 // 30 seconds
const ACTIVITY_POLL_INTERVAL_MS = 10_000 // 10 seconds

export function createNotificationsPoller(
  onUpdate: (data: NotificationsData) => void,
  options?: { intervalMs?: number }
) {
  return createPoller(
    async () => {
      const data = await fetchNotifications({ force: true })
      onUpdate(data)
    },
    {
      intervalMs: options?.intervalMs ?? NOTIFICATIONS_POLL_INTERVAL_MS,
      onError: (error) => {
        console.error("[notifications-poller] Poll error:", error)
      },
    },
  )
}

export function createActivityFeedPoller(
  onUpdate: (data: ActivityFeedData) => void,
  options?: { intervalMs?: number }
) {
  return createPoller(
    async () => {
      const data = await fetchActivityFeed({ force: true })
      onUpdate(data)
    },
    {
      intervalMs: options?.intervalMs ?? ACTIVITY_POLL_INTERVAL_MS,
      onError: (error) => {
        console.error("[activity-feed-poller] Poll error:", error)
      },
    },
  )
}
