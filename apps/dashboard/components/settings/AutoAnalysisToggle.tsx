"use client"

import * as React from "react"
import { useAuth } from "@clerk/nextjs"
import { AlertTriangle, Clock, History, Loader2, Power, PowerOff } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/components/ui/utils"
import { toast } from "sonner"

import {
  type AutoAnalysisState,
  type AuditLogEntry,
  getAutoAnalysisState,
  updateAutoAnalysisState,
  temporaryDisableAutoAnalysis,
  clearTemporaryDisable,
  getAutoAnalysisAuditLog,
  formatEffectiveState,
  formatRemainingTime,
  formatAuditAction,
  getStateBadgeVariant,
} from "@/lib/project-settings"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AutoAnalysisToggleProps {
  projectId: string
  className?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AutoAnalysisToggle({ projectId, className }: AutoAnalysisToggleProps) {
  const { getToken } = useAuth()
  
  // State
  const [state, setState] = React.useState<AutoAnalysisState | null>(null)
  const [auditLog, setAuditLog] = React.useState<AuditLogEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [updating, setUpdating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  
  // Dialog state
  const [showDisableDialog, setShowDisableDialog] = React.useState(false)
  const [showTempDisableDialog, setShowTempDisableDialog] = React.useState(false)
  const [disableReason, setDisableReason] = React.useState("")
  const [tempDisableDuration, setTempDisableDuration] = React.useState("30")
  const [tempDisableReason, setTempDisableReason] = React.useState("")
  
  // Audit log visibility
  const [showAuditLog, setShowAuditLog] = React.useState(false)

  // Countdown timer for temporary disable
  const [remainingSeconds, setRemainingSeconds] = React.useState<number | null>(null)

  // ─────────────────────────────────────────────────────────────────────────────
  // Data Fetching
  // ─────────────────────────────────────────────────────────────────────────────

  const fetchState = React.useCallback(async () => {
    try {
      const token = await getToken()
      const data = await getAutoAnalysisState(projectId, token || undefined)
      setState(data)
      setRemainingSeconds(data.temporary_disable_remaining_seconds)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings")
    } finally {
      setLoading(false)
    }
  }, [projectId, getToken])

  const fetchAuditLog = React.useCallback(async () => {
    try {
      const token = await getToken()
      const data = await getAutoAnalysisAuditLog(projectId, { limit: 10 }, token || undefined)
      setAuditLog(data.entries)
    } catch (err) {
      console.error("Failed to fetch audit log:", err)
    }
  }, [projectId, getToken])

  // Initial load
  React.useEffect(() => {
    fetchState()
  }, [fetchState])

  // Fetch audit log when expanded
  React.useEffect(() => {
    if (showAuditLog && state?.can_modify) {
      fetchAuditLog()
    }
  }, [showAuditLog, state?.can_modify, fetchAuditLog])

  // Countdown timer for temporary disable
  React.useEffect(() => {
    if (remainingSeconds === null || remainingSeconds <= 0) return

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) {
          // Refresh state when timer expires
          fetchState()
          return null
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [remainingSeconds, fetchState])

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleToggleChange = async (checked: boolean) => {
    if (!state?.can_modify) return

    if (!checked) {
      // Show confirmation dialog when disabling
      setShowDisableDialog(true)
      return
    }

    // Enable directly
    await handleEnableAnalysis()
  }

  const handleEnableAnalysis = async () => {
    setUpdating(true)
    try {
      const token = await getToken()
      const data = await updateAutoAnalysisState(
        projectId,
        { enabled: true },
        token || undefined
      )
      setState(data)
      setRemainingSeconds(data.temporary_disable_remaining_seconds)
      setError(null)
      toast.success("Analyse automatique activée", { duration: 3000 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to enable auto-analysis"
      setError(msg)
      toast.error("Échec de l'activation", { description: msg, duration: 5000 })
    } finally {
      setUpdating(false)
    }
  }

  const handleDisableAnalysis = async () => {
    if (!disableReason.trim()) {
      setError("A reason is required when disabling auto-analysis")
      return
    }

    setUpdating(true)
    setShowDisableDialog(false)
    try {
      const token = await getToken()
      const data = await updateAutoAnalysisState(
        projectId,
        { enabled: false, reason: disableReason.trim() },
        token || undefined
      )
      setState(data)
      setRemainingSeconds(null)
      setDisableReason("")
      setError(null)
      toast.success("Analyse automatique désactivée", { duration: 3000 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to disable auto-analysis"
      setError(msg)
      toast.error("Échec de la désactivation", { description: msg, duration: 5000 })
    } finally {
      setUpdating(false)
    }
  }

  const handleTemporaryDisable = async () => {
    setUpdating(true)
    setShowTempDisableDialog(false)
    try {
      const token = await getToken()
      const data = await temporaryDisableAutoAnalysis(
        projectId,
        {
          duration_minutes: parseInt(tempDisableDuration, 10),
          reason: tempDisableReason.trim() || undefined,
        },
        token || undefined
      )
      setState(data)
      setRemainingSeconds(data.temporary_disable_remaining_seconds)
      setTempDisableReason("")
      setError(null)
      toast.success(`Analyse mise en pause pour ${tempDisableDuration} minutes`, { duration: 3000 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to set temporary disable"
      setError(msg)
      toast.error("Échec de la mise en pause", { description: msg, duration: 5000 })
    } finally {
      setUpdating(false)
    }
  }

  const handleClearTemporaryDisable = async () => {
    setUpdating(true)
    try {
      const token = await getToken()
      const data = await clearTemporaryDisable(projectId, token || undefined)
      setState(data)
      setRemainingSeconds(null)
      setError(null)
      toast.success("Analyse reprise avec succès", { duration: 3000 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to clear temporary disable"
      setError(msg)
      toast.error("Échec de la reprise", { description: msg, duration: 5000 })
    } finally {
      setUpdating(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!state) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Auto-Analysis Settings</CardTitle>
          <CardDescription>Unable to load settings</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error || "Unknown error"}</p>
          <Button onClick={fetchState} variant="outline" className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {state.is_analysis_allowed ? (
                  <Power className="h-5 w-5 text-green-500" />
                ) : (
                  <PowerOff className="h-5 w-5 text-destructive" />
                )}
                Automatic Code Analysis
              </CardTitle>
              <CardDescription>
                Control whether pull requests automatically trigger code analysis
              </CardDescription>
            </div>
            <Badge variant={getStateBadgeVariant(state.effective_state)}>
              {formatEffectiveState(state.effective_state)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Main Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="auto-analysis-toggle" className="text-base font-medium">
                Enable Auto-Analysis
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, every pull request will automatically trigger a RAG-based code analysis.
              </p>
            </div>
            <Switch
              id="auto-analysis-toggle"
              checked={state.enabled}
              onCheckedChange={handleToggleChange}
              disabled={!state.can_modify || updating}
              aria-label="Toggle auto-analysis"
            />
          </div>

          {/* Temporary Disable Status */}
          {state.effective_state === "temporarily_disabled" && remainingSeconds !== null && (
            <div className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-[color:var(--orange)] dark:text-yellow-400" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">
                    Temporarily Paused
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    {formatRemainingTime(remainingSeconds)}
                    {state.temporarily_disabled_reason && (
                      <> &middot; {state.temporarily_disabled_reason}</>
                    )}
                  </p>
                </div>
              </div>
              {state.can_modify && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearTemporaryDisable}
                  disabled={updating}
                >
                  {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Resume Now"}
                </Button>
              )}
            </div>
          )}

          {/* Temporary Disable Button */}
          {state.can_modify && state.enabled && state.effective_state === "enabled" && (
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => setShowTempDisableDialog(true)}
                disabled={updating}
              >
                <Clock className="mr-2 h-4 w-4" />
                Pause Temporarily
              </Button>
              <p className="text-sm text-muted-foreground">
                Pause analysis for a limited time (e.g., during demos or deployments)
              </p>
            </div>
          )}

          {/* Read-only notice for non-admins */}
          {!state.can_modify && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Only Admins and Tech Leads can modify this setting.
              </p>
            </div>
          )}

          {/* Last Change Info */}
          {state.last_changed_at && (
            <p className="text-xs text-muted-foreground">
              Last changed {new Date(state.last_changed_at).toLocaleString()}
              {state.last_changed_by && <> by {state.last_changed_by}</>}
            </p>
          )}

          {/* Audit Log (Collapsible) */}
          {state.can_modify && (
            <Collapsible open={showAuditLog} onOpenChange={setShowAuditLog}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-start">
                  <History className="mr-2 h-4 w-4" />
                  {showAuditLog ? "Hide" : "Show"} Change History
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <div className="space-y-2">
                  {auditLog.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
                  ) : (
                    auditLog.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 rounded-md border p-3 text-sm"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{formatAuditAction(entry.action)}</p>
                          <p className="text-muted-foreground">
                            {entry.user_display_name || entry.user_email}
                            {entry.reason && <> &middot; &ldquo;{entry.reason}&rdquo;</>}
                          </p>
                        </div>
                        <time className="text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString()}
                        </time>
                      </div>
                    ))
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {/* Disable Confirmation Dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Disable Auto-Analysis?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Disabling auto-analysis will stop all automatic code reviews for this project.
              Pull requests will no longer be analyzed automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="disable-reason">Reason (required)</Label>
            <Textarea
              id="disable-reason"
              placeholder="Why are you disabling auto-analysis?"
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableAnalysis}
              disabled={!disableReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Temporary Disable Dialog */}
      <AlertDialog open={showTempDisableDialog} onOpenChange={setShowTempDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Temporarily Pause Auto-Analysis
            </AlertDialogTitle>
            <AlertDialogDescription>
              Pause automatic code analysis for a limited time. Analysis will automatically
              resume after the specified duration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="temp-duration">Duration</Label>
              <Select value={tempDisableDuration} onValueChange={setTempDisableDuration}>
                <SelectTrigger id="temp-duration" className="mt-2">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {(state?.temporary_disable_presets || []).map((preset) => (
                    <SelectItem key={preset.minutes} value={preset.minutes.toString()}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="temp-reason">Reason (optional)</Label>
              <Textarea
                id="temp-reason"
                placeholder="e.g., Demo in progress, deployment window"
                value={tempDisableReason}
                onChange={(e) => setTempDisableReason(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTemporaryDisable}>
              Pause Analysis
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
