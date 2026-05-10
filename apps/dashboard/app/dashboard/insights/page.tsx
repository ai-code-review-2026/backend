"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import {
  Code2,
  Clock,
  GitMerge,
  Users,
  Download,
  UserPlus,
  Filter,
  Info,
  ChevronDown,
  RefreshCw,
  TrendingUp,
  FileCode2,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

interface ChartPoint {
  date: string
  value?: number
  added?: number
  deleted?: number
}

interface InsightsData {
  charts: {
    prsMergedPerEngineer: ChartPoint[]
    linesModifiedPerEngineer: ChartPoint[]
    linesOfCodePerPR: ChartPoint[]
  }
  metrics: {
    medianPRSize: number
    publishToMergeTime: number
    timeToFirstReview: number
    medianPRSizeStatus: "good" | "warning" | "needs_improvement"
    publishToMergeStatus: "good" | "warning" | "needs_improvement"
    timeToFirstReviewStatus: "good" | "warning" | "needs_improvement"
  }
  fastFacts: {
    totalPRsMerged: number
    totalLinesModified: number
    netLinesAdded: number
    totalPRReviews: number
    uniqueAuthors: number
    uniqueReviewers: number
  }
  userList: Array<{
    login: string
    prsMerged: number
    prsReviewed: number
    reviewRequestResponseTime: number | null
    timeToFirstReview: number | null
    timeWaitingOnReviews: number | null
    publishToMergeTime: number | null
    reviewCyclesUntilMerge: number
    linesDeleted: number
    linesAdded: number
    linesChangedPerPR: number
  }>
  timeRange: string
  repos: string[]
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  good: "Good",
  warning: "Warning",
  needs_improvement: "Needs improvement",
}

const STATUS_COLORS: Record<string, string> = {
  good: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  needs_improvement: "bg-red-500/15 text-red-400 border-red-500/20",
}

