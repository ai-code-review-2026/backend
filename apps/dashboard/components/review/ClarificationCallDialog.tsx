"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Copy, ExternalLink, Mic, PhoneCall, Video } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/components/ui/utils"
import type { DashboardAnalysisFinding } from "@/lib/dashboard-analysis-details"
import type { ReviewComment } from "@/lib/review-types"

type CallMode = "voice" | "video"

type ClarificationCallDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysisId: string
  repoName: string
  authorName: string
  reviewerName: string
  finding: DashboardAnalysisFinding | null
  onCommentCreated?: (comment: ReviewComment) => void
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

function lineRangeLabel(finding: DashboardAnalysisFinding) {
  if (finding.lineStart == null) return "general review context"
  if (finding.lineEnd == null || finding.lineEnd === finding.lineStart) {
    return `line ${finding.lineStart}`
  }
  return `lines ${finding.lineStart}-${finding.lineEnd}`
}

function buildRoomName(
  analysisId: string,
  repoName: string,
  finding: DashboardAnalysisFinding,
  mode: CallMode,
) {
  return [
    "greptile",
    "clarify",
    analysisId,
    repoName,
    finding.ruleId ?? finding.category,
    finding.filePath,
    finding.lineStart ?? 0,
    mode,
  ]
    .map((part) => slugify(String(part)))
    .filter((part) => part.length > 0)
    .join("-")
}

function buildCallUrl(roomName: string, mode: CallMode) {
  const params = new URLSearchParams({
    "config.prejoinPageEnabled": "false",
    "config.startWithVideoMuted": mode === "voice" ? "true" : "false",
    "config.startWithAudioMuted": "false",
  })

  return `https://meet.jit.si/${roomName}#${params.toString()}`
}

function buildDefaultMessage({
  authorName,
  reviewerName,
  finding,
}: {
  authorName: string
  reviewerName: string
  finding: DashboardAnalysisFinding
}) {
  const lineLabel = lineRangeLabel(finding)
  const suggestion = finding.suggestion ? `\nSuggested direction: ${finding.suggestion}` : ""

  return [
    `Hi ${authorName}, I need a quick clarification call to resolve this review point.`,
    `Reviewer: ${reviewerName}`,
    `Location: ${finding.filePath}${finding.lineStart != null ? `:${finding.lineStart}` : ""} (${lineLabel})`,
    `Finding: ${finding.message}${suggestion}`,
  ].join("\n")
}

