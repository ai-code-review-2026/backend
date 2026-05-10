import { auth } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"
import {
  resolveGithubTokensForUser,
  listPullRequests,
} from "@/lib/github-client"

export const dynamic = "force-dynamic"

type PRItem = {
  number: number
  state: string
  merged_at: string | null
  created_at: string
  user: { login: string } | null
  additions: number
  deletions: number
  changed_files: number
  requested_reviewers?: Array<{ login: string }>
  review_comments?: number
  comments?: number
  title: string
}

function getDateRange(timeRange: string): Date {
  const now = new Date()
  switch (timeRange) {
    case "1w": return new Date(now.getTime() - 7 * 24 * 3600000)
    case "4w": return new Date(now.getTime() - 28 * 24 * 3600000)
    case "3m": return new Date(now.getTime() - 90 * 24 * 3600000)
    case "6m": return new Date(now.getTime() - 180 * 24 * 3600000)
    case "1y": return new Date(now.getTime() - 365 * 24 * 3600000)
    default: return new Date(now.getTime() - 28 * 24 * 3600000)
  }
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const reposParam = searchParams.get("repos") || ""
  const timeRange = searchParams.get("timeRange") || "4w"

  const repos = reposParam
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const parts = r.split("/")
      return parts.length >= 2 ? { owner: parts[0], repo: parts[1] } : null
    })
    .filter(Boolean) as Array<{ owner: string; repo: string }>

  if (!repos.length) {
    return NextResponse.json({
      charts: { prsMergedPerEngineer: [], linesModifiedPerEngineer: [], linesOfCodePerPR: [] },
      metrics: { medianPRSize: 0, publishToMergeTime: 0, timeToFirstReview: 0 },
      fastFacts: { totalPRsMerged: 0, totalLinesModified: 0, netLinesAdded: 0, totalPRReviews: 0, uniqueAuthors: 0, uniqueReviewers: 0 },
      userList: [],
    })
  }

  // Resolve GitHub token
  let githubToken: string | null = null
  try {
    const tokens = await resolveGithubTokensForUser(userId)
    githubToken = tokens[0] ?? null
  } catch {
    // no token
  }

  if (!githubToken) {
    return NextResponse.json({ error: "GitHub not connected" }, { status: 400 })
  }

  const since = getDateRange(timeRange)
  const allPRs: PRItem[] = []

  for (const { owner, repo } of repos) {
    try {
      // Fetch closed PRs (includes merged)
      const prs = await listPullRequests(owner, repo, "closed", githubToken)
      for (const pr of (prs as PRItem[])) {
        if (pr.merged_at && new Date(pr.merged_at) >= since) {
          allPRs.push(pr)
        }
      }
    } catch {
      // skip failed repos
    }
  }

  // ── Build time-series data ──────────────────────────────────────────────

  type WeekBucket = {
    prSizes: number[]
    linesAdded: number
    linesDeleted: number
    authors: Set<string>
  }

  const weeklyBuckets = new Map<string, WeekBucket>()

  for (const pr of allPRs) {
    const key = getWeekKey(pr.merged_at!)
    if (!weeklyBuckets.has(key)) {
      weeklyBuckets.set(key, { prSizes: [], linesAdded: 0, linesDeleted: 0, authors: new Set() })
    }
    const bucket = weeklyBuckets.get(key)!
    bucket.prSizes.push((pr.additions ?? 0) + (pr.deletions ?? 0))
    bucket.linesAdded += pr.additions ?? 0
    bucket.linesDeleted += pr.deletions ?? 0
    if (pr.user?.login) bucket.authors.add(pr.user.login)
  }

  // Sort weeks chronologically
  const sortedWeeks = [...weeklyBuckets.entries()].sort(
    (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
  )

  const prsMergedPerEngineer = sortedWeeks.map(([week, bucket]) => ({
    date: week,
    value: bucket.authors.size > 0 ? Math.round(bucket.prSizes.length / bucket.authors.size * 10) / 10 : 0,
  }))

  const linesModifiedPerEngineer = sortedWeeks.map(([week, bucket]) => ({
    date: week,
    added: bucket.linesAdded,
    deleted: bucket.linesDeleted,
  }))

  const linesOfCodePerPR = sortedWeeks.map(([week, bucket]) => ({
    date: week,
    value: median(bucket.prSizes),
  }))

  // ── Aggregate metrics ─────────────────────────────────────────────────

  const allSizes = allPRs.map((pr) => (pr.additions ?? 0) + (pr.deletions ?? 0))
  const medianPRSize = median(allSizes)

  // Publish-to-merge time in hours: time from created_at to merged_at
  const mergeTimes = allPRs
    .filter((pr) => pr.merged_at)
    .map((pr) => (new Date(pr.merged_at!).getTime() - new Date(pr.created_at).getTime()) / 3600000)
  const publishToMergeTime = Math.round(median(mergeTimes) * 100) / 100

  const timeToFirstReview = 0 // Would need review events API — default 0

  const uniqueAuthors = new Set(allPRs.map((pr) => pr.user?.login).filter(Boolean)).size
  const uniqueReviewers = new Set(
    allPRs.flatMap((pr) => (pr.requested_reviewers ?? []).map((r) => r.login))
  ).size

  const totalLinesModified = allPRs.reduce(
    (sum, pr) => sum + (pr.additions ?? 0) + (pr.deletions ?? 0),
    0,
  )
  const netLinesAdded = allPRs.reduce(
    (sum, pr) => sum + (pr.additions ?? 0) - (pr.deletions ?? 0),
    0,
  )
  const totalPRReviews = allPRs.reduce(
    (sum, pr) => sum + (pr.review_comments ?? 0) + (pr.comments ?? 0),
    0,
  )

  // ── User list ─────────────────────────────────────────────────────────

  const userMap = new Map<string, {
    login: string
    prsMerged: number
    linesAdded: number
    linesDeleted: number
    totalLines: number
    reviewCycles: number
  }>()

  for (const pr of allPRs) {
    const login = pr.user?.login ?? "unknown"
    if (!userMap.has(login)) {
      userMap.set(login, { login, prsMerged: 0, linesAdded: 0, linesDeleted: 0, totalLines: 0, reviewCycles: 0 })
    }
    const u = userMap.get(login)!
    u.prsMerged += 1
    u.linesAdded += pr.additions ?? 0
    u.linesDeleted += pr.deletions ?? 0
    u.totalLines += (pr.additions ?? 0) + (pr.deletions ?? 0)
    u.reviewCycles += pr.review_comments ?? 0
  }

  const userList = [...userMap.values()].map((u) => ({
    login: u.login,
    prsMerged: u.prsMerged,
    prsReviewed: 0,
    reviewRequestResponseTime: null,
    timeToFirstReview: null,
    timeWaitingOnReviews: null,
    publishToMergeTime: null,
    reviewCyclesUntilMerge: u.reviewCycles,
    linesDeleted: u.linesDeleted,
    linesAdded: u.linesAdded,
    linesChangedPerPR: u.prsMerged > 0 ? Math.round(u.totalLines / u.prsMerged) : 0,
  }))

  return NextResponse.json({
    charts: { prsMergedPerEngineer, linesModifiedPerEngineer, linesOfCodePerPR },
    metrics: {
      medianPRSize,
      publishToMergeTime,
      timeToFirstReview,
      medianPRSizeStatus: medianPRSize > 500 ? "needs_improvement" : medianPRSize > 200 ? "warning" : "good",
      publishToMergeStatus: publishToMergeTime < 4 ? "good" : publishToMergeTime < 24 ? "warning" : "needs_improvement",
      timeToFirstReviewStatus: timeToFirstReview < 2 ? "good" : timeToFirstReview < 8 ? "warning" : "needs_improvement",
    },
    fastFacts: {
      totalPRsMerged: allPRs.length,
      totalLinesModified,
      netLinesAdded,
      totalPRReviews,
      uniqueAuthors,
      uniqueReviewers,
    },
    userList,
    timeRange,
    repos: repos.map((r) => `${r.owner}/${r.repo}`),
  })
}
