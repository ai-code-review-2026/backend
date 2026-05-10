import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export async function GET() {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }
  return proxyBackendRequest({
    method: "GET",
    path: "/v1/admin/observability",
    token: authContext.token,
    userId: authContext.userId,
  })
}
