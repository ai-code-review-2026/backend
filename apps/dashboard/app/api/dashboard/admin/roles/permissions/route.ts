import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export async function GET() {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  return proxyBackendRequest({
    method: "GET",
    path: "/api/v1/roles/permissions",
    token: authContext.token,
    userId: authContext.userId,
  })
}