function StatusBadge({ status }: { status: "good" | "warning" | "needs_improvement" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border",
        STATUS_COLORS[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

// ── Tooltip helpers ───────────────────────────────────────────────────────────

function formatHours(h: number | null): string {
  if (h === null || h === undefined) return "—"
  if (h === 0) return "0 hrs"
  if (h < 1) return `${Math.round(h * 60)} min`
  return `${h.toFixed(2)} hrs`
}

function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  return n.toLocaleString()
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  value,
  label,
  unit,
  status,
  description,
}: {
  icon: React.ElementType
  value: string
  label: string
  unit?: string
  status: "good" | "warning" | "needs_improvement"
  description?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <div>
        <span className="text-3xl font-semibold text-foreground">{value}</span>
        {unit && <span className="text-sm text-muted-foreground ml-1.5">{unit}</span>}
      </div>
      <StatusBadge status={status} />
      {description && (
        <p className="text-xs text-muted-foreground leading-5">{description}</p>
      )}
    </div>
  )
}

// ── Chart card ────────────────────────────────────────────────────────────────

function ChartCard({
  title,
  summary,
  children,
}: {
  title: string
  summary?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <div className="h-48">{children}</div>
      {summary && (
        <p className="text-xs text-muted-foreground border-t border-border pt-3">{summary}</p>
      )}
    </div>
  )
}

// ── Time range options ────────────────────────────────────────────────────────

const TIME_RANGES = [
  { value: "1w", label: "Last 1 week" },
  { value: "4w", label: "Last 4 weeks" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "1y", label: "Last 1 year" },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [repoInput, setRepoInput] = useState("")
  const [selectedRepos, setSelectedRepos] = useState<string[]>([])
  const [timeRange, setTimeRange] = useState("4w")
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userFilter, setUserFilter] = useState<string[]>([])
  const [sortCol, setSortCol] = useState<string>("prsMerged")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const loadedOnce = useRef(false)

  const fetchInsights = useCallback(
    async (repos: string[], tr: string) => {
      if (!repos.length) return
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          repos: repos.join(","),
          timeRange: tr,
        })
        const res = await fetch(`/api/dashboard/insights?${params.toString()}`)
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error ?? "Failed to load insights")
        }
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (selectedRepos.length > 0 && !loadedOnce.current) {
      loadedOnce.current = true
      void fetchInsights(selectedRepos, timeRange)
    }
  }, [selectedRepos, timeRange, fetchInsights])

  const addRepo = () => {
    const trimmed = repoInput.trim()
    if (!trimmed || selectedRepos.includes(trimmed)) return
    const next = [...selectedRepos, trimmed]
    setSelectedRepos(next)
    setRepoInput("")
    void fetchInsights(next, timeRange)
  }

  const removeRepo = (r: string) => {
    const next = selectedRepos.filter((x) => x !== r)
    setSelectedRepos(next)
    if (next.length) void fetchInsights(next, timeRange)
    else setData(null)
  }

  const changeTimeRange = (tr: string) => {
    setTimeRange(tr)
    if (selectedRepos.length) void fetchInsights(selectedRepos, tr)
  }

  // ── Derived user list ───────────────────────────────────────────────────
  const userList = data?.userList ?? []
  const visibleUsers =
    userFilter.length > 0
      ? userList.filter((u) => userFilter.includes(u.login))
      : userList

  const sortedUsers = [...visibleUsers].sort((a, b) => {
    const av = a[sortCol as keyof typeof a] ?? 0
    const bv = b[sortCol as keyof typeof b] ?? 0
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "desc" ? bv - av : av - bv
    }
    return 0
  })

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    else { setSortCol(col); setSortDir("desc") }
  }

  const downloadCSV = () => {
    if (!sortedUsers.length) return
    const header = [
      "User", "PRs merged", "PRs reviewed",
      "Review request response time", "Time to first review",
      "Time waiting on reviews", "Publish to merge time",
      "Review cycles until merge", "Lines deleted", "Lines added",
      "Lines changed per PR",
    ]
    const rows = sortedUsers.map((u) => [
      u.login, u.prsMerged, u.prsReviewed,
      u.reviewRequestResponseTime ?? "", u.timeToFirstReview ?? "",
      u.timeWaitingOnReviews ?? "", u.publishToMergeTime ?? "",
      u.reviewCyclesUntilMerge, u.linesDeleted, u.linesAdded,
      u.linesChangedPerPR,
    ])
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "insights-users.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  const timeRangeLabel = TIME_RANGES.find((t) => t.value === timeRange)?.label ?? "Last 4 weeks"
  const primaryRepoOwner = selectedRepos[0]?.split("/")[0]?.trim()
  const inviteTeammatesHref = `/dashboard/admin/organization?invite=1${
    primaryRepoOwner ? `&githubOrg=${encodeURIComponent(primaryRepoOwner)}` : ""
  }`

  // ── Empty state (no repos) ──────────────────────────────────────────────
  if (!selectedRepos.length) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Insights</h1>
            <Badge variant="outline" className="text-xs">Beta</Badge>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-32 gap-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <TrendingUp className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold">Add a repository to get started</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Enter one or more GitHub repositories in <code>owner/repo</code> format to see engineering insights.
            </p>
          </div>
          <div className="flex w-full max-w-sm gap-2">
            <Input
              placeholder="owner/repo"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRepo()}
              className="flex-1"
            />
            <Button onClick={addRepo} disabled={!repoInput.trim()}>
              Add repo
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Insights</h1>
            <Badge variant="outline" className="text-xs">Beta</Badge>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Time range */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                  <Clock className="h-3.5 w-3.5" />
                  {timeRangeLabel}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {TIME_RANGES.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.value}
                    checked={timeRange === t.value}
                    onCheckedChange={() => changeTimeRange(t.value)}
                  >
                    {t.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Repos selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                  <FileCode2 className="h-3.5 w-3.5" />
                  {selectedRepos.length} repo{selectedRepos.length !== 1 ? "s" : ""} selected
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Selected repos</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {selectedRepos.map((r) => (
                  <DropdownMenuCheckboxItem
                    key={r}
                    checked
                    onCheckedChange={() => removeRepo(r)}
                  >
                    {r}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <div className="flex gap-2 p-2">
                  <Input
                    placeholder="owner/repo"
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addRepo()}
                    className="h-7 text-xs flex-1"
                  />
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={addRepo} disabled={!repoInput.trim()}>
                    Add
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => fetchInsights(selectedRepos, timeRange)}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <Info className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading insights…</p>
          </div>
        </div>
      )}

      {data && (
        <div className="px-6 py-6 space-y-8">
          {/* Info banner */}
          {(data.fastFacts.uniqueAuthors ?? 0) < 5 && (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-blue-500/20 bg-blue-500/8 px-4 py-3 text-sm text-blue-300">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  There are fewer than 5 active users across this entire time frame for these repos. Modify your
                  selection to see comparative data.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <Link href={inviteTeammatesHref}>
                    <UserPlus className="h-3 w-3" /> Invite more teammates
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs">
                  <ExternalLink className="h-3 w-3 mr-1" /> Learn more
                </Button>
              </div>
            </div>
          )}

          {/* ── 3 charts ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Chart 1: PRs merged per engineer */}
            <ChartCard
              title="PRs merged per engineer (median)"
              summary={`${data.fastFacts.totalPRsMerged > 0 ? (data.fastFacts.totalPRsMerged / Math.max(1, data.fastFacts.uniqueAuthors)).toFixed(1) : 0} PR merged per engineer (median)`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.charts.prsMergedPerEngineer}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#60a5fa" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 2: Lines modified per engineer */}
            <ChartCard
              title="Lines modified per engineer (median)"
              summary={`${(data.fastFacts.totalLinesModified / Math.max(1, data.fastFacts.uniqueAuthors)).toLocaleString(undefined, { maximumFractionDigits: 0 })} lines modified per engineer (median)`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.charts.linesModifiedPerEngineer}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: "#a1a1aa" }}
                  />
                  <Legend
                    formatter={(val) => val === "added" ? "Lines added" : "Lines deleted"}
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  />
                  <Bar dataKey="added" fill="#4ade80" radius={[2, 2, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="deleted" fill="#f87171" radius={[2, 2, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 3: Lines of code per PR */}
            <ChartCard
              title="Lines of code per PR (median)"
              summary={`${data.metrics.medianPRSize.toLocaleString()} lines of code per PR (median)`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.charts.linesOfCodePerPR}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#a78bfa" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── 3 metric cards ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard
              icon={Code2}
              value={data.metrics.medianPRSize.toLocaleString()}
              unit="lines"
              label="Median PR size"
              status={data.metrics.medianPRSizeStatus}
              description={
                data.metrics.medianPRSizeStatus === "needs_improvement"
                  ? "Developers are shipping extremely large PRs (>500 lines), which can slow down review and deployment"
                  : data.metrics.medianPRSizeStatus === "warning"
                  ? "PRs are on the larger side. Aim for under 200 lines for faster reviews."
                  : "PR sizes are healthy, making reviews fast and focused."
              }
            />
            <MetricCard
              icon={GitMerge}
              value={formatHours(data.metrics.publishToMergeTime)}
              label="Publish to merge time"
              status={data.metrics.publishToMergeStatus}
              description={
                data.metrics.publishToMergeStatus === "good"
                  ? "PRs are reviewed and merged quickly, indicating fast code review and rapid developer velocity"
                  : "Consider reducing review bottlenecks to speed up merge time."
              }
            />
            <MetricCard
              icon={Clock}
              value={formatHours(data.metrics.timeToFirstReview)}
              label="Time to first review"
              status={data.metrics.timeToFirstReviewStatus}
              description={
                data.metrics.timeToFirstReviewStatus === "good"
                  ? "PRs are being reviewed quickly, keeping developers unblocked"
                  : "Reviewers are taking longer than ideal to respond to new PRs."
              }
            />
          </div>

          {/* ── Fast facts ────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Fast facts</h2>
            <div className="grid grid-cols-2 gap-y-5 gap-x-6 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Total PRs merged", value: formatNum(data.fastFacts.totalPRsMerged) },
                { label: "Total lines of code modified", value: formatNum(data.fastFacts.totalLinesModified) },
                {
                  label: "Net lines of code added",
                  value: (data.fastFacts.netLinesAdded >= 0 ? "+" : "") + formatNum(data.fastFacts.netLinesAdded),
                },
                { label: "Total PR reviews", value: formatNum(data.fastFacts.totalPRReviews) },
                { label: "Unique authors", value: formatNum(data.fastFacts.uniqueAuthors) },
                { label: "Unique reviewers", value: formatNum(data.fastFacts.uniqueReviewers) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-2xl font-semibold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── User list ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border gap-4 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-foreground">User list</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Includes users in the chosen repositories across GitHub
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Filter by users */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                      <Filter className="h-3 w-3" />
                      Filter by users
                      {userFilter.length > 0 && (
                        <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px]">{userFilter.length}</Badge>
                      )}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel>Filter by user</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {userList.map((u) => (
                      <DropdownMenuCheckboxItem
                        key={u.login}
                        checked={userFilter.includes(u.login)}
                        onCheckedChange={(checked) =>
                          setUserFilter((prev) =>
                            checked ? [...prev, u.login] : prev.filter((x) => x !== u.login),
                          )
                        }
                      >
                        {u.login}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {userFilter.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem checked={false} onCheckedChange={() => setUserFilter([])}>
                          Clear filter
                        </DropdownMenuCheckboxItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <Link href={inviteTeammatesHref}>
                    <UserPlus className="h-3 w-3" />
                    Invite teammates
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={downloadCSV}>
                  <Download className="h-3 w-3" />
                  Download CSV
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {[
                      { col: "login", label: "User" },
                      { col: "prsMerged", label: "PRs merged" },
                      { col: "prsReviewed", label: "PRs reviewed" },
                      { col: "reviewRequestResponseTime", label: "Review request response time" },
                      { col: "timeToFirstReview", label: "Time to first review" },
                      { col: "timeWaitingOnReviews", label: "Time waiting on reviews" },
                      { col: "publishToMergeTime", label: "Publish to merge time" },
                      { col: "reviewCyclesUntilMerge", label: "Review cycles until merge" },
                      { col: "linesDeleted", label: "Lines of code deleted" },
                      { col: "linesAdded", label: "Lines of code added" },
                      { col: "linesChangedPerPR", label: "Lines changed per PR" },
                    ].map(({ col, label }) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className={cn(
                          "px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none transition-colors",
                          sortCol === col && "text-foreground",
                        )}
                      >
                        <span className="flex items-center gap-1">
                          {label}
                          {sortCol === col && (
                            <span className="text-[10px]">{sortDir === "desc" ? "↓" : "↑"}</span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-muted-foreground">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    sortedUsers.map((u, i) => (
                      <tr
                        key={u.login}
                        className={cn(
                          "border-b border-border/50 transition-colors hover:bg-muted/20",
                          i % 2 === 0 ? "bg-transparent" : "bg-muted/5",
                        )}
                      >
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40 flex items-center justify-center text-[10px] font-bold text-foreground shrink-0">
                              {u.login.slice(0, 2).toUpperCase()}
                            </div>
                            <span>{u.login}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground">{u.prsMerged}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.prsReviewed || 0}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatHours(u.reviewRequestResponseTime)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatHours(u.timeToFirstReview)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatHours(u.timeWaitingOnReviews)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatHours(u.publishToMergeTime)}</td>
                        <td className="px-4 py-3 text-foreground">{u.reviewCyclesUntilMerge}</td>
                        <td className="px-4 py-3 text-red-400">
                          {u.linesDeleted > 0 ? `-${u.linesDeleted.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-emerald-400">
                          {u.linesAdded > 0 ? `+${u.linesAdded.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {u.linesChangedPerPR.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
