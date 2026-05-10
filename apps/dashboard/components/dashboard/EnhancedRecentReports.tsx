"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  GitCommit,
  GitPullRequest,
  LayoutGrid,
  RefreshCw,
  Search,
  User,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export type ReportStatus = "completed" | "running" | "failed" | "queued" | "received"

export interface RecentReport {
  id: string
  repo: string
  prLabel: string
  commitSha: string | null
  author: string
  status: ReportStatus
  createdAt: string
  updatedAt: string
  durationLabel: string
  blockerCount: number
  warnCount: number
  infoCount: number
  metadata?: Record<string, unknown>
  score?: number
}

type PeriodFilter = "24h" | "week" | "month" | "all"
type StatusFilter = "all" | "completed" | "running" | "failed"

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  "24h": "Last 24 hours",
  week: "This week",
  month: "This month",
  all: "All time",
}

async function fetchRecentReports(params: {
  period?: string
  limit?: number
}): Promise<RecentReport[]> {
  const searchParams = new URLSearchParams()

  if (params.period && params.period !== "all") {
    searchParams.set("period", params.period)
  }

  searchParams.set("size", String(params.limit ?? 50))

  const response = await fetch(`/api/dashboard/analyses?${searchParams.toString()}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch reports: ${response.status}`)
  }

  const data = await response.json()
  return data.items ?? []
}

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return "Unknown"

  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return "Unknown"

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return "Just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function computeScore(report: RecentReport): number {
  if (typeof report.score === "number") return report.score
  return Math.max(0, 100 - report.blockerCount * 10 - report.warnCount * 4 - report.infoCount * 2)
}

function isRunningStatus(status: ReportStatus) {
  return status === "running" || status === "queued" || status === "received"
}

function matchesStatus(report: RecentReport, filter: StatusFilter) {
  if (filter === "all") return true
  if (filter === "running") return isRunningStatus(report.status)
  return report.status === filter
}

function getStatusMeta(status: ReportStatus) {
  switch (status) {
    case "completed":
      return {
        label: "Completed",
        badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
        dot: "bg-emerald-400",
        Icon: CheckCircle2,
      }
    case "failed":
      return {
        label: "Failed",
        badge: "bg-red-500/10 text-red-300 border-red-500/20",
        dot: "bg-red-400",
        Icon: XCircle,
      }
    default:
      return {
        label: "Running",
        badge: "bg-amber-500/10 text-amber-300 border-amber-500/20",
        dot: "bg-amber-400",
        Icon: Activity,
      }
  }
}

function LoadingCard({ dense }: { dense: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/6 bg-[#101015] px-5 py-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]",
        dense ? "min-h-[188px]" : "min-h-[208px]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="w-full max-w-[74%] space-y-3">
          <div className="h-4 w-3/4 rounded-full bg-[#ff6b2b]" />
          <div className="h-3 w-1/2 rounded-full bg-[#ff6b2b]/90" />
          <div className="h-3 w-1/3 rounded-full bg-[#ff6b2b]/85" />
          <div className="flex gap-2 pt-3">
            <div className="h-6 w-16 rounded-md bg-[#ff6b2b]" />
            <div className="h-6 w-12 rounded-md bg-[#ff6b2b]" />
            <div className="h-6 w-14 rounded-md bg-[#ff6b2b]" />
          </div>
        </div>

        <div className="h-12 w-12 rounded-full bg-[#ff6b2b]" />
      </div>
    </div>
  )
}

function EmptyState({ period }: { period: PeriodFilter }) {
  return (
    <div className="rounded-3xl border border-white/6 bg-[#101015] px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03]">
        <FileText className="h-6 w-6 text-[#ff6b2b]" />
      </div>
      <h3 className="text-lg font-semibold text-white">No recent reports</h3>
      <p className="mt-2 text-sm text-zinc-500">
        Nothing matched {PERIOD_LABELS[period].toLowerCase()} with the current filters.
      </p>
    </div>
  )
}

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "emerald" | "amber"
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/15 bg-emerald-500/[0.07] text-emerald-300"
      : "border-amber-500/15 bg-amber-500/[0.07] text-amber-300"

  return (
    <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-xs", toneClass)}>
      <span className="font-mono font-semibold">{value}</span>
      <span className="text-zinc-400">/{label}</span>
    </div>
  )
}

