import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/teams/permissions/available
 * 
 * Get the list of available granular permissions.
 */
export async function GET() {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  return proxyBackendRequest({
    method: "GET",
    path: "/api/v1/teams/permissions/available",
    token: authContext.token,
    userId: authContext.userId,
  })
}
