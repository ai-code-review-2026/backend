import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { searchParams } = new URL(request.url)
  const periodDays = searchParams.get("period_days") || "30"

  return proxyBackendRequest({
    method: "GET",
    path: `/v1/reviews/metrics/team?period_days=${periodDays}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
