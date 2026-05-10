import { NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/security
 * 
 * Fetches security dashboard data including:
 * - Active security issues by severity
 * - Scan status and history
 * - Resolution time metrics
 */
export async function GET(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") || "active"
  const severity = searchParams.get("severity") || ""
  const repository = searchParams.get("repository") || ""
  const page = searchParams.get("page") || "1"
  const limit = searchParams.get("limit") || "50"

  const queryParams = new URLSearchParams({
    status,
    page,
    limit,
    ...(severity && { severity }),
    ...(repository && { repository }),
  })

  return proxyBackendRequest({
    method: "GET",
    path: `/api/v1/security/issues?${queryParams.toString()}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
