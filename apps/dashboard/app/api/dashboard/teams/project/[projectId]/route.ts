import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/teams/project/[projectId]
 * 
 * Get all teams for a project.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { projectId } = await context.params
  const { searchParams } = new URL(request.url)
  const includeMembers = searchParams.get("include_members") !== "false"
  const includeStats = searchParams.get("include_stats") === "true"

  const queryParams = new URLSearchParams({
    include_members: String(includeMembers),
    include_stats: String(includeStats),
  })

  return proxyBackendRequest({
    method: "GET",
    path: `/api/v1/teams/project/${encodeURIComponent(projectId)}?${queryParams.toString()}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
