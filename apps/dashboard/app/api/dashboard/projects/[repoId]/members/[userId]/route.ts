import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

type UpdateMemberBody = {
  role_code?: string
  notes?: string | null
}

/**
 * PATCH /api/dashboard/projects/[repoId]/members/[userId]
 * Reassign member role in project.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ repoId: string; userId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { repoId, userId } = await context.params
  let body: UpdateMemberBody
  try {
    body = (await request.json()) as UpdateMemberBody
  } catch {
    body = {}
  }
  const roleCode = typeof body.role_code === "string" && body.role_code.trim().length > 0
    ? body.role_code.trim()
    : "developer"

  return proxyBackendRequest({
    method: "POST",
    path: `/api/v1/projects/${encodeURIComponent(repoId)}/roles`,
    token: authContext.token,
    userId: authContext.userId,
    body: {
      user_id: userId,
      role_code: roleCode,
      notes: body.notes ?? "Role updated from project collaborators view",
    },
  })
}

/**
 * DELETE /api/dashboard/projects/[repoId]/members/[userId]
 * Remove member role assignment from project.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ repoId: string; userId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { repoId, userId } = await context.params
  return proxyBackendRequest({
    method: "DELETE",
    path: `/api/v1/projects/${encodeURIComponent(repoId)}/roles/${encodeURIComponent(userId)}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
