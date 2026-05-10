import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/teams/access/project/[projectId]
 * 
 * Get the current user's resolved access for a project.
 * Returns role and permissions based on team membership.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { projectId } = await context.params

  return proxyBackendRequest({
    method: "GET",
    path: `/api/v1/teams/access/project/${encodeURIComponent(projectId)}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
