import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"
import { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { projectId } = await context.params

  return proxyBackendRequest({
    method: "GET",
    path: `/api/v1/structure/projects/${projectId}/details`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
