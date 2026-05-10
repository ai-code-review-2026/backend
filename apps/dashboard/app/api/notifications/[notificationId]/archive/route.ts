import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

type RouteContext = {
  params: Promise<{ notificationId: string }>
}

/**
 * PATCH /api/notifications/:notificationId/archive
 * Archive a notification (backend currently marks it as read).
 */
export async function PATCH(_request: Request, context: RouteContext) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }
  const { notificationId } = await context.params

  return proxyBackendRequest({
    method: "PATCH",
    path: `/api/v1/notifications/${encodeURIComponent(notificationId)}/archive`,
    token: authContext.token,
    userId: authContext.userId,
    body: {},
  })
}