function ReportCard({
  report,
  index,
  dense,
}: {
  report: RecentReport
  index: number
  dense: boolean
}) {
  const status = getStatusMeta(report.status)
  const score = computeScore(report)
  const totalFindings = report.blockerCount + report.warnCount + report.infoCount

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, delay: index * 0.03 }}
    >
      <Link href={`/dashboard/report/${report.id}`} className="block h-full">
        <div
          className={cn(
            "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/6 bg-[#101015] p-5 transition-all duration-200",
            "shadow-[0_0_0_1px_rgba(255,255,255,0.02)] hover:border-[#ff6b2b]/20 hover:bg-[#121219] hover:shadow-[0_16px_40px_rgba(0,0,0,0.35)]",
            dense ? "min-h-[188px]" : "min-h-[208px]",
          )}
        >
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ff6b2b]/35 to-transparent" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", status.dot)} />
                <span className="truncate text-sm font-semibold text-white">{report.repo}</span>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                {report.prLabel.includes("PR") ? (
                  <GitPullRequest className="h-3.5 w-3.5 text-[#ff6b2b]" />
                ) : (
                  <GitCommit className="h-3.5 w-3.5 text-[#ff6b2b]" />
                )}
                <span className="truncate text-zinc-300">{report.prLabel}</span>
                {report.commitSha ? (
                  <span className="truncate font-mono text-zinc-500">{report.commitSha.slice(0, 8)}</span>
                ) : null}
              </div>
            </div>

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#ff6b2b]/30 bg-[#ff6b2b]/12 text-sm font-semibold text-[#ff6b2b] shadow-[0_0_22px_rgba(255,107,43,0.14)]">
              {score}
            </div>
          </div>

          <div className="relative mt-4 flex flex-wrap gap-2">
            <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium", status.badge)}>
              <status.Icon className={cn("mr-1.5 h-3 w-3", isRunningStatus(report.status) && "animate-pulse")} />
              {status.label}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/6 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300">
              {totalFindings} findings
            </span>
            <span className="inline-flex items-center rounded-full border border-white/6 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300">
              {report.durationLabel || "Unknown duration"}
            </span>
          </div>

          <div className="relative mt-4 flex flex-wrap gap-2">
            <span className="rounded-md bg-[#ff6b2b] px-2 py-1 text-[11px] font-medium text-black">
              {report.blockerCount} blocker{report.blockerCount === 1 ? "" : "s"}
            </span>
            <span className="rounded-md bg-[#ff6b2b] px-2 py-1 text-[11px] font-medium text-black">
              {report.warnCount} warning{report.warnCount === 1 ? "" : "s"}
            </span>
            <span className="rounded-md bg-[#ff6b2b] px-2 py-1 text-[11px] font-medium text-black">
              {report.infoCount} info
            </span>
          </div>

          <div className="relative mt-auto flex items-center justify-between gap-3 pt-5 text-xs text-zinc-500">
            <div className="flex min-w-0 items-center gap-2">
              <User className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
              <span className="truncate">{report.author}</span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Clock3 className="h-3.5 w-3.5 text-zinc-600" />
              <span>{formatTimeAgo(report.createdAt)}</span>
              <ChevronRight className="h-3.5 w-3.5 text-[#ff6b2b] transition-transform duration-200 group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

interface EnhancedRecentReportsProps {
  limit?: number
  showHeader?: boolean
  className?: string
  defaultPeriod?: string
}

