"use client"

import { useState, useRef, useMemo, useEffect, useCallback } from "react"
import Link from "next/link"
import { motion, AnimatePresence, useInView } from "framer-motion"
import {
  Download,
  RotateCw,
  Eye,
  GitCompare,
  Trash2,
  Search,
  FileCode,
  GitPullRequest,
  GitCommit,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  deleteDashboardAnalysis,
  fetchDashboardAnalyses,
  hasActiveDashboardAnalysis,
  type DashboardAnalysisItem,
} from "@/lib/dashboard-analyses"
import { cn } from "@/lib/utils"
import { AnalysisPipeline, MiniPipeline } from "./AnalysisPipeline"
import { normalizeAnalysisStatus as normalizeStatus } from "@/lib/domain/analysis-status"

// â”€â”€â”€ STATUS CONFIG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Colors aligned with the platform design tokens (globals.css CSS vars)
const statusConfig = {
  COMPLETED: {
    color: "var(--green-status)",
    label: "Completed",
    bg: "color-mix(in srgb, var(--green-status) 10%, transparent)",
    border: "color-mix(in srgb, var(--green-status) 25%, transparent)",
    darkBg: "color-mix(in srgb, var(--green-status) 15%, transparent)",
  },
  FAILED: {
    color: "hsl(var(--destructive))",
    label: "Failed",
    bg: "hsl(var(--destructive) / 0.08)",
    border: "hsl(var(--destructive) / 0.25)",
    darkBg: "hsl(var(--destructive) / 0.15)",
  },
  RUNNING: {
    color: "#2dd4bf",          // teal-400 — matches platform teal accent
    label: "Running",
    bg: "rgba(45,212,191,0.08)",
    border: "rgba(45,212,191,0.2)",
    darkBg: "rgba(45,212,191,0.15)",
  },
  QUEUED: {
    color: "var(--orange)",
    label: "Queued",
    bg: "color-mix(in srgb, var(--orange) 10%, transparent)",
    border: "color-mix(in srgb, var(--orange) 25%, transparent)",
    darkBg: "color-mix(in srgb, var(--orange) 15%, transparent)",
  },
  RECEIVED: {
    color: "var(--orange)",
    label: "Received",
    bg: "color-mix(in srgb, var(--orange) 8%, transparent)",
    border: "color-mix(in srgb, var(--orange) 20%, transparent)",
    darkBg: "color-mix(in srgb, var(--orange) 12%, transparent)",
  },
}

type StatusKey = keyof typeof statusConfig

function timeAgo(dateStr: string): string {
  if (!dateStr) return "-"
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return "-"

  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function getTimeGroup(dateStr: string): "today" | "yesterday" | "this_week" | "older" {
  if (!dateStr) return "older"
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return "older"

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "today"
  if (diffDays === 1) return "yesterday"
  if (diffDays < 7) return "this_week"
  return "older"
}

function groupLabel(key: string): string {
  return { today: "Today", yesterday: "Yesterday", this_week: "This Week", older: "Older" }[key] || key
}

// â”€â”€â”€ IMPACT SCORE RING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ImpactRing({ score, size = 40, status }: { score: number; size?: number; status: StatusKey }) {
  const c = statusConfig[status]?.color || "#888"
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-muted/20"
          strokeWidth={3}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={c}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, delay: 0.3, ease: "easeOut" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[11px] font-bold font-mono"
        style={{ color: c }}
      >
        {score}
      </span>
    </div>
  )
}

// â”€â”€â”€ STATUS DOT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatusDot({ status }: { status: StatusKey }) {
  const c = statusConfig[status]?.color || "#888"

  if (status === "RUNNING" || status === "QUEUED" || status === "RECEIVED") {
    return (
      <div className="relative w-3.5 h-3.5 flex-shrink-0">
        <motion.div
          animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full"
          style={{ background: c }}
        />
        <div className="absolute inset-[3px] rounded-full" style={{ background: c }} />
      </div>
    )
  }

  if (status === "FAILED") {
    return (
      <motion.div
        animate={{ boxShadow: [`0 0 6px ${c}`, `0 0 14px ${c}`, `0 0 6px ${c}`] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        className="w-3.5 h-3.5 rounded-full flex-shrink-0"
        style={{ background: c }}
      />
    )
  }

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className="w-3.5 h-3.5 rounded-full flex-shrink-0"
      style={{ background: c }}
    />
  )
}

