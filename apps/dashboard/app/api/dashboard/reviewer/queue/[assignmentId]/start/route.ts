import { NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

type StartReviewRequest = {
  analysisId?: unknown
  priority?: unknown
}

type AssignmentPayload = {
  id?: unknown
  analysis_id?: unknown
  status?: unknown
}

type ReviewPriority = "low" | "medium" | "high" | "critical"

const VALID_PRIORITIES = new Set<ReviewPriority>(["low", "medium", "high", "critical"])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function getAssignmentId(payload: unknown): string | null {
  const record = asRecord(payload)
  const id = record.id
  return typeof id === "string" && id.trim().length > 0 ? id : null
}

function getAnalysisIdFromBody(body: StartReviewRequest, assignmentId: string): string | null {
  if (typeof body.analysisId === "string" && body.analysisId.trim().length > 0) {
    return body.analysisId.trim()
  }

  const generatedPrefix = assignmentId.startsWith("asg_")
    ? "asg_"
    : assignmentId.startsWith("avl_")
      ? "avl_"
      : null
  if (!generatedPrefix) {
    return null
  }

  const derived = assignmentId.slice(generatedPrefix.length).trim()
  return derived.length > 0 ? derived : null
}

function getPriority(body: StartReviewRequest): ReviewPriority {
  if (typeof body.priority !== "string") {
    return "medium"
  }
  return VALID_PRIORITIES.has(body.priority as ReviewPriority) ? (body.priority as ReviewPriority) : "medium"
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}))
}

async function startAssignment(options: {
  assignmentId: string
  token: string
  userId: string
  startedAt: string
}): Promise<Response> {
  return proxyBackendRequest({
    method: "PATCH",
    path: `/api/v1/reviews/assignments/${encodeURIComponent(options.assignmentId)}`,
    token: options.token,
    userId: options.userId,
    body: {
      status: "in_progress",
      started_at: options.startedAt,
    },
  })
}

async function findExistingAssignment(options: {
  analysisId: string
  token: string
  userId: string
}): Promise<string | null> {
  // Try to find an assignment for this analysis and reviewer
  const response = await proxyBackendRequest({
    method: "GET",
    path: `/api/v1/reviews/assignments?analysis_id=${encodeURIComponent(options.analysisId)}&reviewer_id=${encodeURIComponent(options.userId)}&limit=10`,
    token: options.token,
    userId: options.userId,
  })

  if (!response.ok) {
    return null
  }

  const assignments = await parseJson(response)
  if (!Array.isArray(assignments)) {
    return null
  }

  // Find any assignment that's pending or in_progress for this analysis+reviewer
  const match = assignments.find((item): item is AssignmentPayload => {
    const record = asRecord(item)
    return (
      record.analysis_id === options.analysisId &&
      (record.status === "pending" || record.status === "in_progress")
    )
  })

  return match ? getAssignmentId(match) : null
}

async function createSelfAssignment(options: {
  analysisId: string
  priority: ReviewPriority
  token: string
  userId: string
}): Promise<Response> {
  return proxyBackendRequest({
    method: "POST",
    path: "/api/v1/reviews/assignments",
    token: options.token,
    userId: options.userId,
    body: {
      analysis_id: options.analysisId,
      reviewer_id: options.userId,
      assignment_type: "self_assigned",
      priority: options.priority,
    },
  })
}

export async function POST(request: Request, context: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await context.params
  if (!assignmentId || assignmentId.trim().length === 0) {
    return NextResponse.json({ error: "Invalid assignment id" }, { status: 400 })
  }

  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  let body: StartReviewRequest = {}
  try {
    body = (await request.json()) as StartReviewRequest
  } catch {
    body = {}
  }

  const startedAt = new Date().toISOString()
  const startResponse = await startAssignment({
    assignmentId,
    token: authContext.token,
    userId: authContext.userId,
    startedAt,
  })

  if (startResponse.ok) {
    const payload = await parseJson(startResponse)
    return NextResponse.json(
      {
        success: true,
        assignmentId: getAssignmentId(payload) ?? assignmentId,
        item: payload,
      },
      { status: 200 },
    )
  }

  if (startResponse.status !== 404) {
    const payload = await parseJson(startResponse)
    return NextResponse.json(payload, { status: startResponse.status })
  }

  const analysisId = getAnalysisIdFromBody(body, assignmentId)
  if (!analysisId) {
    return NextResponse.json(
      {
        error: "Assignment not found and no analysis id was provided",
      },
      { status: 404 },
    )
  }

  const existingAssignmentId = await findExistingAssignment({
    analysisId,
    token: authContext.token,
    userId: authContext.userId,
  })

  let resolvedAssignmentId = existingAssignmentId
  if (!resolvedAssignmentId) {
    const createResponse = await createSelfAssignment({
      analysisId,
      priority: getPriority(body),
      token: authContext.token,
      userId: authContext.userId,
    })
    const createPayload = await parseJson(createResponse)
    if (!createResponse.ok) {
      return NextResponse.json(createPayload, { status: createResponse.status })
    }
    resolvedAssignmentId = getAssignmentId(createPayload)
  }

  if (!resolvedAssignmentId) {
    return NextResponse.json(
      {
        error: "Unable to create review assignment",
      },
      { status: 502 },
    )
  }

  const resolvedStartResponse = await startAssignment({
    assignmentId: resolvedAssignmentId,
    token: authContext.token,
    userId: authContext.userId,
    startedAt,
  })
  const payload = await parseJson(resolvedStartResponse)

  if (!resolvedStartResponse.ok) {
    return NextResponse.json(payload, { status: resolvedStartResponse.status })
  }

  return NextResponse.json(
    {
      success: true,
      assignmentId: resolvedAssignmentId,
      item: payload,
    },
    { status: 200 },
  )
}