export function EnhancedRecentReports({
  limit = 20,
  showHeader = true,
  className,
  defaultPeriod = "all",
}: EnhancedRecentReportsProps) {
  const [reports, setReports] = useState<RecentReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(
    defaultPeriod === "24h" || defaultPeriod === "week" || defaultPeriod === "month" || defaultPeriod === "all"
      ? defaultPeriod
      : "all",
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [denseCards, setDenseCards] = useState(false)

  async function loadReports() {
    setLoading(true)
    setError(null)

    try {
      const data = await fetchRecentReports({
        period: periodFilter,
        limit,
      })
      setReports(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load reports"
      setError(message)
      toast.error("Unable to load reports", {
        description: message,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadReports()
  }, [periodFilter, limit])

  useEffect(() => {
    const hasActiveReports = reports.some((report) => isRunningStatus(report.status))
    const timeout = window.setInterval(
      () => {
        void loadReports()
      },
      hasActiveReports ? 8000 : 30000,
    )

    return () => window.clearInterval(timeout)
  }, [reports, periodFilter, limit])

  const stats = {
    total: reports.length,
    completed: reports.filter((report) => report.status === "completed").length,
    running: reports.filter((report) => isRunningStatus(report.status)).length,
    failed: reports.filter((report) => report.status === "failed").length,
  }

  const query = search.trim().toLowerCase()
  const filteredReports = reports
    .filter((report) => matchesStatus(report, statusFilter))
    .filter((report) => {
      if (!query) return true

      return (
        report.repo.toLowerCase().includes(query) ||
        report.author.toLowerCase().includes(query) ||
        report.prLabel.toLowerCase().includes(query) ||
        report.commitSha?.toLowerCase().includes(query)
      )
    })

  const statusTabs: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: stats.total },
    { key: "completed", label: "Completed", count: stats.completed },
    { key: "running", label: "Running", count: stats.running },
    { key: "failed", label: "Failed", count: stats.failed },
  ]

  return (
    <div className={cn("space-y-5", className)}>
      {showHeader ? (
        <section className="overflow-hidden rounded-[24px] border border-emerald-500/10 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.08),transparent_30%),linear-gradient(180deg,#12151a_0%,#101216_100%)] px-6 py-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-400/10 bg-violet-500/10 text-violet-300 shadow-[0_0_24px_rgba(139,92,246,0.12)]">
                <FileText className="h-5 w-5" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-white">Recent Reports</h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    LIVE
                  </span>
                </div>

                <p className="mt-1 text-sm text-zinc-500">
                  <span className="font-medium text-white">{stats.total}</span> analyses
                  <span className="mx-1.5 text-zinc-700">•</span>
                  <span className="text-emerald-300">{stats.completed} completed</span>
                  <span className="mx-1.5 text-zinc-700">•</span>
                  <span className="text-amber-300">{stats.running} running</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <MetricChip label="Done" value={stats.completed} tone="emerald" />
              <MetricChip label="Active" value={stats.running} tone="amber" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadReports()}
                className="h-9 rounded-xl border-white/8 bg-white/[0.03] px-3 text-zinc-300 hover:bg-white/[0.06] hover:text-white"
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-4 rounded-[24px] bg-transparent">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reports by repo, author, PR..."
              className="h-11 rounded-none border-white/6 bg-[#14141c] pl-10 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </div>

          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-11 rounded-none border-white/6 bg-[#14141c] px-4 text-zinc-300 hover:bg-[#1a1a22] hover:text-white"
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 border-white/8 bg-[#14141c] text-zinc-200">
                {(["all", "24h", "week", "month"] as PeriodFilter[]).map((period) => (
                  <DropdownMenuItem
                    key={period}
                    onClick={() => setPeriodFilter(period)}
                    className={cn("cursor-pointer", periodFilter === period && "text-[#ff6b2b]")}
                  >
                    {PERIOD_LABELS[period]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setDenseCards((current) => !current)}
              className="h-11 w-11 rounded-none border-white/6 bg-[#14141c] text-zinc-300 hover:bg-[#1a1a22] hover:text-white"
              title={denseCards ? "Comfortable cards" : "Dense cards"}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors",
                statusFilter === tab.key
                  ? "border-white/12 bg-white/[0.06] text-white"
                  : "border-white/6 bg-[#111118] text-zinc-400 hover:bg-[#171720] hover:text-zinc-200",
              )}
            >
              {tab.label}
              <span className="rounded bg-black/35 px-1.5 py-0.5 text-[10px] text-zinc-400">{tab.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div
            className={cn(
              "grid gap-4",
              denseCards ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
            )}
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <LoadingCard key={index} dense={denseCards} />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/10 bg-red-500/[0.04] px-6 py-10 text-center">
            <XCircle className="mx-auto h-8 w-8 text-red-300" />
            <p className="mt-3 text-sm font-medium text-red-200">{error}</p>
            <Button
              variant="outline"
              onClick={() => void loadReports()}
              className="mt-4 border-red-500/20 bg-transparent text-red-200 hover:bg-red-500/10"
            >
              Retry
            </Button>
          </div>
        ) : filteredReports.length === 0 ? (
          <EmptyState period={periodFilter} />
        ) : (
          <div
            className={cn(
              "grid gap-4",
              denseCards ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
            )}
          >
            <AnimatePresence mode="popLayout">
              {filteredReports.slice(0, limit).map((report, index) => (
                <ReportCard key={report.id} report={report} index={index} dense={denseCards} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>
    </div>
  )
}
