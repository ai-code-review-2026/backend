"use client"
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useMemo, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileDiff,
  Files,
  GitBranch,
  GitPullRequest,
  Loader2,
  MessageSquarePlus,
  PhoneCall,
  Save,
  Search,
  Settings,
  Shield,
  SplitSquareHorizontal,
  X,
  Zap,
  TrendingUp,
  FileCode2,
  Eye,
} from "lucide-react"
import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider"
import { isReviewer } from "@/lib/roles"
import {
  fetchDashboardAnalysisDetails,
  type DashboardAnalysisDetails,
  type DashboardAnalysisDiffFile,
  type DashboardAnalysisFinding,
} from "@/lib/dashboard-analysis-details"
import { InlineCommentForm } from "@/components/review/InlineCommentForm"
import { CommentThread } from "@/components/review/CommentThread"
import { PendingReviewBanner } from "@/components/review/PendingReviewBanner"
import { ClarificationCallDialog } from "@/components/review/ClarificationCallDialog"
import { ReviewSubmissionDialog } from "@/components/review/ReviewSubmissionDialog"
import { EnhancedFuturisticDiffEditor } from "@/components/editor/EnhancedFuturisticDiffEditor"
import type { PendingComment, ReviewComment, CommentAuthor, ReviewVerdict } from "@/lib/review-types"

// ─── helpers ────────────────────────────────────────────────────────────────

function getFileInfo(path: string) {
  const filename = path.split("/").pop() ?? path
  const ext = filename.split(".").pop()?.toUpperCase() ?? ""
  const extColors: Record<string, string> = {
    TS: "#3178c5", TSX: "#3178c5",
    JS: "#f7df1e", JSX: "#f7df1e",
    PY: "#3572a5",
    JSON: "#fbc02d",
    MD: "#42a5f5",
    CSS: "#42a5f5",
    HTML: "#e67e22",
    RS: "#ce412b",
    GO: "#00acd7",
    SH: "#4caf50",
    CP: "#9c27b0",
  }
  return {
    filename,
    ext: ext.slice(0, 2) || "??",
    extColor: extColors[ext] ?? "#6e7681",
  }
}

function calculateQualityScore(findings: DashboardAnalysisDetails["findings"]): number {
  const blockers = findings.filter((f) => f.severity === "BLOCKER").length
  const warnings = findings.filter((f) => f.severity === "WARN").length
  return Math.max(0, 100 - blockers * 15 - warnings * 5)
}

function normalizePathForComparison(value: string | null | undefined): string {
  return (value ?? "").trim().replaceAll("\\", "/").replace(/^\/+/, "")
}

function severityRank(severity: string): number {
  if (severity === "BLOCKER") return 0
  if (severity === "WARN") return 1
  return 2
}

const SOURCE_LABEL: Record<string, string> = {
  STATIC_RUFF: "Ruff",
  STATIC_SEMGREP: "Semgrep",
  STATIC_CLEAN_CODE: "CleanCode",
  STATIC_ESLINT: "ESLint",
  STATIC_STYLELINT: "Stylelint",
  STATIC_RUBOCOP: "RuboCop",
  STATIC_STATICCHECK: "Staticcheck",
  STATIC_SQLFLUFF: "SQLFluff",
  RAG: "AI Review",
}

function toolLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source.replace("STATIC_", "").toLowerCase()
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e"
  if (score >= 60) return "#f59e0b"
  return "#ef4444"
}

function getScoreGlow(score: number): string {
  if (score >= 80) return "0 0 12px rgba(34,197,94,0.35)"
  if (score >= 60) return "0 0 12px rgba(245,158,11,0.35)"
  return "0 0 12px rgba(239,68,68,0.35)"
}

type RepoCoordinates = { owner: string; repo: string }

function parseRepoCoordinates(value: string | null | undefined): RepoCoordinates | null {
  const raw = (value ?? "").trim()
  if (!raw) return null
  const normalized = raw
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
  const parts = normalized.split("/").filter((part) => part.length > 0)
  if (parts.length < 2) return null
  return { owner: parts[0], repo: parts[1] }
}

// ─── sub-components ─────────────────────────────────────────────────────────

function ExtBadge({ ext, color }: { ext: string; color: string }) {
  return (
    <span
      className="inline-flex items-center justify-center text-white flex-shrink-0 font-bold"
      style={{
        background: color,
        width: 20,
        height: 15,
        fontSize: 8,
        borderRadius: 3,
        letterSpacing: "0.03em",
      }}
    >
      {ext}
    </span>
  )
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <svg width={72} height={72} className="flex-shrink-0">
      <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
      <motion.circle
        cx={36}
        cy={36}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        transform="rotate(-90 36 36)"
        style={{ filter: `drop-shadow(0 0 5px ${color}66)` }}
      />
      <text
        x={36}
        y={36}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={16}
        fontWeight="bold"
        fontFamily="Inter, sans-serif"
      >
        {score}
      </text>
    </svg>
  )
}

