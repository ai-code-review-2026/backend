import { NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/teams
 *
 * Fetches team data including members, activity, and performance metrics.
 * Returns empty list when backend is unavailable.
 */
export async function GET(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const { searchParams } = new URL(request.url)
  const teamId = searchParams.get("team") || ""

  const queryParams = new URLSearchParams({
    ...(teamId && { team_id: teamId }),
  })

  const proxied = await proxyBackendRequest({
    method: "GET",
    path: `/api/v1/teams?${queryParams.toString()}`,
    token: authContext.token,
    userId: authContext.userId,
  })

  if (proxied.status >= 500 || proxied.status === 502) {
    return NextResponse.json({ items: [], total: 0 }, { status: 200 })
  }

  return proxied
}

/**
 * POST /api/dashboard/teams
 */
export async function POST(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  try {
    const body = await request.json()
    return proxyBackendRequest({
      method: "POST",
      path: "/api/v1/teams",
      token: authContext.token,
      userId: authContext.userId,
      body,
    })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
