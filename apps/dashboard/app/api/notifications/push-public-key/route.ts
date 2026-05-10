import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * GET /api/notifications/push-public-key
 * Return VAPID public key metadata from backend.
 */
export async function GET() {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  return proxyBackendRequest({
    method: "GET",
    path: "/api/v1/notifications/push-public-key",
    token: authContext.token,
    userId: authContext.userId,
  })
}
