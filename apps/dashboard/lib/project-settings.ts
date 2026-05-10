/**
 * Project Settings API Client
 * 
 * Provides functions to interact with the project settings API,
 * including auto-analysis toggle management.
 */

import { getBackendApiUrl } from "@/lib/backend-url-client"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TemporaryDisablePreset {
  label: string
  minutes: number
}

export interface AutoAnalysisState {
  project_id: string
  enabled: boolean
  effective_state: "enabled" | "disabled" | "temporarily_disabled"
  is_analysis_allowed: boolean
  temporarily_disabled_until: string | null
  temporarily_disabled_reason: string | null
  temporary_disable_remaining_seconds: number | null
  last_changed_by: string | null
  last_changed_at: string | null
  can_modify: boolean
  temporary_disable_presets: TemporaryDisablePreset[]
}

export interface AuditLogEntry {
  id: string
  user_email: string
  user_display_name: string | null
  action: string
  previous_state: Record<string, unknown>
  new_state: Record<string, unknown>
  reason: string | null
  created_at: string
}

export interface AuditLogResponse {
  project_id: string
  entries: AuditLogEntry[]
  total: number
  limit: number
  offset: number
}

export interface UpdateAutoAnalysisRequest {
  enabled: boolean
  reason?: string
}

export interface TemporaryDisableRequest {
  duration_minutes: number
  reason?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  token?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  return fetch(url, {
    ...options,
    headers,
  })
}

function encodeProjectId(projectId: string): string {
  // Encode the project ID for use in URL path
  return encodeURIComponent(projectId)
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the current auto-analysis state for a project
 */
export async function getAutoAnalysisState(
  projectId: string,
  token?: string
): Promise<AutoAnalysisState> {
  const response = await fetchWithAuth(
    getBackendApiUrl(`/api/v1/projects/${encodeProjectId(projectId)}/settings/auto-analysis`),
    { method: "GET" },
    token
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail || `Failed to get auto-analysis state: ${response.status}`)
  }

  return response.json()
}

/**
 * Update the auto-analysis toggle for a project
 */
export async function updateAutoAnalysisState(
  projectId: string,
  request: UpdateAutoAnalysisRequest,
  token?: string
): Promise<AutoAnalysisState> {
  const response = await fetchWithAuth(
    getBackendApiUrl(`/api/v1/projects/${encodeProjectId(projectId)}/settings/auto-analysis`),
    {
      method: "PUT",
      body: JSON.stringify(request),
    },
    token
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail || `Failed to update auto-analysis: ${response.status}`)
  }

  return response.json()
}

/**
 * Temporarily disable auto-analysis for a project
 */
export async function temporaryDisableAutoAnalysis(
  projectId: string,
  request: TemporaryDisableRequest,
  token?: string
): Promise<AutoAnalysisState> {
  const response = await fetchWithAuth(
    getBackendApiUrl(`/api/v1/projects/${encodeProjectId(projectId)}/settings/auto-analysis/temporary-disable`),
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    token
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail || `Failed to set temporary disable: ${response.status}`)
  }

  return response.json()
}

/**
 * Clear temporary disable for a project
 */
export async function clearTemporaryDisable(
  projectId: string,
  token?: string
): Promise<AutoAnalysisState> {
  const response = await fetchWithAuth(
    getBackendApiUrl(`/api/v1/projects/${encodeProjectId(projectId)}/settings/auto-analysis/temporary-disable`),
    { method: "DELETE" },
    token
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail || `Failed to clear temporary disable: ${response.status}`)
  }

  return response.json()
}

/**
 * Get the audit log for auto-analysis settings
 */
export async function getAutoAnalysisAuditLog(
  projectId: string,
  options: { limit?: number; offset?: number } = {},
  token?: string
): Promise<AuditLogResponse> {
  const params = new URLSearchParams()
  if (options.limit) params.set("limit", options.limit.toString())
  if (options.offset) params.set("offset", options.offset.toString())

  const queryString = params.toString()
  const url = getBackendApiUrl(
    `/api/v1/projects/${encodeProjectId(projectId)}/settings/auto-analysis/audit-log${queryString ? `?${queryString}` : ""}`,
  )

  const response = await fetchWithAuth(url, { method: "GET" }, token)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail || `Failed to get audit log: ${response.status}`)
  }

  return response.json()
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format the effective state for display
 */
export function formatEffectiveState(state: AutoAnalysisState["effective_state"]): string {
  switch (state) {
    case "enabled":
      return "Enabled"
    case "disabled":
      return "Disabled"
    case "temporarily_disabled":
      return "Temporarily Disabled"
    default:
      return "Unknown"
  }
}

/**
 * Get status color class based on effective state
 */
export function getStateColorClass(state: AutoAnalysisState["effective_state"]): string {
  switch (state) {
    case "enabled":
      return "text-green-600 dark:text-green-400"
    case "disabled":
      return "text-red-600 dark:text-red-400"
    case "temporarily_disabled":
      return "text-yellow-600 dark:text-yellow-400"
    default:
      return "text-gray-600 dark:text-gray-400"
  }
}

/**
 * Get badge variant based on effective state
 */
export function getStateBadgeVariant(
  state: AutoAnalysisState["effective_state"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (state) {
    case "enabled":
      return "default"
    case "disabled":
      return "destructive"
    case "temporarily_disabled":
      return "secondary"
    default:
      return "outline"
  }
}

/**
 * Format remaining time for temporary disable
 */
export function formatRemainingTime(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return ""

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s remaining`
  } else {
    return `${secs}s remaining`
  }
}

/**
 * Format action for display in audit log
 */
export function formatAuditAction(action: string): string {
  switch (action) {
    case "auto_analysis_enabled":
      return "Enabled auto-analysis"
    case "auto_analysis_disabled":
      return "Disabled auto-analysis"
    case "auto_analysis_temp_disabled":
      return "Temporarily disabled"
    case "auto_analysis_temp_disabled_expired":
      return "Temporary disable expired"
    case "settings_updated":
      return "Settings updated"
    default:
      return action
  }
}
