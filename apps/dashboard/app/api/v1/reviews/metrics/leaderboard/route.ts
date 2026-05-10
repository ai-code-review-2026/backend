import { NextRequest } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export async function GET(request: NextRequest) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const searchParams = request.nextUrl.searchParams
  const metric = searchParams.get("metric") || "reviews_completed"
  const periodDays = searchParams.get("period_days") || "30"
  const limit = searchParams.get("limit") || "20"

  const queryParams = new URLSearchParams({
    metric,
    period_days: periodDays,
    limit,
  })

  return proxyBackendRequest({
    method: "GET",
    path: `/v1/reviews/metrics/leaderboard?${queryParams.toString()}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