export function ClarificationCallDialog({
  open,
  onOpenChange,
  analysisId,
  repoName,
  authorName,
  reviewerName,
  finding,
  onCommentCreated,
}: ClarificationCallDialogProps) {
  const [mode, setMode] = useState<CallMode>("voice")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle")

  useEffect(() => {
    if (!open || !finding) return

    setMode(finding.severity === "BLOCKER" ? "video" : "voice")
    setMessage(
      buildDefaultMessage({
        authorName,
        reviewerName,
        finding,
      }),
    )
    setCopyState("idle")
    setIsSubmitting(false)
  }, [authorName, finding, open, reviewerName])

  useEffect(() => {
    if (copyState !== "copied") return undefined

    const timer = window.setTimeout(() => {
      setCopyState("idle")
    }, 1800)

    return () => window.clearTimeout(timer)
  }, [copyState])

  const roomName = useMemo(() => {
    if (!finding) return ""
    return buildRoomName(analysisId, repoName, finding, mode)
  }, [analysisId, finding, mode, repoName])

  const roomUrl = useMemo(() => {
    if (!roomName) return ""
    return buildCallUrl(roomName, mode)
  }, [mode, roomName])

  const inviteText = useMemo(() => {
    if (!finding || !roomUrl) return ""

    return [
      `Clarification ${mode === "voice" ? "voice" : "video"} call for ${repoName}`,
      `Room: ${roomUrl}`,
      "",
      message.trim(),
    ].join("\n")
  }, [finding, message, mode, repoName, roomUrl])

  const handleCopyInvite = async () => {
    if (!inviteText) return

    try {
      await navigator.clipboard.writeText(inviteText)
      setCopyState("copied")
    } catch (error) {
      console.error("[ClarificationCallDialog] Failed to copy invite:", error)
    }
  }

  const handleCreateCall = async () => {
    if (!finding || !roomUrl) return

    const popup = window.open("", "_blank")
    setIsSubmitting(true)

    try {
      const commentBody = [
        `Clarification ${mode === "voice" ? "voice" : "video"} call requested.`,
        `Room: ${roomUrl}`,
        `Reviewer: ${reviewerName}`,
        `Author: ${authorName}`,
        `Location: ${finding.filePath}${finding.lineStart != null ? `:${finding.lineStart}` : ""}`,
        `Finding: ${finding.message}`,
        finding.suggestion ? `Suggestion: ${finding.suggestion}` : null,
        "",
        message.trim(),
      ]
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        .join("\n")

      const response = await fetch("/api/reviews/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          analysis_id: analysisId,
          file_path: finding.filePath,
          line_start: finding.lineStart ?? 1,
          line_end: finding.lineEnd,
          content: commentBody,
          comment_type: "question",
          severity: finding.severity === "BLOCKER" ? "blocker" : finding.severity === "WARN" ? "warn" : "info",
          is_blocking: false,
        }),
      })

      if (response.ok) {
        const createdComment = (await response.json()) as ReviewComment
        onCommentCreated?.(createdComment)
      }
    } catch (error) {
      console.error("[ClarificationCallDialog] Failed to create clarification call:", error)
    } finally {
      if (popup) {
        popup.location.href = roomUrl
        popup.focus()
      } else {
        window.location.assign(roomUrl)
      }

      onOpenChange(false)
      setIsSubmitting(false)
    }
  }

  if (!finding) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <PhoneCall className="h-5 w-5 text-blue-500" />
            Request a clarification call
          </DialogTitle>
          <DialogDescription>
            Start a voice or video call when a finding needs live clarification.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2 md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-sm font-medium">Call mode</Label>
              <RadioGroup
                value={mode}
                onValueChange={(value) => setMode(value as CallMode)}
                className="grid gap-3 sm:grid-cols-2"
              >
                {[
                  {
                    value: "voice" as const,
                    title: "Voice call",
                    description: "Fast clarification without video overhead.",
                    icon: Mic,
                  },
                  {
                    value: "video" as const,
                    title: "Video call",
                    description: "Use screen + face-to-face context for complex issues.",
                    icon: Video,
                  },
                ].map((option) => {
                  const selected = mode === option.value

                  return (
                    <Label
                      key={option.value}
                      htmlFor={`clarification-${option.value}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                        selected
                          ? "border-blue-500/40 bg-blue-500/10"
                          : "border-border bg-card hover:border-border/80",
                      )}
                    >
                      <RadioGroupItem
                        id={`clarification-${option.value}`}
                        value={option.value}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <option.icon className="h-4 w-4 text-foreground" />
                          <span className="font-medium text-foreground">{option.title}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                      </div>
                    </Label>
                  )
                })}
              </RadioGroup>
            </div>

            <div>
              <Label htmlFor="clarification-message" className="mb-2 block text-sm font-medium">
                Message for the author
              </Label>
              <Textarea
                id="clarification-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-[180px] resize-none"
                placeholder="Explain why you need the call and what you want to clarify."
              />
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-blue-500/40 text-teal-400">
                  {mode === "voice" ? "Voice" : "Video"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Room: <span className="font-mono text-foreground/80">{roomName || "..."}</span>
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                <ExternalLink className="h-4 w-4 text-foreground/60" />
                <span className="truncate">{roomUrl || "Generating meeting link..."}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={cn(
                  "h-4 w-4",
                  finding.severity === "BLOCKER"
                    ? "text-destructive"
                    : finding.severity === "WARN"
                      ? "text-[color:var(--orange)]"
                      : "text-blue-500",
                )}
              />
              <span className="text-sm font-medium text-foreground">Finding summary</span>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Location</p>
                <p className="mt-1 text-foreground">{finding.filePath}</p>
                <p>{lineRangeLabel(finding)}</p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Issue</p>
                <p className="mt-1 text-foreground">{finding.message}</p>
              </div>

              {finding.suggestion && (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Suggested fix</p>
                  <p className="mt-1 text-foreground">{finding.suggestion}</p>
                </div>
              )}

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">People</p>
                <p className="mt-1 text-foreground">{authorName} with {reviewerName}</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              The review note will be saved as a question and linked to the file location, so the author sees the
              call context directly from the review thread.
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCopyInvite} disabled={!inviteText || isSubmitting}>
            <Copy className="mr-2 h-4 w-4" />
            {copyState === "copied" ? "Copied" : "Copy invite"}
          </Button>
          <Button
            onClick={handleCreateCall}
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <PhoneCall className="mr-2 h-4 w-4" />
            {isSubmitting ? "Creating..." : "Create and open call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
