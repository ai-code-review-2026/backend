import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * POST /api/notifications/preferences/reset
 * Reset preferences to backend defaults.
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

