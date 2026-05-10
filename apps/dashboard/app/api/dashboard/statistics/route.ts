import { NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

const EMPTY_STATISTICS = {
  time_range: "30d",
  generated_at: new Date().toISOString(),
  quality: {
    overall_score: 0,
    security_score: 0,
    maintainability_score: 0,
    reliability_score: 0,
    total_findings: 0,
    blocker_count: 0,
    critical_count: 0,
    major_count: 0,
    minor_count: 0,
    findings_by_category: {},
    trend: [],
  },
  velocity: {
    avg_review_time_hours: 0,
    avg_time_to_first_review_hours: 0,
    reviews_per_day: 0,
    analyses_per_day: 0,
    total_reviews: 0,
    total_analyses: 0,
    completed_analyses: 0,
    failed_analyses: 0,
    trend: [],
  },
  team: {
    active_reviewers: 0,
    total_team_members: 0,
    reviews_by_reviewer: {},
    avg_reviews_per_member: 0,
    top_contributors: [],
    bottlenecks: [],
  },
}

export async function GET(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const { searchParams } = new URL(request.url)
  const timeRange = searchParams.get("timeRange") || "30d"
  const category = searchParams.get("category") || "all"

  const queryParams = new URLSearchParams({ time_range: timeRange, category })

  const proxied = await proxyBackendRequest({
    method: "GET",
    path: `/api/v1/statistics?${queryParams.toString()}`,
    token: authContext.token,
    userId: authContext.userId,
  })

  // If backend fails, return empty-but-valid statistics so the page renders
  if (proxied.status >= 500 || proxied.status === 502) {
    return NextResponse.json(
      { ...EMPTY_STATISTICS, time_range: timeRange },
      { status: 200 },
    )
  }

  return proxied
}
