import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * POST /api/notifications/mark-all-read
 * 
 * Mark all notifications as read for the current user.
 */
export async function POST() {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  return proxyBackendRequest({
    method: "POST",
    path: "/api/v1/notifications/mark-all-read",
    token: authContext.token,
    userId: authContext.userId,
    body: {},
  })
}
