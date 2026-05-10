import { NextRequest } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export async function GET(request: NextRequest) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const searchParams = request.nextUrl.searchParams
  const periodDays = searchParams.get("period_days") || "30"

  return proxyBackendRequest({
    method: "GET",
    path: `/v1/reviews/metrics/team?period_days=${encodeURIComponent(periodDays)}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