// â”€â”€â”€ STATUS ICON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatusIcon({ status }: { status: StatusKey }) {
  const c = statusConfig[status]?.color

  if (status === "COMPLETED") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <motion.path
          d="M3 7.5L5.5 10L11 4"
          stroke={c}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        />
      </svg>
    )
  }

  if (status === "FAILED") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M4 4L10 10M10 4L4 10" stroke={c} strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <motion.svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      animate={{ rotate: 360 }}
      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
    >
      <path d="M7 1a6 6 0 015.92 5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    </motion.svg>
  )
}

// â”€â”€â”€ SHIMMER BAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ShimmerBar() {
  return (
    <div className="h-[3px] rounded bg-blue-500/10 overflow-hidden w-full mt-3">
      <motion.div
        animate={{ x: ["-100%", "200%"] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="w-[40%] h-full rounded"
        style={{ background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.5), transparent)" }}
      />
    </div>
  )
}

// â”€â”€â”€ FINDING BADGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FindingBadge({ type, count }: { type: "blocker" | "warn" | "info"; count: number }) {
  if (count === 0) return null

  const config = {
    blocker: { bg: "bg-red-500/10 dark:bg-red-500/20", color: "text-destructive", icon: AlertCircle },
    warn: { bg: "bg-yellow-500/10 dark:bg-yellow-500/20", color: "text-yellow-500", icon: AlertCircle },
    info: { bg: "bg-blue-500/10 dark:bg-blue-500/20", color: "text-blue-500", icon: AlertCircle },
  }

  const { bg, color, icon: Icon } = config[type]

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium", bg, color)}>
      <Icon className="h-3 w-3" />
      {count}
    </span>
  )
}

// â”€â”€â”€ ANALYSIS CARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface AnalysisCardProps {
  item: DashboardAnalysisItem
  index: number
  isLast: boolean
  onDelete: (id: string) => void
  onRerun: (id: string) => void
  onDownload: (item: DashboardAnalysisItem) => void
  deleteBusyId: string | null
}

