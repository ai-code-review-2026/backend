import { NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"
import { getDefaultNotificationPreferences } from "@/lib/notification-defaults"

export const dynamic = "force-dynamic"

/**
 * GET /api/notifications/preferences
 * Fetch current user's notification preferences.
 */
export async function GET() {
  try {
    const authContext = await requireBackendAuth()
    if (!authContext.ok) {
      return authContext.response
    }

    const proxied = await proxyBackendRequest({
      method: "GET",
      path: "/api/v1/notifications/preferences",
      token: authContext.token,
      userId: authContext.userId,
    })

    if (proxied.status >= 500 || proxied.status === 502) {
      console.error("[notifications] Falling back to default notification preferences")
      return NextResponse.json(getDefaultNotificationPreferences(), { status: 200 })
    }

    return proxied
  } catch (error) {
    console.error("[notifications] Unexpected failure in GET /api/notifications/preferences", error)
    return NextResponse.json(getDefaultNotificationPreferences(), { status: 200 })
  }
}

/**
 * PUT /api/notifications/preferences
 * Update current user's notification preferences.
 */
export async function PUT(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  try {
    const body = await request.json()
    return proxyBackendRequest({
      method: "PUT",
      path: "/api/v1/notifications/preferences",
      token: authContext.token,
      userId: authContext.userId,
      body,
    })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}

/**
 * PATCH /api/notifications/preferences
 * Partial update for current user's notification preferences.
 */
export async function PATCH(request: Request) {
  return PUT(request)
}

/**
 * POST /api/notifications/preferences
 * Compatibility endpoint used by existing UI for resetting preferences.
 */
export async function POST() {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  return proxyBackendRequest({
    method: "POST",
    path: "/api/v1/notifications/preferences/reset",
    token: authContext.token,
    userId: authContext.userId,
    body: {},
  })
}