function RagComment({
  finding,
  onApply,
  onComment,
  onDismiss,
  onRequestCall,
}: {
  finding: DashboardAnalysisFinding
  onApply?: () => void
  onComment?: () => void
  onDismiss?: () => void
  onRequestCall?: () => void
}) {
  const isCritical = finding.severity === "BLOCKER"
  const accentColor = isCritical ? "#f87171" : "#fbbf24"
  const bgColor = isCritical ? "rgba(248,113,113,0.05)" : "rgba(251,191,36,0.05)"
  const borderColor = isCritical ? "rgba(248,113,113,0.3)" : "rgba(251,191,36,0.25)"
  const label = isCritical ? "critical" : "warning"
  const location = finding.lineStart != null
    ? `· ligne ${finding.lineStart}${finding.lineEnd != null ? `–${finding.lineEnd}` : ""} · ${label}`
    : `· ${label}`

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="relative"
      style={{
        background: bgColor,
        borderLeft: `2px solid ${accentColor}`,
        borderBottom: `1px solid ${borderColor}`,
      }}
    >
      <div className="py-2.5 px-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="flex items-center justify-center text-[10px] font-bold flex-shrink-0"
            style={{
              background: accentColor,
              color: "#0d1117",
              width: 26,
              height: 26,
              borderRadius: "50%",
              boxShadow: `0 0 8px ${accentColor}55`,
            }}
          >
            AI
          </div>
          <span className="text-[11px] font-semibold" style={{ color: accentColor }}>
            RAG Reviewer
          </span>
          <span className="text-[10px]" style={{ color: "#6e7681" }}>{location}</span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 ml-0.5"
            style={{
              color: accentColor,
              background: `${accentColor}18`,
              border: `1px solid ${accentColor}40`,
              borderRadius: 3,
              fontFamily: "monospace",
              letterSpacing: "0.03em",
            }}
          >
            {label.toUpperCase()}
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5"
            style={{
              color: "#8b949e",
              background: "rgba(255,255,255,0.05)",
              fontFamily: "monospace",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 3,
            }}
          >
            {toolLabel(finding.source)}
          </span>
        </div>
        {/* Message */}
        <p className="text-[11px] ml-9 mb-2.5 leading-relaxed" style={{ color: "#9ca3af" }}>
          {finding.message}
          {finding.suggestion && (
            <span style={{ color: "#60a5fa" }}> → {finding.suggestion}</span>
          )}
        </p>
        {/* Actions */}
        <div className="flex flex-wrap gap-1.5 ml-9">
          <button
            className="text-[10px] font-semibold px-3 py-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "rgba(99,102,241,0.85)",
              color: "#fff",
              borderRadius: 4,
              border: "1px solid rgba(129,140,248,0.4)",
            }}
            onClick={onApply}
            disabled={!onApply}
          >
            Appliquer correction
          </button>
          <button
            className="text-[10px] px-3 py-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "#9ca3af",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            onClick={onComment}
            disabled={!onComment}
          >
            Commenter
          </button>
          <button
            className="text-[10px] px-3 py-1 flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "rgba(96,165,250,0.1)",
              color: "#60a5fa",
              borderRadius: 4,
              border: "1px solid rgba(96,165,250,0.25)",
            }}
            onClick={onRequestCall}
            disabled={!onRequestCall}
          >
            <PhoneCall className="h-3 w-3" />
            Appel
          </button>
          <button
            className="text-[10px] px-3 py-1 transition-all"
            style={{
              background: "transparent",
              color: "#6b7280",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.06)",
            }}
            onClick={onDismiss}
          >
            Ignorer
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function DiffLine({
  line,
  lineNumber,
  findings,
  dismissedFindings,
  onDismiss,
  onComment,
  onRequestCall,
  isCommenting,
}: {
  line: DashboardAnalysisDiffFile["lines"][number]
  lineNumber: number
  findings: DashboardAnalysisDetails["findings"]
  dismissedFindings: Set<string>
  onDismiss: (id: string) => void
  onComment: (lineNumber: number) => void
  onRequestCall: (finding: DashboardAnalysisFinding) => void
  isCommenting: boolean
}) {
  const lineFindings = findings.filter(
    (f) =>
      !dismissedFindings.has(f.id) &&
      f.lineStart != null &&
      f.lineStart <= lineNumber &&
      (f.lineEnd == null || f.lineEnd >= lineNumber) &&
      f.lineStart === lineNumber
  )

  const isAdd = line.lineType === "add"
  const isRemove = line.lineType === "remove"
  const isHeader = line.lineType === "header"

  const bgColor = isAdd
    ? "rgba(34,197,94,0.08)"
    : isRemove
    ? "rgba(239,68,68,0.08)"
    : isHeader
    ? "rgba(96,165,250,0.06)"
    : "transparent"

  const borderColor = isAdd
    ? "rgba(34,197,94,0.5)"
    : isRemove
    ? "rgba(239,68,68,0.5)"
    : isHeader
    ? "rgba(96,165,250,0.4)"
    : "transparent"

  const prefix = isAdd ? "+" : isRemove ? "-" : isHeader ? "@" : " "
  const prefixColor = isAdd ? "#22c55e" : isRemove ? "#ef4444" : isHeader ? "#60a5fa" : "transparent"
  const lineNumColor = isHeader ? "#60a5fa" : "#4b5563"
  const contentColor = isRemove ? "#fca5a5" : isHeader ? "#93c5fd" : "#e2e8f0"

  return (
    <>
      <div
        className="group flex items-stretch relative"
        style={{
          background: bgColor,
          borderLeft: `2px solid ${borderColor}`,
          minHeight: 22,
        }}
      >
        {/* Old line number */}
        <span
          className="w-[44px] text-right pr-2 select-none flex-shrink-0 flex items-center justify-end"
          style={{ color: lineNumColor, fontSize: 11, fontFamily: "monospace", borderRight: "1px solid rgba(255,255,255,0.05)" }}
        >
          {!isHeader ? (line.oldLineNo ?? "") : ""}
        </span>
        {/* New line number */}
        <span
          className="w-[44px] text-right pr-2 select-none flex-shrink-0 flex items-center justify-end"
          style={{ color: lineNumColor, fontSize: 11, fontFamily: "monospace", borderRight: "1px solid rgba(255,255,255,0.05)" }}
        >
          {!isHeader ? (line.newLineNo ?? "") : ""}
        </span>
        {/* Prefix */}
        <span
          className="w-5 flex items-center justify-center select-none flex-shrink-0 font-bold"
          style={{ color: prefixColor, fontSize: 12, fontFamily: "monospace" }}
        >
          {prefix}
        </span>
        {/* Content */}
        <span
          className="flex-1 px-1 flex items-center"
          style={{
            color: contentColor,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            whiteSpace: "pre",
            overflowX: "auto",
          }}
        >
          {line.content}
        </span>
        {/* Inline comment trigger */}
        {!isHeader && (
          <button
            onClick={() => onComment(lineNumber)}
            className="mr-2 my-0.5 flex items-center justify-center flex-shrink-0 transition-all opacity-0 group-hover:opacity-100"
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              color: isCommenting ? "#0d1117" : "#60a5fa",
              background: isCommenting ? "#60a5fa" : "rgba(96,165,250,0.1)",
              border: "1px solid rgba(96,165,250,0.2)",
            }}
            title="Comment this line"
          >
            <MessageSquarePlus className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* RAG comments after this line */}
      <AnimatePresence>
        {lineFindings.map((finding) => {
          const findingLineStart = finding.lineStart
          return (
            <RagComment
              key={finding.id}
              finding={finding}
              onComment={findingLineStart != null ? () => onComment(findingLineStart) : undefined}
              onDismiss={() => onDismiss(finding.id)}
              onRequestCall={() => onRequestCall(finding)}
            />
          )
        })}
      </AnimatePresence>
    </>
  )
}

// ─── main component ─────────────────────────────────────────────────────────

