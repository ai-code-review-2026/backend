import { NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

type UpdateAssignmentBody = {
  status?: string
  started_at?: string
  completed_at?: string
  declined_reason?: string
  priority?: "low" | "medium" | "high" | "critical"
  reviewer_id?: string
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params

  if (!assignmentId || assignmentId.trim().length === 0) {
    return NextResponse.json({ error: "Invalid assignment id" }, { status: 400 })
  }

  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  let body: UpdateAssignmentBody = {}
  try {
    body = (await request.json()) as UpdateAssignmentBody
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Validate fields if provided
  if (body.priority && !["low", "medium", "high", "critical"].includes(body.priority)) {
    return NextResponse.json({ error: "Invalid priority value" }, { status: 400 })
  }

  if (body.status && !["pending", "in_progress", "completed", "declined"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid status value" }, { status: 400 })
  }

  const response = await proxyBackendRequest({
    method: "PATCH",
    path: `/api/v1/reviews/assignments/${encodeURIComponent(assignmentId)}`,
    token: authContext.token,
    userId: authContext.userId,
    body,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to update assignment" }))
    return NextResponse.json(errorData, { status: response.status })
  }

  const data = await response.json().catch(() => ({}))
  return NextResponse.json(data, { status: 200 })
}

export async function GET(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const { assignmentId } = await context.params

  if (!assignmentId || assignmentId.trim().length === 0) {
    return NextResponse.json({ error: "Invalid assignment id" }, { status: 400 })
  }

  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const response = await proxyBackendRequest({
    method: "GET",
    path: `/api/v1/reviews/assignments/${encodeURIComponent(assignmentId)}`,
    token: authContext.token,
    userId: authContext.userId,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Assignment not found" }))
    return NextResponse.json(errorData, { status: response.status })
  }

  const data = await response.json().catch(() => ({}))
  return NextResponse.json(data, { status: 200 })
}
