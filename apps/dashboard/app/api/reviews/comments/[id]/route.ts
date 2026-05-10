import { NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

type RouteContext = {
  params: Promise<{ id: string }>
}

export const dynamic = "force-dynamic"

/**
 * DELETE /api/reviews/comments/[id]
 * 
 * Delete a specific review comment.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const { id } = await context.params

  return proxyBackendRequest({
    method: "DELETE",
    path: `/api/v1/reviews/comments/${encodeURIComponent(id)}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}

/**
 * PUT /api/reviews/comments/[id]
 * 
 * Update a specific review comment.
 */
export async function PUT(request: Request, context: RouteContext) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const { id } = await context.params

  try {
    const body = await request.json()
    return proxyBackendRequest({
      method: "PUT",
      path: `/api/v1/reviews/comments/${encodeURIComponent(id)}`,
      token: authContext.token,
      userId: authContext.userId,
      body,
    })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
