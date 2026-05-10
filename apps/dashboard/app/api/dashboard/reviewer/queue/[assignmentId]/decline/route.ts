import { NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

type DeclineReviewRequest = {
  reason?: unknown
}

/**
 * POST /api/dashboard/reviewer/queue/[assignmentId]/decline
 * 
 * Declines a review assignment by setting status to "declined"
 * and optionally storing the decline reason.
 */
export async function POST(request: Request, context: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await context.params
  
  if (!assignmentId || assignmentId.trim().length === 0) {
    return NextResponse.json({ error: "Invalid assignment id" }, { status: 400 })
  }

  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  let body: DeclineReviewRequest = {}
  try {
    body = (await request.json()) as DeclineReviewRequest
  } catch {
    body = {}
  }

  const reason = typeof body.reason === "string" && body.reason.trim().length > 0 
    ? body.reason.trim() 
    : undefined

  // Call backend PATCH /api/v1/reviews/assignments/{assignmentId}
  // to update the status to "declined"
  return proxyBackendRequest({
    method: "PATCH",
    path: `/api/v1/reviews/assignments/${encodeURIComponent(assignmentId)}`,
    token: authContext.token,
    userId: authContext.userId,
    body: {
      status: "declined",
      declined_reason: reason,
    },
  })
}
