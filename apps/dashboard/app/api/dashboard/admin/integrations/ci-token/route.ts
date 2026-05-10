import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export async function POST() {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }
  return proxyBackendRequest({
    method: "POST",
    path: "/v1/admin/integrations/ci-token/rotate",
    token: authContext.token,
    userId: authContext.userId,
  })
}

export async function DELETE() {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }
  return proxyBackendRequest({
    method: "DELETE",
    path: "/v1/admin/integrations/ci-token",
    token: authContext.token,
    userId: authContext.userId,
  })
}
