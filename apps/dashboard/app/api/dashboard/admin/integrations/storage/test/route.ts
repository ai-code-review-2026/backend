import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export async function POST() {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }
  return proxyBackendRequest({
    method: "POST",
    path: "/v1/admin/integrations/storage/test",
    token: authContext.token,
    userId: authContext.userId,
  })
}
