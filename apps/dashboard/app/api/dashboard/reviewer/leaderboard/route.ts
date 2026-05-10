import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { searchParams } = new URL(request.url)
  const metric = searchParams.get("metric") || "reviews_completed"
  const periodDays = searchParams.get("period_days") || "30"
  const limit = searchParams.get("limit") || "20"

  return proxyBackendRequest({
    method: "GET",
    path: `/v1/reviews/metrics/leaderboard?metric=${metric}&period_days=${periodDays}&limit=${limit}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