export function AnnotatedDiff() {
  const currentUser = useDashboardUser()
  const params = useParams<{ id: string | string[] }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id

  const [analysis, setAnalysis] = useState<DashboardAnalysisDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [dismissedFindings, setDismissedFindings] = useState<Set<string>>(new Set())

  // Review state
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([])
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null)
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Comments from API
  const [existingComments, setExistingComments] = useState<ReviewComment[]>([])
  const [commentAuthors, setCommentAuthors] = useState<Map<string, CommentAuthor>>(new Map())
  const [clarificationTarget, setClarificationTarget] = useState<DashboardAnalysisFinding | null>(null)

  // Real GitHub editing/review state
  const [viewMode, setViewMode] = useState<"split" | "diff" | "edit">("edit")
  const [activeBranch, setActiveBranch] = useState("main")
  const [branchLoading, setBranchLoading] = useState(false)
  const [editorSaveTrigger, setEditorSaveTrigger] = useState(0)
  const [githubActionMessage, setGithubActionMessage] = useState<{
    type: "success" | "error" | "info"
    text: string
  } | null>(null)
  const [isSubmittingGitHubReview, setIsSubmittingGitHubReview] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!id) { setAnalysis(null); setLoading(false); return }
    setLoading(true)
    fetchDashboardAnalysisDetails(id)
      .then((payload) => {
        if (cancelled) return
        setAnalysis(payload)
        if (payload && payload.files.length > 0) {
          setSelectedFilePath(payload.files[0].pathNew)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!id) return
    const fetchComments = async () => {
      try {
        const response = await fetch(`/api/reviews/comments?analysis_id=${id}`)
        if (response.ok) {
          const data = await response.json()
          setExistingComments(data.comments || [])
          const authors = new Map<string, CommentAuthor>()
          for (const comment of data.comments || []) {
            if (comment.author && !authors.has(comment.author.id)) {
              authors.set(comment.author.id, comment.author)
            }
          }
          setCommentAuthors(authors)
        }
      } catch (error) {
        console.error("Failed to fetch comments:", error)
      }
    }
    fetchComments()
  }, [id])

  const selectedFile = useMemo<DashboardAnalysisDiffFile | null>(() => {
    if (!analysis || !selectedFilePath) return null
    return analysis.files.find((f) => f.pathNew === selectedFilePath) ?? null
  }, [analysis, selectedFilePath])

  const repoCoordinates = useMemo(
    () => parseRepoCoordinates(analysis?.repo),
    [analysis?.repo],
  )

  useEffect(() => {
    let cancelled = false
    const resolveBranch = async () => {
      if (!analysis || !repoCoordinates) { setActiveBranch("main"); return }
      setBranchLoading(true)
      try {
        const listBranchesResponse = await fetch("/api/dashboard/github", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "list_branches",
            payload: { owner: repoCoordinates.owner, repo: repoCoordinates.repo },
          }),
        })
        const listBranchesData = await listBranchesResponse.json().catch(() => ({}))
        if (!listBranchesResponse.ok) throw new Error(typeof listBranchesData?.error === "string" ? listBranchesData.error : "Failed to resolve repository branches")
        const branches = Array.isArray(listBranchesData?.result) ? listBranchesData.result : []
        const branchNames = (branches as { name?: unknown }[]).map((b) => typeof b?.name === "string" ? b.name.trim() : "").filter((n): n is string => n.length > 0)
        const defaultBranch = branchNames.find((n) => n === "main") ?? branchNames.find((n) => n === "master") ?? branchNames[0] ?? "main"
        if (!analysis.prNumber) { if (!cancelled) setActiveBranch(defaultBranch); return }
        const response = await fetch("/api/dashboard/github", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_pr", payload: { owner: repoCoordinates.owner, repo: repoCoordinates.repo, pullNumber: analysis.prNumber } }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to resolve PR branch")
        const prHeadRef = typeof data?.result?.head?.ref === "string" ? data.result.head.ref.trim() : ""
        const prBaseRef = typeof data?.result?.base?.ref === "string" ? data.result.base.ref.trim() : ""
        if (!cancelled) setActiveBranch(prHeadRef || prBaseRef || defaultBranch)
      } catch (error) {
        console.error("Failed to resolve PR branch:", error)
        if (!cancelled) {
          setActiveBranch("main")
          setGithubActionMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to resolve PR branch" })
        }
      } finally { if (!cancelled) setBranchLoading(false) }
    }
    void resolveBranch()
    return () => { cancelled = true }
  }, [analysis, repoCoordinates])

  const fileFindings = useMemo(() => {
    if (!analysis) return []
    const selectedPaths = new Set(
      [selectedFile?.pathNew, selectedFile?.pathOld, selectedFilePath]
        .map((v) => normalizePathForComparison(v))
        .filter((v) => v.length > 0),
    )
    const matching = selectedPaths.size > 0
      ? analysis.findings.filter((f) => selectedPaths.has(normalizePathForComparison(f.filePath)))
      : []
    return [...(matching.length > 0 ? matching : analysis.findings)].sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity) || (a.lineStart ?? 9999) - (b.lineStart ?? 9999)
    )
  }, [analysis, selectedFile, selectedFilePath])

  const selectedFinding = useMemo<DashboardAnalysisFinding | null>(() => {
    const activeFindings = fileFindings.filter((finding) => !dismissedFindings.has(finding.id))
    if (activeFindings.length === 0) {
      return null
    }

    if (clarificationTarget && !dismissedFindings.has(clarificationTarget.id)) {
      const inCurrentFile = activeFindings.some((finding) => finding.id === clarificationTarget.id)
      if (inCurrentFile) {
        return clarificationTarget
      }
    }

    return activeFindings[0]
  }, [clarificationTarget, dismissedFindings, fileFindings])

  const commentsByLine = useMemo(() => {
    const map = new Map<number, ReviewComment[]>()
    const normalizedPath = normalizePathForComparison(selectedFilePath)
    for (const comment of existingComments) {
      if (normalizePathForComparison(comment.file_path) === normalizedPath && !comment.parent_id) {
        const line = comment.line_start
        if (!map.has(line)) map.set(line, [])
        map.get(line)!.push(comment)
      }
    }
    return map
  }, [existingComments, selectedFilePath])

  const getReplies = useCallback((parentId: string) => {
    return existingComments.filter((c) => c.parent_id === parentId)
  }, [existingComments])

  const canReview = isReviewer(currentUser.role) || currentUser.role === "admin"

  const handleAddPendingComment = (comment: PendingComment) => {
    setPendingComments((prev) => [...prev, comment])
    setActiveCommentLine(null)
  }
  const handleRemovePendingComment = (commentId: string) => {
    setPendingComments((prev) => prev.filter((c) => c.id !== commentId))
  }
  const handleClearAllPendingComments = () => setPendingComments([])

  const handleSubmitReview = async (verdict: ReviewVerdict, summary: string) => {
    if (!id) return
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/reviews/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis_id: id, verdict, summary, comments: pendingComments }),
      })
      if (response.ok) {
        setPendingComments([])
        setShowSubmitDialog(false)
        const res = await fetch(`/api/reviews/comments?analysis_id=${id}`)
        if (res.ok) { const data = await res.json(); setExistingComments(data.comments || []) }
      }
    } catch (error) {
      console.error("Failed to submit review:", error)
    } finally { setIsSubmitting(false) }
  }

  const handleResolveComment = async (commentId: string) => {
    try {
      const response = await fetch(`/api/reviews/comments/${commentId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      })
      if (response.ok) setExistingComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, status: "resolved" } : c)))
    } catch (error) { console.error("Failed to resolve comment:", error) }
  }

  const handleUnresolveComment = async (commentId: string) => {
    try {
      const response = await fetch(`/api/reviews/comments/${commentId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      })
      if (response.ok) setExistingComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, status: "open" } : c)))
    } catch (error) { console.error("Failed to unresolve comment:", error) }
  }

  const handleReplyToComment = async (parentId: string, content: string) => {
    if (!id) return
    const parentComment = existingComments.find((c) => c.id === parentId)
    if (!parentComment) return
    try {
      const response = await fetch(`/api/reviews/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis_id: id, parent_id: parentId, file_path: parentComment.file_path, line_start: parentComment.line_start, content, comment_type: "comment" }),
      })
      if (response.ok) { const newComment = await response.json(); setExistingComments((prev) => [...prev, newComment]) }
    } catch (error) { console.error("Failed to reply to comment:", error) }
  }

  const handleClarificationCommentCreated = useCallback((comment: ReviewComment) => {
    setExistingComments((prev) => [...prev, comment])
  }, [])

  const handleEditorSaved = useCallback(() => {
    if (!selectedFilePath) return
    setGithubActionMessage({ type: "success", text: `Committed ${selectedFilePath} to ${activeBranch}.` })
  }, [selectedFilePath, activeBranch])

  const handleToolbarSave = useCallback(() => {
    if (!repoCoordinates) { setGithubActionMessage({ type: "error", text: "Repository information is missing (owner/repo)." }); return }
    if (!selectedFilePath) { setGithubActionMessage({ type: "error", text: "Select a file before saving." }); return }
    if (viewMode === "split") {
      setViewMode("edit")
      window.setTimeout(() => setEditorSaveTrigger((value) => value + 1), 0)
      return
    }
    setEditorSaveTrigger((value) => value + 1)
  }, [repoCoordinates, selectedFilePath, viewMode])

  const submitGitHubReview = useCallback(
    async (event: "APPROVE" | "REQUEST_CHANGES") => {
      if (!analysis?.prNumber) { setGithubActionMessage({ type: "error", text: "This analysis is not linked to a pull request." }); return }
      if (!repoCoordinates) { setGithubActionMessage({ type: "error", text: "Repository information is missing (owner/repo)." }); return }
      setIsSubmittingGitHubReview(true)
      setGithubActionMessage({ type: "info", text: event === "APPROVE" ? "Submitting GitHub approval..." : "Submitting GitHub change request..." })
      try {
        const response = await fetch("/api/dashboard/github", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_pr_review",
            payload: { owner: repoCoordinates.owner, repo: repoCoordinates.repo, pullNumber: analysis.prNumber, event,             body: event === "APPROVE" ? "Approved from Devora." : "Changes requested from Devora." },
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to submit GitHub review")
        setGithubActionMessage({ type: "success", text: event === "APPROVE" ? `PR #${analysis.prNumber} approved on GitHub.` : `Changes requested on PR #${analysis.prNumber}.` })
      } catch (error) {
        console.error("Failed to submit GitHub review:", error)
        setGithubActionMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to submit GitHub review" })
      } finally { setIsSubmittingGitHubReview(false) }
    },
    [analysis?.prNumber, repoCoordinates],
  )

  // ── render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-xl border"
        style={{ background: "linear-gradient(135deg, #0a0f1e 0%, #0d1117 100%)", borderColor: "#1e293b" }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="h-7 w-7" style={{ color: "#6366f1" }} />
        </motion.div>
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Chargement de l'analyse...
        </motion.span>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border" style={{ background: "#0d1117", borderColor: "#1e293b" }}>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>Analyse non trouvée</span>
      </div>
    )
  }

  const qualityScore = calculateQualityScore(analysis.findings)
  const scoreColor = getScoreColor(qualityScore)
  const scoreGlow = getScoreGlow(qualityScore)
  const errorCount = analysis.findings.filter((f) => f.severity === "BLOCKER").length
  const warningCount = analysis.findings.filter((f) => f.severity === "WARN").length
  const totalAdditions = analysis.files.reduce((s, f) => s + (f.additionsCount ?? 0), 0)
  const totalDeletions = analysis.files.reduce((s, f) => s + (f.deletionsCount ?? 0), 0)
  const prBranch = branchLoading ? "resolving..." : activeBranch
  const selectedFileInfo = selectedFilePath ? getFileInfo(selectedFilePath) : null
  const coverage = Math.max(52, 96 - errorCount * 6 - warningCount * 2)
  const complexity = fileFindings.length > 16 ? "High" : fileFindings.length > 8 ? "Medium" : "Low"
  const openThreadCount = existingComments.filter((c) => !c.parent_id && c.status !== "resolved").length
  const tabFiles = (() => {
    if (analysis.files.length <= 3) return analysis.files
    const active = analysis.files.find((f) => f.pathNew === selectedFilePath)
    const picked: DashboardAnalysisDiffFile[] = []
    if (active) picked.push(active)
    for (const file of analysis.files) {
      if (picked.some((e) => e.id === file.id)) continue
      picked.push(file)
      if (picked.length >= 3) break
    }
    return picked
  })()
  const isEditorVisible = viewMode === "edit" || viewMode === "split"
  const splitRows = (() => {
    type DiffLineModel = DashboardAnalysisDiffFile["lines"][number]
    const rows: Array<{ key: string; left?: DiffLineModel; right?: DiffLineModel; changed: boolean }> = []
    const lines = selectedFile?.lines ?? []

    for (let index = 0; index < lines.length;) {
      const line = lines[index]

      if (!line || line.lineType === "header") {
        index += 1
        continue
      }

      if (line.lineType === "context") {
        rows.push({ key: `context-${index}`, left: line, right: line, changed: false })
        index += 1
        continue
      }

      const removed: DiffLineModel[] = []
      const added: DiffLineModel[] = []

      while (lines[index]?.lineType === "remove") {
        removed.push(lines[index])
        index += 1
      }

      while (lines[index]?.lineType === "add") {
        added.push(lines[index])
        index += 1
      }

      const maxRows = Math.max(removed.length, added.length)
      for (let changeIndex = 0; changeIndex < maxRows; changeIndex += 1) {
        rows.push({
          key: `change-${index}-${changeIndex}`,
          left: removed[changeIndex],
          right: added[changeIndex],
          changed: true,
        })
      }
    }

    return rows
  })()

  const renderSplitCodeCell = (
    line: DashboardAnalysisDiffFile["lines"][number] | undefined,
    side: "left" | "right",
    rowIndex: number,
  ) => {
    const isRemove = side === "left" && line?.lineType === "remove"
    const isAdd = side === "right" && line?.lineType === "add"
    const lineNumber = side === "left" ? line?.oldLineNo : line?.newLineNo
    const background = isRemove
      ? "rgba(254,226,226,0.88)"
      : isAdd
      ? "rgba(220,252,231,0.86)"
      : rowIndex % 2 === 0
      ? "#ffffff"
      : "#fbfcff"
    const contentColor = isRemove ? "#b91c1c" : isAdd ? "#166534" : "#1f2937"

    return (
      <div
        className="flex min-w-0 items-center border-b"
        style={{
          minHeight: 22,
          background,
          borderColor: "#edf1f7",
          boxShadow: isRemove
            ? "inset 3px 0 0 rgba(239,68,68,0.45)"
            : isAdd
            ? "inset 3px 0 0 rgba(34,197,94,0.45)"
            : "none",
        }}
      >
        <span
          className="w-9 flex-shrink-0 select-none pr-2 text-right"
          style={{
            color: line ? "#64748b" : "#cbd5e1",
            fontSize: 11,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          }}
        >
          {lineNumber ?? ""}
        </span>
        <code
          className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-pre px-2"
          style={{
            color: contentColor,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontWeight: isRemove || isAdd ? 600 : 500,
          }}
        >
          {line?.content ?? ""}
        </code>
      </div>
    )
  }

  const renderSplitReviewPanel = () => {
    const finding = selectedFinding ?? fileFindings.find((item) => !dismissedFindings.has(item.id))
    if (!finding) return null

    const findingLineLabel = finding.lineStart != null
      ? `ligne ${finding.lineStart}${finding.lineEnd != null ? `-${finding.lineEnd}` : ""}`
      : "ligne"

    return (
      <div
        className="flex-shrink-0 border-t bg-white px-4 py-3"
        style={{ borderColor: "#dbe3ef", boxShadow: "0 -8px 20px rgba(15,23,42,0.04)" }}
      >
        <div className="rounded-md border bg-white" style={{ borderColor: "#b9d2ff" }}>
          <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "#dbeafe" }}>
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: "#fef3c7", color: "#ca8a04", border: "1px solid #fde68a" }}
            >
              AI
            </span>
            <span className="text-[12px] font-bold" style={{ color: "#1e293b" }}>RAG Reviewer</span>
            <span className="text-[11px]" style={{ color: "#64748b" }}>{findingLineLabel}</span>
            <span className="text-[11px]" style={{ color: "#64748b" }}>·</span>
            <span className="text-[11px]" style={{ color: "#f97316" }}>{finding.severity === "BLOCKER" ? "blocker" : "warning"}</span>
            {finding.ruleId && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ color: "#b45309", background: "#fef3c7", border: "1px solid #fde68a" }}
              >
                {finding.ruleId}
              </span>
            )}
          </div>
          <div className="px-3 py-2">
            <p className="text-[12px] leading-relaxed" style={{ color: "#334155" }}>
              {finding.message}
              {finding.suggestion && <span style={{ color: "#2563eb" }}> — {finding.suggestion}</span>}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                className="inline-flex h-7 items-center gap-1 rounded border px-3 text-[11px] font-semibold"
                style={{ color: "#2563eb", background: "#eff6ff", borderColor: "#bfdbfe" }}
              >
                Appliquer correction
              </button>
              <button
                className="inline-flex h-7 items-center gap-1 rounded border px-3 text-[11px] font-semibold"
                style={{ color: "#475569", background: "#ffffff", borderColor: "#d8e0ec" }}
                onClick={() => finding.lineStart != null && setActiveCommentLine(finding.lineStart)}
              >
                Commenter
              </button>
              <button
                className="inline-flex h-7 items-center gap-1 rounded border px-3 text-[11px] font-semibold"
                style={{ color: "#2563eb", background: "#eff6ff", borderColor: "#bfdbfe" }}
                onClick={() => setClarificationTarget(finding)}
              >
                <PhoneCall className="h-3 w-3" />
                Appel
              </button>
              <button
                className="inline-flex h-7 items-center gap-1 rounded border px-3 text-[11px] font-semibold"
                style={{ color: "#64748b", background: "#ffffff", borderColor: "#d8e0ec" }}
                onClick={() => setDismissedFindings((prev) => new Set([...prev, finding.id]))}
              >
                Ignorer
              </button>
            </div>
          </div>
          <div className="border-t px-3 py-2" style={{ borderColor: "#dbeafe", background: "#fbfdff" }}>
            <div className="mb-1.5 flex items-center gap-2">
              <MessageSquarePlus className="h-3.5 w-3.5" style={{ color: "#2563eb" }} />
              <span className="text-[11px] font-semibold" style={{ color: "#1e293b" }}>Ajouter un commentaire</span>
              <span className="text-[10px]" style={{ color: "#64748b" }}>{findingLineLabel}</span>
            </div>
            <div
              className="rounded border px-3 py-2 text-[12px]"
              style={{ minHeight: 48, color: "#94a3b8", background: "#ffffff", borderColor: "#cbd5e1" }}
            >
              Ecrivez un commentaire...
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderSplitComparisonPane = () => (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-white">
      <div className="grid flex-shrink-0 grid-cols-2 border-b" style={{ borderColor: "#dbe3ef", background: "#f8fafc" }}>
        <div className="border-r px-4 py-2 text-[12px] font-semibold" style={{ color: "#64748b", borderColor: "#dbe3ef" }}>
          Ancienne version ({activeBranch || "main"})
        </div>
        <div className="px-4 py-2 text-[12px] font-semibold" style={{ color: "#64748b" }}>
          Nouvelle version (branche)
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {!selectedFile || splitRows.length === 0 ? (
          <div className="p-8 text-[13px]" style={{ color: "#64748b" }}>
            No detailed diff is available for this file.
          </div>
        ) : (
          <div className="min-w-[900px]">
            {splitRows.map((row, index) => (
              <div key={row.key} className="grid grid-cols-2">
                <div className="min-w-0 border-r" style={{ borderColor: "#dbe3ef" }}>
                  {renderSplitCodeCell(row.left, "left", index)}
                </div>
                <div className="min-w-0">
                  {renderSplitCodeCell(row.right, "right", index)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {renderSplitReviewPanel()}
    </div>
  )

  const renderEditorPane = () => (
    <div className="h-full min-w-0 flex-1">
      {!repoCoordinates ? (
        <div className="p-8 text-[13px] flex items-center gap-3" style={{ color: "#f87171" }}>
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          Cannot open editor: repository format is invalid.
        </div>
      ) : (
        <EnhancedFuturisticDiffEditor
          owner={repoCoordinates.owner}
          repo={repoCoordinates.repo}
          branch={activeBranch}
          filePath={selectedFilePath}
          onSaved={handleEditorSaved}
          saveTrigger={editorSaveTrigger}
          onBranchResolved={setActiveBranch}
          originalContent={selectedFile?.lines?.map(l => l.content).join('\n') || ""}
          modifiedContent={selectedFile?.lines?.filter((l) => l.lineType !== "remove").map((l) => l.content).join('\n') || ""}
          findingId={selectedFinding?.id}
          findingDescription={selectedFinding?.message}
          diffMode="side-by-side"
          collaborativeMode={true}
          showMinimap={viewMode !== "split"}
          showLineNumbers={true}
          fontSize={viewMode === "split" ? 13 : 14}
          compact={true}
        />
      )}
    </div>
  )

  const renderDiffPane = (showMarkers = true) => (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden">
      <div className="min-w-0 flex-1 overflow-auto" style={{ background: "var(--bg-page)" }}>
        {!selectedFile || selectedFile.lines.length === 0 ? (
          <div className="p-8 text-[13px]" style={{ color: "var(--text-subtle)" }}>
            No detailed diff is available for this file.
          </div>
        ) : (
          <div className="py-1">
            {selectedFile.lines.map((line, idx) => {
              const lineNumber = line.newLineNo ?? line.oldLineNo ?? idx + 1
              return (
                <div key={`${selectedFile.id}-${idx}`}>
                  <DiffLine
                    line={line}
                    lineNumber={lineNumber}
                    findings={fileFindings}
                    dismissedFindings={dismissedFindings}
                    onDismiss={(fid) => setDismissedFindings((prev) => new Set([...prev, fid]))}
                    onComment={(targetLine) => setActiveCommentLine((prev) => (prev === targetLine ? null : targetLine))}
                    onRequestCall={(finding) => setClarificationTarget(finding)}
                    isCommenting={activeCommentLine === lineNumber}
                  />
                  {commentsByLine.get(lineNumber)?.map((comment) => (
                    <div key={comment.id} className="mx-4 my-2">
                      <CommentThread
                        rootComment={comment}
                        replies={getReplies(comment.id)}
                        authors={commentAuthors}
                        currentUserId={currentUser.id}
                        onReply={handleReplyToComment}
                        onResolve={handleResolveComment}
                        onUnresolve={handleUnresolveComment}
                      />
                    </div>
                  ))}
                  <AnimatePresence>
                    {activeCommentLine === lineNumber && (
                      <InlineCommentForm
                        analysisId={id!}
                        filePath={selectedFilePath!}
                        lineStart={lineNumber}
                        codeSnippet={line.content}
                        onSubmit={handleAddPendingComment}
                        onCancel={() => setActiveCommentLine(null)}
                      />
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showMarkers && (
        <div
          className="w-[70px] flex-shrink-0 overflow-hidden border-l px-1.5 pt-3"
          style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}
        >
          <div
            className="mb-2.5 h-12 rounded-md"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}
          />
          {fileFindings.slice(0, 14).map((finding, index) => {
            const color = finding.severity === "BLOCKER"
              ? "rgba(248,113,113,0.7)"
              : finding.severity === "WARN"
              ? "rgba(251,191,36,0.7)"
              : "rgba(99,102,241,0.7)"
            const width = 20 + (((finding.lineStart ?? index + 1) * 17) % 30)
            return (
              <motion.div
                key={finding.id}
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: index * 0.06, duration: 0.3 }}
                className="mb-[5px] rounded-full origin-left"
                style={{ height: 3, width: `${width}px`, background: color }}
              />
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden"
      style={{
        background: "var(--bg-page)",
        color: "var(--text-primary)",
        fontFamily: "Inter, system-ui, sans-serif",
        borderRadius: 12,
        border: "1px solid var(--border-card)",
        boxShadow: "var(--shadow-elevated)",
      }}
    >
      {/* ── Top Menu Bar ─────────────────────────────────────────────── */}
      <div
        className="flex h-9 flex-shrink-0 items-center border-b px-3 select-none"
        style={{
          background: "var(--bg-card-inner)",
          borderColor: "var(--border-card)",
        }}
      >
        {/* Traffic lights */}
        <div className="mr-6 flex items-center gap-[7px]">
          <Link href="/dashboard">
            <div
              className="h-3 w-3 cursor-pointer rounded-full transition-all hover:brightness-110"
              style={{ background: "#ff5f57", boxShadow: "0 0 6px rgba(255,95,87,0.4)" }}
            />
          </Link>
          <div className="h-3 w-3 rounded-full" style={{ background: "#febc2e" }} />
          <div className="h-3 w-3 rounded-full" style={{ background: "#28c840" }} />
        </div>
        {/* Menu items */}
        {["File", "Edit", "Selection", "View", "Go", "Run", "Terminal"].map((item) => (
          <span
            key={item}
            className="mr-4 cursor-pointer text-[11.5px] transition-colors hover:text-white"
            style={{ color: "var(--text-muted)" }}
          >
            {item}
          </span>
        ))}
        <span
          className="mr-4 cursor-pointer text-[11.5px] font-semibold"
          style={{ color: "#818cf8", textShadow: "0 0 10px rgba(129,140,248,0.4)" }}
        >
          Review
        </span>
        <span className="cursor-pointer text-[11.5px] transition-colors hover:text-white" style={{ color: "var(--text-muted)" }}>
          Help
        </span>
        {/* Branch pill */}
        <div
          className="ml-auto flex items-center gap-2 px-3 py-1"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
          }}
        >
          <GitPullRequest className="h-3.5 w-3.5" style={{ color: "#818cf8" }} />
          <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
            {prBranch}
          </span>
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.6)" }} />
          <span className="text-[11px] font-bold" style={{ color: "#22c55e" }}>
            Open
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Activity Bar ─────────────────────────────────────────────── */}
        <div
          className="flex w-12 flex-shrink-0 flex-col items-center border-r py-2 gap-1"
          style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}
        >
          <button
            className="flex h-9 w-9 items-center justify-center transition-all"
            style={{
              background: "rgba(99,102,241,0.15)",
              color: "#818cf8",
              borderRadius: 8,
              border: "1px solid rgba(99,102,241,0.25)",
              boxShadow: "0 0 10px rgba(99,102,241,0.2)",
            }}
            title="Explorer"
          >
            <Files className="h-4.5 w-4.5" />
          </button>
          {[
            { icon: Search, label: "Search", color: "#60a5fa" },
            { icon: GitBranch, label: "Source control", color: "#a78bfa" },
            { icon: Shield, label: "Security", color: "#f87171" },
            { icon: Settings, label: "Settings", color: "#94a3b8" },
          ].map((entry) => (
            <button
              key={entry.label}
              className="flex h-9 w-9 items-center justify-center transition-all hover:bg-white/5"
              style={{ color: "#475569", borderRadius: 8 }}
              title={entry.label}
              onMouseEnter={(e) => { e.currentTarget.style.color = entry.color }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#475569" }}
            >
              <entry.icon className="h-4.5 w-4.5" />
            </button>
          ))}
        </div>

        {/* ── Left Sidebar: Explorer ───────────────────────────────────── */}
        <aside
          className="hidden w-[240px] flex-shrink-0 flex-col border-r md:flex"
          style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}
        >
          {/* Section: Explorer */}
          <div
            className="flex items-center justify-between border-b px-3 py-2.5"
            style={{ borderColor: "var(--border-card)" }}
          >
            <span className="text-[9.5px] font-bold tracking-[0.12em] uppercase" style={{ color: "var(--text-muted)" }}>
              Explorer
            </span>
            <Search className="h-3.5 w-3.5 cursor-pointer transition-colors hover:text-white" style={{ color: "var(--text-muted)" }} />
          </div>

          {/* Changed Files */}
          <div className="border-b px-3 py-1.5" style={{ borderColor: "var(--border-card)" }}>
            <span className="text-[9px] font-bold tracking-[0.1em] uppercase" style={{ color: "var(--text-subtle)" }}>
              Changed Files
            </span>
          </div>
          <div className="max-h-[42%] overflow-y-auto">
            {analysis.files.map((file, i) => {
              const info = getFileInfo(file.pathNew)
              const isActive = selectedFilePath === file.pathNew
              const hasAdd = (file.additionsCount ?? 0) > 0
              const hasDel = (file.deletionsCount ?? 0) > 0
              const statusChar = hasAdd && hasDel ? "M" : hasAdd ? "A" : hasDel ? "D" : "M"
              const statusColor = statusChar === "A" ? "#22c55e" : statusChar === "D" ? "#f87171" : "#f59e0b"
              return (
                <motion.button
                  key={file.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.2 }}
                  onClick={() => setSelectedFilePath(file.pathNew)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-all"
                  style={{
                    background: isActive
                      ? "linear-gradient(90deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.05) 100%)"
                      : "transparent",
                    borderLeft: isActive ? "2px solid #6366f1" : "2px solid transparent",
                  }}
                >
                  <ExtBadge ext={info.ext} color={info.extColor} />
                  <span
                    className="flex-1 truncate text-[11px] font-medium"
                    style={{ color: isActive ? "#e2e8f0" : "#64748b" }}
                  >
                    {info.filename}
                  </span>
                  <span
                    className="text-[9px] font-bold flex-shrink-0"
                    style={{ color: statusColor }}
                  >
                    {statusChar}
                  </span>
                </motion.button>
              )
            })}
          </div>

          {/* Outline */}
          <div className="border-y px-3 py-1.5" style={{ borderColor: "var(--border-card)" }}>
            <span className="text-[9px] font-bold tracking-[0.1em] uppercase" style={{ color: "var(--text-subtle)" }}>
              Outline
            </span>
          </div>
          <div className="space-y-0.5 px-3 py-2 overflow-y-auto flex-1">
            {fileFindings.slice(0, 5).map((finding, i) => (
              <motion.div
                key={finding.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="flex items-center gap-2 py-0.5"
              >
                <div
                  className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{
                    background: finding.severity === "BLOCKER" ? "#f87171" : "#f59e0b",
                    boxShadow: `0 0 5px ${finding.severity === "BLOCKER" ? "rgba(248,113,113,0.6)" : "rgba(245,158,11,0.6)"}`,
                  }}
                />
                <span className="truncate text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                  {finding.ruleId ?? finding.category}
                </span>
              </motion.div>
            ))}
            {fileFindings.length === 0 && (
              <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
                No indexed symbols
              </span>
            )}
          </div>

          {/* Git Blame footer */}
          <div className="border-t px-3 py-2.5" style={{ borderColor: "var(--border-card)" }}>
            <div className="text-[9px] font-bold tracking-[0.1em] uppercase mb-1" style={{ color: "var(--text-subtle)" }}>
              Git Blame
            </div>
            <div className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              {currentUser.name ?? "Developer"}
            </div>
            <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
              {analysis.commitSha ? analysis.commitSha.slice(0, 7) : "latest commit"}
            </div>
          </div>
        </aside>

        {/* ── Main Editor Area ─────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col" style={{ background: "var(--bg-page)" }}>

            {/* File Tabs */}
            <div
              className="flex h-10 items-end overflow-x-auto border-b flex-shrink-0"
              style={{ background: "var(--bg-card-inner)", borderColor: "var(--border-card)" }}
            >
              {tabFiles.map((file) => {
                const info = getFileInfo(file.pathNew)
                const isActive = selectedFilePath === file.pathNew
                const changedCount = (file.additionsCount ?? 0) + (file.deletionsCount ?? 0)
                return (
                  <button
                    key={file.id}
                    onClick={() => setSelectedFilePath(file.pathNew)}
                    className="relative flex h-full min-w-[160px] max-w-[200px] items-center gap-2 border-r px-3 transition-all group/tab"
                    style={{
                      background: isActive ? "var(--bg-page)" : "transparent",
                      borderColor: "var(--border-card)",
                    }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-x-0 top-0 h-0.5"
                        style={{ background: "linear-gradient(90deg, #f97316, #fb923c)" }}
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <ExtBadge ext={info.ext} color={info.extColor} />
                    <span
                      className="flex-1 truncate text-left text-[11.5px] font-medium"
                      style={{ color: isActive ? "#0f172a" : "#64748b" }}
                    >
                      {info.filename}
                    </span>
                    {changedCount > 0 && (
                      <span
                        className="text-[9px] font-bold px-1 py-0.5 rounded"
                        style={{
                          color: "#f59e0b",
                          background: "rgba(245,158,11,0.1)",
                        }}
                      >
                        {changedCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Breadcrumb + Toolbar */}
            <div
              className="flex h-9 items-center border-b px-3 gap-2 flex-shrink-0"
              style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}
            >
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 overflow-hidden text-[10.5px] flex-1" style={{ color: "var(--text-muted)" }}>
                <FileCode2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#6366f1" }} />
                <div className="truncate flex items-center gap-0.5">
                  {selectedFilePath?.split("/").map((part, index, arr) => (
                    <span key={`${part}-${index}`} className="flex items-center gap-0.5">
                      <span style={{ color: index === arr.length - 1 ? "#93c5fd" : "#334155" }}>{part}</span>
                      {index < arr.length - 1 && <ChevronRight className="h-2.5 w-2.5 flex-shrink-0" style={{ color: "#1e293b" }} />}
                    </span>
                  ))}
                </div>
              </div>
              {/* Toolbar buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {[
                  { label: "Split", icon: SplitSquareHorizontal, action: () => setViewMode("split"), active: viewMode === "split", tone: "#f97316" },
                  { label: "Diff", icon: FileDiff, action: () => setViewMode("diff"), active: viewMode === "diff", tone: "#2563eb" },
                  { label: "Editeur", icon: Eye, action: () => setViewMode("edit"), active: viewMode === "edit", tone: "#64748b" },
                ].map((btn) => {
                  const activeBackground = btn.label === "Split" ? "#fff7ed" : btn.label === "Diff" ? "#eff6ff" : "#f8fafc"
                  const inactiveBackground = "#ffffff"
                  return (
                    <button
                      key={btn.label}
                      onClick={btn.action}
                      className="flex h-7 items-center gap-1 rounded-md border px-3 text-[11px] font-semibold transition-all"
                      style={{
                        background: btn.active ? activeBackground : inactiveBackground,
                        color: btn.active ? btn.tone : "#475569",
                        borderColor: btn.active ? btn.tone : "#d8e0ec",
                        boxShadow: btn.active ? `0 0 0 2px ${btn.tone}12` : "none",
                      }}
                    >
                      <btn.icon className="h-3.5 w-3.5" />
                      {btn.label}
                    </button>
                  )
                })}
                <button
                  onClick={handleToolbarSave}
                  disabled={!isEditorVisible || !selectedFilePath || !repoCoordinates || branchLoading}
                  className="flex h-7 items-center gap-1 rounded-md border px-3 text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: "#ecfdf5",
                    color: "#16a34a",
                    borderColor: "#86efac",
                  }}
                >
                  <Save className="h-3.5 w-3.5" />
                  Enregistrer
                </button>
                <button
                  className="flex h-7 items-center gap-1 rounded-md border px-3 text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => submitGitHubReview("APPROVE")}
                  disabled={!analysis.prNumber || isSubmittingGitHubReview}
                  style={{
                    background: "#ffffff",
                    color: "#f97316",
                    borderColor: "#fdba74",
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approuver
                </button>
              </div>
            </div>

            {/* Editor / Diff Content */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                {viewMode === "split" ? (
                  <motion.div
                    key="split"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex min-w-0 flex-1 overflow-hidden"
                  >
                    {renderSplitComparisonPane()}
                  </motion.div>
                ) : viewMode === "edit" ? (
                  <motion.div
                    key="edit"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="min-w-0 flex-1"
                  >
                    {renderEditorPane()}
                  </motion.div>
                ) : (
                  <motion.div
                    key="diff"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex min-w-0 flex-1 overflow-hidden"
                  >
                    {renderDiffPane(true)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Right Panel: Quality & Actions ───────────────────────── */}
          <aside
            className="hidden w-[270px] flex-shrink-0 flex-col overflow-y-auto border-l lg:flex"
            style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}
          >
            <div className="p-4">
              {/* Code Quality Header */}
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5" style={{ color: "#6366f1" }} />
                <span className="text-[9.5px] font-bold tracking-[0.12em] uppercase" style={{ color: "var(--text-subtle)" }}>
                  Code Quality
                </span>
              </div>

              {/* Score Ring */}
              <div className="flex items-center gap-3 mb-4">
                <div style={{ filter: scoreGlow }}>
                  <ScoreRing score={qualityScore} color={scoreColor} />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>Overall score</div>
                  {[
                    { label: "Errors", value: String(errorCount), color: errorCount > 0 ? "#f87171" : "#22c55e" },
                    { label: "Warnings", value: String(warningCount), color: warningCount > 0 ? "#f59e0b" : "#22c55e" },
                    { label: "Complexity", value: complexity, color: complexity === "High" ? "#f87171" : complexity === "Medium" ? "#f59e0b" : "#22c55e" },
                    { label: "Coverage", value: `${coverage}%`, color: "#22c55e" },
                  ].map((metric) => (
                    <div key={metric.label} className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{metric.label}</span>
                      <span className="text-[10px] font-bold" style={{ color: metric.color }}>{metric.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="mb-3 h-px" style={{ background: "linear-gradient(90deg, transparent, #1e293b, transparent)" }} />

              {/* RAG Issues */}
              <div className="mb-2 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />
                <span className="text-[9.5px] font-bold tracking-[0.12em] uppercase" style={{ color: "var(--text-subtle)" }}>
                  RAG Issues
                </span>
                {fileFindings.length > 0 && (
                  <span
                    className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}
                  >
                    {fileFindings.length}
                  </span>
                )}
              </div>
              <div className="space-y-1.5 mb-3">
                {fileFindings.slice(0, 5).map((finding, i) => (
                  <motion.div
                    key={finding.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07, duration: 0.2 }}
                    className="flex items-start gap-2 p-2 rounded-lg"
                    style={{
                      background: finding.severity === "BLOCKER"
                        ? "rgba(248,113,113,0.06)"
                        : "rgba(245,158,11,0.06)",
                      border: `1px solid ${finding.severity === "BLOCKER" ? "rgba(248,113,113,0.15)" : "rgba(245,158,11,0.12)"}`,
                    }}
                  >
                    <AlertTriangle
                      className="mt-0.5 h-3 w-3 flex-shrink-0"
                      style={{ color: finding.severity === "BLOCKER" ? "#f87171" : "#f59e0b" }}
                    />
                    <span className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {finding.message.length > 44 ? `${finding.message.slice(0, 44)}...` : finding.message}
                      {finding.lineStart != null && (
                        <span style={{ color: "var(--text-subtle)" }}>{` l.${finding.lineStart}`}</span>
                      )}
                    </span>
                  </motion.div>
                ))}
                {fileFindings.length === 0 && (
                  <div className="flex items-center gap-2 py-2">
                    <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
                    <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>No open findings.</span>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="mb-3 h-px" style={{ background: "linear-gradient(90deg, transparent, #1e293b, transparent)" }} />

              {/* PR Info */}
              <div className="mb-2 flex items-center gap-2">
                <GitPullRequest className="h-3.5 w-3.5" style={{ color: "#818cf8" }} />
                <span className="text-[9.5px] font-bold tracking-[0.12em] uppercase" style={{ color: "var(--text-subtle)" }}>
                  PR Info
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {[
                  { label: "+lines", value: `+${totalAdditions}`, color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
                  { label: "-lines", value: `-${totalDeletions}`, color: "#f87171", bg: "rgba(248,113,113,0.08)" },
                  { label: "Files", value: String(analysis.files.length), color: "#818cf8", bg: "rgba(99,102,241,0.08)" },
                  { label: "Threads", value: String(openThreadCount), color: "#c084fc", bg: "rgba(192,132,252,0.08)" },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="flex flex-col gap-0.5 rounded-lg p-2"
                    style={{ background: metric.bg, border: `1px solid ${metric.color}20` }}
                  >
                    <span className="text-[9px]" style={{ color: "var(--text-subtle)" }}>{metric.label}</span>
                    <span className="text-[13px] font-bold" style={{ color: metric.color }}>{metric.value}</span>
                  </div>
                ))}
              </div>

              {/* Branch Info */}
              <div
                className="mb-3 rounded-lg px-3 py-2"
                style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-card)" }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <GitBranch className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
                  <span className="text-[9px] font-bold" style={{ color: "var(--text-subtle)" }}>Branch</span>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: "#93c5fd" }}>{prBranch}</span>
                {repoCoordinates ? (
                  <div className="text-[9px] mt-0.5" style={{ color: "var(--text-subtle)" }}>
                    {repoCoordinates.owner}/{repoCoordinates.repo}
                  </div>
                ) : (
                  <div className="text-[9px] mt-0.5" style={{ color: "#f87171" }}>invalid repository</div>
                )}
              </div>

              {/* Action message */}
              <AnimatePresence>
                {githubActionMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mb-3 rounded-lg px-3 py-2 flex items-start gap-2"
                    style={{
                      background: githubActionMessage.type === "error"
                        ? "rgba(248,113,113,0.08)"
                        : githubActionMessage.type === "success"
                        ? "rgba(34,197,94,0.08)"
                        : "rgba(96,165,250,0.08)",
                      border: `1px solid ${githubActionMessage.type === "error" ? "rgba(248,113,113,0.25)" : githubActionMessage.type === "success" ? "rgba(34,197,94,0.25)" : "rgba(96,165,250,0.25)"}`,
                    }}
                  >
                    <div
                      className="h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1"
                      style={{
                        background: githubActionMessage.type === "error" ? "#f87171" : githubActionMessage.type === "success" ? "#22c55e" : "#60a5fa",
                      }}
                    />
                    <span
                      className="text-[10px] leading-relaxed"
                      style={{
                        color: githubActionMessage.type === "error" ? "#fca5a5" : githubActionMessage.type === "success" ? "#86efac" : "#93c5fd",
                      }}
                    >
                      {githubActionMessage.text}
                    </span>
                    <button
                      onClick={() => setGithubActionMessage(null)}
                      className="ml-auto flex-shrink-0 opacity-60 hover:opacity-100"
                    >
                      <X className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleToolbarSave}
                  disabled={!isEditorVisible || !selectedFilePath || !repoCoordinates || branchLoading}
                  className="flex h-9 w-full items-center justify-center gap-2 text-[12px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    borderRadius: 8,
                    background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                    color: "#dcfce7",
                    boxShadow: "0 0 16px rgba(34,197,94,0.25), 0 2px 4px rgba(0,0,0,0.3)",
                    border: "1px solid rgba(34,197,94,0.3)",
                  }}
                >
                  <Save className="h-3.5 w-3.5" />
                  Save changes
                </motion.button>

                {canReview && (
                  <>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => void submitGitHubReview("APPROVE")}
                      disabled={isSubmittingGitHubReview || !analysis.prNumber || !repoCoordinates}
                      className="flex h-9 w-full items-center justify-center gap-2 text-[12px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        borderRadius: 8,
                        background: "linear-gradient(135deg, #4338ca 0%, #3730a3 100%)",
                        color: "#e0e7ff",
                        boxShadow: "0 0 16px rgba(99,102,241,0.25), 0 2px 4px rgba(0,0,0,0.3)",
                        border: "1px solid rgba(99,102,241,0.3)",
                      }}
                    >
                      {isSubmittingGitHubReview ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Approve PR
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => void submitGitHubReview("REQUEST_CHANGES")}
                      disabled={isSubmittingGitHubReview || !analysis.prNumber || !repoCoordinates}
                      className="flex h-9 w-full items-center justify-center gap-2 text-[12px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.04)",
                        color: "#94a3b8",
                        border: "1px solid #1e293b",
                      }}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Request changes
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowSubmitDialog(true)}
                      className="flex h-8 w-full items-center justify-center gap-2 text-[11px] font-medium transition-all"
                      style={{
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.02)",
                        color: "#475569",
                        border: "1px solid #1e293b",
                      }}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      Internal review notes
                    </motion.button>
                  </>
                )}

                {/* Navigation links */}
                <div className="mt-1 flex flex-col gap-1.5">
                  <Link
                    href={`/dashboard/report/${id}`}
                    className="rounded-lg px-3 py-1.5 text-center text-[10.5px] font-medium transition-all hover:brightness-125"
                    style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.15)" }}
                  >
                    Open full report
                  </Link>
                  <Link
                    href={`/dashboard/history/${id}`}
                    className="rounded-lg px-3 py-1.5 text-center text-[10.5px] transition-all hover:brightness-125"
                    style={{ background: "rgba(255,255,255,0.03)", color: "#475569", border: "1px solid #1e293b" }}
                  >
                    View history
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ── Status Bar ───────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center gap-3 border-t px-3"
        style={{
          height: 26,
          background: "var(--bg-card-inner)",
          borderColor: "var(--border-card)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "#22c55e", boxShadow: "0 0 5px rgba(34,197,94,0.6)" }}
          />
          <span className="text-[10px] font-medium" style={{ color: "#22c55e" }}>
            RAG connected
          </span>
        </div>
        <span style={{ color: "#1e293b" }}>│</span>
        <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
          {selectedFileInfo?.ext === "TS" || selectedFileInfo?.ext === "TX"
            ? "TypeScript 5.4"
            : selectedFileInfo?.ext === "PY"
            ? "Python 3.11"
            : selectedFileInfo?.filename?.split(".").pop() ?? "Text"}
        </span>
        <span style={{ color: "#1e293b" }}>│</span>
        <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>UTF-8 LF</span>
        <span style={{ color: "#1e293b" }}>│</span>
        <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>Spaces: 2</span>
        <div className="flex-1" />
        {(errorCount > 0 || warningCount > 0) && (
          <span className="text-[10px] font-semibold" style={{ color: "#f59e0b" }}>
            {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? "s" : ""}` : ""}
            {errorCount > 0 && warningCount > 0 ? " · " : ""}
            {warningCount > 0 ? `${warningCount} warning${warningCount > 1 ? "s" : ""}` : ""}
          </span>
        )}
        <span style={{ color: "#1e293b" }}>│</span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {analysis.prNumber ? `${analysis.prLabel} · ${prBranch}` : prBranch}
        </span>
        <span style={{ color: "#1e293b" }}>│</span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {analysis.commitSha ? analysis.commitSha.slice(0, 7) : "Ln 1, Col 1"}
        </span>
      </div>

      {/* ── Review Dialogs & Overlays ────────────────────────────────── */}
      <AnimatePresence>
        {pendingComments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10"
          >
            <PendingReviewBanner
              pendingComments={pendingComments}
              onFinishReview={() => setShowSubmitDialog(true)}
              onClearAll={handleClearAllPendingComments}
              onRemoveComment={handleRemovePendingComment}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ClarificationCallDialog
        open={clarificationTarget !== null}
        onOpenChange={(open) => { if (!open) setClarificationTarget(null) }}
        analysisId={analysis.id}
        repoName={analysis.repo}
        authorName={analysis.author}
        reviewerName={currentUser.name}
        finding={clarificationTarget}
        onCommentCreated={handleClarificationCommentCreated}
      />

      <ReviewSubmissionDialog
        open={showSubmitDialog}
        onOpenChange={setShowSubmitDialog}
        analysisId={id!}
        pendingComments={pendingComments}
        onSubmit={handleSubmitReview}
        onRemoveComment={handleRemovePendingComment}
        isSubmitting={isSubmitting}
      />
    </motion.div>
  )
}
