import { NextRequest } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export async function GET(request: NextRequest) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const url = new URL(request.url)
  const limit = url.searchParams.get("limit") ?? "250"
  return proxyBackendRequest({
    method: "GET",
    path: `/v1/admin/users?limit=${encodeURIComponent(limit)}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