function AnalysisCard({ item, index, isLast, onDelete, onRerun, onDownload, deleteBusyId }: AnalysisCardProps) {
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })

  const status = normalizeStatus(item.status)
  const sc = statusConfig[status]
  const findingsTotal = item.blockerCount + item.warnCount + item.infoCount
  const impactScore = Math.min(100, Math.round((findingsTotal / 10) * 100))
  const isCompleted = status === "COMPLETED"
  const isPR = item.prLabel.toLowerCase().startsWith("pr")

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="flex gap-0 relative"
    >
      {/* Timeline Rail */}
      <div className="w-12 flex flex-col items-center relative flex-shrink-0 pt-5">
        <StatusDot status={status} />
        {!isLast && (
          <motion.div
            className="flex-1 w-0.5 mt-1.5 origin-top"
            initial={{ scaleY: 0, opacity: 0 }}
            animate={inView ? { scaleY: 1, opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: index * 0.05 + 0.25, ease: "easeOut" }}
            style={{ background: `linear-gradient(to bottom, ${sc.color}44, transparent)` }}
          />
        )}
      </div>

      {/* Card Body */}
      <motion.div
        layout
        onClick={() => setExpanded(!expanded)}
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={cn(
          "flex-1 mb-4 cursor-pointer rounded-xl p-5 backdrop-blur-xl border transition-all",
          expanded
            ? "bg-card/80 dark:bg-card/60"
            : "bg-card/50 dark:bg-card/40 hover:bg-card/70 dark:hover:bg-card/50"
        )}
        style={{
          borderColor: expanded ? sc.border : "rgba(255,255,255,0.06)",
        }}
      >
        {/* Row 1: Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            {/* Repo + Badge Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold font-mono text-foreground">
                {item.repo}
              </span>
              <span className={cn(
                "px-2 py-0.5 rounded text-[11px] font-semibold font-mono",
                isPR
                  ? "bg-teal-500/15 text-teal-400"
                  : "bg-[color:var(--orange)]/10 text-[color:var(--orange)]"
              )}>
                {isPR ? item.prLabel : "COMMIT"}
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold font-mono"
                style={{ background: sc.bg, color: sc.color }}
              >
                <StatusIcon status={status} />
                {sc.label}
              </span>
            </div>
            {/* Commit SHA */}
            {item.commitSha && (
              <span className="text-xs text-muted-foreground font-mono">
                {item.commitSha.slice(0, 10)}
              </span>
            )}
          </div>

          {/* Right: Impact + Time */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <ImpactRing score={impactScore} status={status} />
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-xs text-muted-foreground font-mono">
                {timeAgo(item.createdAt)}
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                {item.durationLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Author */}
        <p className="mt-3 text-sm text-muted-foreground">
          by <span className="font-medium text-foreground/80">{item.author}</span>
        </p>

        {/* Findings Row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <FindingBadge type="blocker" count={item.blockerCount} />
          <FindingBadge type="warn" count={item.warnCount} />
          <FindingBadge type="info" count={item.infoCount} />
          {findingsTotal === 0 && (
            <span className="text-xs text-muted-foreground">No findings</span>
          )}
          <div className="flex-1" />
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            className="text-muted-foreground/40"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </div>

        {/* Shimmer for in-progress */}
        {(status === "RUNNING" || status === "QUEUED" || status === "RECEIVED") && (
          <>
            <ShimmerBar />
            {/* Pipeline Progress */}
            <div className="mt-4">
              <AnalysisPipeline
                analysisStatus={item.status}
                compact
                className="px-1"
              />
            </div>
          </>
        )}

        {/* Expanded Content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-4 flex flex-col gap-4">
                <div className="h-px bg-border" />

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {isCompleted && findingsTotal > 0 && (
                    <>
                      <Link href={`/dashboard/report/${item.id}`} onClick={(e) => e.stopPropagation()}>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Eye className="h-4 w-4" />
                          View Report
                        </Button>
                      </Link>
                      <Link href={`/dashboard/diff/${item.id}`} onClick={(e) => e.stopPropagation()}>
                        <Button variant="outline" size="sm" className="gap-2">
                          <GitCompare className="h-4 w-4" />
                          View Diff
                        </Button>
                      </Link>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={(e) => { e.stopPropagation(); onRerun(item.id) }}
                  >
                    <RotateCw className="h-4 w-4" />
                    Re-run
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={(e) => { e.stopPropagation(); onDownload(item) }}
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive hover:bg-red-500/10"
                    onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
                    disabled={deleteBusyId === item.id}
                  >
                    {deleteBusyId === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

// â”€â”€â”€ GROUP HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function GroupHeader({ label, count, index }: { label: string; count: number; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      className={cn(
        "flex items-center gap-3 pl-12 mb-3",
        index > 0 && "mt-6"
      )}
    >
      <span className="text-[11px] font-extrabold tracking-[1.5px] uppercase text-muted-foreground/50 font-mono">
        {label}
      </span>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
        {count}
      </span>
      <div className="flex-1 h-px bg-border/30" />
    </motion.div>
  )
}

// â”€â”€â”€ STAT COUNTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatCounter({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="text-xl font-extrabold font-mono"
        style={{ color: color || undefined }}
      >
        {value}
      </motion.span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold font-mono">
        {label}
      </span>
    </div>
  )
}

// â”€â”€â”€ FILTER TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FilterTab({
  label,
  active,
  count,
  color,
  onClick
}: {
  label: string
  active: boolean
  count: number
  color?: string
  onClick: () => void
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold font-mono transition-all",
        active
          ? "border-primary/30 bg-primary/10"
          : "border-border/50 bg-transparent hover:bg-muted/50"
      )}
      style={{
        borderColor: active && color ? color : undefined,
        color: active ? (color || "hsl(var(--primary))") : "hsl(var(--muted-foreground))"
      }}
    >
      {label}
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
        {count}
      </span>
    </motion.button>
  )
}

// â”€â”€â”€ HEARTBEAT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Heartbeat() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative w-2.5 h-2.5">
        <motion.div
          animate={{ scale: [1, 2.2, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 rounded-full bg-green-500"
        />
        <div className="absolute inset-0.5 rounded-full bg-green-500" />
      </div>
      <span className="text-[11px] text-green-500/70 font-mono font-medium tracking-wider">
        LIVE
      </span>
    </div>
  )
}

// â”€â”€â”€ MAIN COMPONENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface AnalysisTimelineProps {
  period?: string
  onExportAll?: (analyses: DashboardAnalysisItem[]) => void
}

export function AnalysisTimeline({ period, onExportAll }: AnalysisTimelineProps) {
  const [filter, setFilter] = useState<"all" | StatusKey>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [analyses, setAnalyses] = useState<DashboardAnalysisItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const analysesRef = useRef<DashboardAnalysisItem[]>([])

  // Keep ref in sync for the polling closure
  useEffect(() => {
    analysesRef.current = analyses
  }, [analyses])

  // Fetch analyses
  const loadAnalyses = useCallback(async () => {
    try {
      const data = await fetchDashboardAnalyses({ force: true, size: 100 })
      setAnalyses(data)
    } catch (err) {
      console.error("Failed to fetch analyses:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAnalyses()
  }, [loadAnalyses])

  // Polling for active analyses — runs once, uses ref for latest data
  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const refresh = async () => {
      if (cancelled) return
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        timeoutId = setTimeout(refresh, 30_000)
        return
      }

      const data = await fetchDashboardAnalyses({ force: true, size: 100 })
      if (!cancelled) {
        setAnalyses(data)
        timeoutId = setTimeout(refresh, hasActiveDashboardAnalysis(data) ? 8_000 : 30_000)
      }
    }

    timeoutId = setTimeout(refresh, hasActiveDashboardAnalysis(analysesRef.current) ? 8_000 : 30_000)

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  // Filter by period
  const periodFiltered = useMemo(() => {
    if (!period) return analyses

    const now = new Date()
    return analyses.filter(a => {
      const date = new Date(a.createdAt)
      if (isNaN(date.getTime())) return false

      const diffMs = now.getTime() - date.getTime()
      const diffHours = diffMs / (1000 * 60 * 60)

      if (period === "24h") return diffHours <= 24
      if (period === "week") return diffHours <= 24 * 7
      if (period === "month") return diffHours <= 24 * 30
      return true
    })
  }, [analyses, period])

  // Filter by status
  const statusFiltered = useMemo(() => {
    if (filter === "all") return periodFiltered
    return periodFiltered.filter(a => normalizeStatus(a.status) === filter)
  }, [periodFiltered, filter])

  // Filter by search
  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return statusFiltered

    return statusFiltered.filter(a => {
      return (
        a.repo.toLowerCase().includes(query) ||
        a.prLabel.toLowerCase().includes(query) ||
        a.author.toLowerCase().includes(query) ||
        (a.commitSha ?? "").toLowerCase().includes(query)
      )
    })
  }, [statusFiltered, searchQuery])

  // Group by time
  const groups = useMemo(() => {
    const g: Record<string, DashboardAnalysisItem[]> = {}
    filtered.forEach(item => {
      const group = getTimeGroup(item.createdAt)
      if (!g[group]) g[group] = []
      g[group].push(item)
    })
    return g
  }, [filtered])

  const groupOrder = ["today", "yesterday", "this_week", "older"]

  // Stats
  const totalCompleted = periodFiltered.filter(a => normalizeStatus(a.status) === "COMPLETED").length
  const totalFailed = periodFiltered.filter(a => normalizeStatus(a.status) === "FAILED").length
  const totalRunning = periodFiltered.filter(a => ["RUNNING", "QUEUED", "RECEIVED"].includes(normalizeStatus(a.status))).length

  // Handlers
  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Delete this analysis?")
    if (!confirmed) return

    setDeleteBusyId(id)
    try {
      await deleteDashboardAnalysis(id)
      setAnalyses(prev => prev.filter(a => a.id !== id))
    } catch (err) {
      console.error("Failed to delete:", err)
    } finally {
      setDeleteBusyId(null)
    }
  }

  const handleRerun = async (id: string) => {
    // TODO: Implement re-run functionality
    console.log("Re-run analysis:", id)
  }

  const handleDownload = (item: DashboardAnalysisItem) => {
    const json = JSON.stringify(item, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `analysis-${item.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportAll = () => {
    if (onExportAll) {
      onExportAll(filtered)
    } else {
      const json = JSON.stringify(filtered, null, 2)
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `analyses-export-${new Date().toISOString().split("T")[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center justify-between mb-1">
          <Heartbeat />
          <span className="text-[11px] text-muted-foreground/40 font-mono">
            Powered by Ollama
          </span>
        </div>
        <h1 className="card-heading text-foreground mt-4 tracking-tight">
          Analysis History
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Intelligent code review timeline - tracking every PR and commit analysis
        </p>
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="flex justify-center gap-10 py-4 rounded-xl bg-muted/30 border border-border/30"
      >
        <StatCounter label="Total" value={periodFiltered.length} />
        <StatCounter label="Completed" value={totalCompleted} color="#34d399" />
        <StatCounter label="Failed" value={totalFailed} color="#f87171" />
        <StatCounter label="Running" value={totalRunning} color="#60a5fa" />
      </motion.div>

      {/* Search + Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col sm:flex-row gap-4"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by repo, PR, commit, or author..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" className="gap-2" onClick={handleExportAll}>
          <Download className="h-4 w-4" />
          Export All
        </Button>
      </motion.div>

      {/* Filter Tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="flex gap-2 flex-wrap"
      >
        <FilterTab
          label="All"
          active={filter === "all"}
          count={periodFiltered.length}
          onClick={() => setFilter("all")}
        />
        <FilterTab
          label="Completed"
          active={filter === "COMPLETED"}
          count={totalCompleted}
          color="#34d399"
          onClick={() => setFilter("COMPLETED")}
        />
        <FilterTab
          label="Failed"
          active={filter === "FAILED"}
          count={totalFailed}
          color="#f87171"
          onClick={() => setFilter("FAILED")}
        />
        <FilterTab
          label="Running"
          active={filter === "RUNNING"}
          count={totalRunning}
          color="#60a5fa"
          onClick={() => setFilter("RUNNING")}
        />
      </motion.div>

      {/* Timeline */}
      <div className="mt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={filter + searchQuery}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {groupOrder.map((gk, gi) => {
              const items = groups[gk]
              if (!items || items.length === 0) return null

              const allItems = Object.values(groups).flat()

              return (
                <div key={gk}>
                  <GroupHeader label={groupLabel(gk)} count={items.length} index={gi} />
                  {items.map((item, i) => {
                    const globalIndex = allItems.indexOf(item)
                    const isLast = gi === groupOrder.length - 1 && i === items.length - 1
                    return (
                      <AnalysisCard
                        key={item.id}
                        item={item}
                        index={globalIndex}
                        isLast={isLast}
                        onDelete={handleDelete}
                        onRerun={handleRerun}
                        onDownload={handleDownload}
                        deleteBusyId={deleteBusyId}
                      />
                    )
                  })}
                </div>
              )
            })}

            {filtered.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <FileCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-mono">No analyses match this filter</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
