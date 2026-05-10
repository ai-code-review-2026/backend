import { NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/reviewer
 * 
 * Fetches reviewer dashboard data including:
 * - KPIs (pending, in-progress, completed reviews)
 * - Active reviews
 * - Recent activity
 * - Team stats (for leads)
 */
export async function GET(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  return proxyBackendRequest({
    method: "GET",
    path: "/api/v1/reviews/dashboard",
    token: authContext.token,
    userId: authContext.userId,
  })
}
