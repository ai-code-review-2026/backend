import { NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

const EMPTY_METRICS = {
  reviewer_id: "",
  period: {
    start: new Date().toISOString(),
    end: new Date().toISOString(),
    days: 30,
  },
  current_period: {
    reviews_completed: 0,
    avg_review_time_minutes: 0,
    avg_comments_per_review: 0,
    sla_compliance_rate: 0,
    approvals: 0,
    warnings: 0,
    blocks: 0,
    findings_identified: 0,
  },
  trends: {
    dates: [],
    reviews_completed: [],
    avg_review_time: [],
    sla_compliance: [],
    avg_comments: [],
  },
  rankings: {
    reviews_count: 0,
    quality_score: 0,
    response_time: 0,
  },
}

/**
 * GET /api/dashboard/reviewer/metrics
 *
 * Proxies to the backend /v1/reviews/metrics/personal endpoint.
 * Accepts ?period_days=30 (7–365).
 */
export async function GET(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const { searchParams } = new URL(request.url)
  const periodDays = searchParams.get("period_days") || "30"

  const proxied = await proxyBackendRequest({
    method: "GET",
    path: `/v1/reviews/metrics/personal?period_days=${periodDays}`,
    token: authContext.token,
    userId: authContext.userId,
  })

  if (proxied.status >= 500 || proxied.status === 502) {
    return NextResponse.json(
      {
        ...EMPTY_METRICS,
        reviewer_id: authContext.userId,
        period: {
          ...EMPTY_METRICS.period,
          days: Number(periodDays) || 30,
        },
      },
      { status: 200 },
    )
  }

  return proxied
}
