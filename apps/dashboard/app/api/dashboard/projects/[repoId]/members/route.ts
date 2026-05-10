import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/projects/[repoId]/members
 * List project members with roles.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ repoId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { repoId } = await context.params
  return proxyBackendRequest({
    method: "GET",
    path: `/api/v1/projects/${encodeURIComponent(repoId)}/members`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
