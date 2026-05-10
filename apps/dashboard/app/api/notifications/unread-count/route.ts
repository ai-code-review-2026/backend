import { NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"
import { getEmptyUnreadCountResponse } from "@/lib/notification-defaults"

export const dynamic = "force-dynamic"

/**
 * GET /api/notifications/unread-count
 * 
 * Fetches the count of unread notifications for the current user.
 */
export async function GET() {
  try {
    const authContext = await requireBackendAuth()
    if (!authContext.ok) {
      return authContext.response
    }

    const proxied = await proxyBackendRequest({
      method: "GET",
      path: "/api/v1/notifications/unread-count",
      token: authContext.token,
      userId: authContext.userId,
    })

    if (proxied.status >= 500 || proxied.status === 502) {
      console.error("[notifications] Falling back to unread count=0")
      return NextResponse.json(getEmptyUnreadCountResponse(), { status: 200 })
    }

    return proxied
  } catch (error) {
    console.error("[notifications] Unexpected failure in GET /api/notifications/unread-count", error)
    return NextResponse.json(getEmptyUnreadCountResponse(), { status: 200 })
  }
}
