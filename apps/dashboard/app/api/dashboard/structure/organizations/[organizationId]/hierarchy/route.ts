import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"
import { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { organizationId } = await context.params

  return proxyBackendRequest({
    method: "GET",
    path: `/api/v1/structure/organizations/${organizationId}/hierarchy`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
