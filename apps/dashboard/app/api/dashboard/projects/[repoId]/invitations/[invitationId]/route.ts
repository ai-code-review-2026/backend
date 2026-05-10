import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

type UpdateInvitationBody = {
  status?: "pending" | "accepted" | "revoked"
}

/**
 * PATCH /api/dashboard/projects/[repoId]/invitations/[invitationId]
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ repoId: string; invitationId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { repoId, invitationId } = await context.params
  let body: UpdateInvitationBody
  try {
    body = (await request.json()) as UpdateInvitationBody
  } catch {
    body = {}
  }

  const status = body.status ?? "revoked"
  return proxyBackendRequest({
    method: "PATCH",
    path: `/api/v1/projects/${encodeURIComponent(repoId)}/invitations/${encodeURIComponent(invitationId)}`,
    token: authContext.token,
    userId: authContext.userId,
    body: { status },
  })
}
