import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

type DecisionBody = {
  decision?: unknown
  comment?: unknown
}

async function refreshDashboardAuth(request: Request): Promise<void> {
  const syncUrl = new URL("/api/auth/sync", request.url)

  try {
    await fetch(syncUrl, {
      method: "POST",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    })
  } catch {
    // Best-effort refresh only. Decision submission should still proceed.
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: analysisId } = await context.params
  if (!analysisId || analysisId.trim().length === 0) {
    return NextResponse.json({ error: "Invalid analysis id" }, { status: 400 })
  }

  const { userId, getToken } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getToken()
  if (!token) {
    return NextResponse.json({ error: "Missing Clerk token" }, { status: 401 })
  }

  let body: DecisionBody
  try {
    body = (await request.json()) as DecisionBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const decisionRaw = typeof body.decision === "string" ? body.decision.trim().toUpperCase() : ""
  if (decisionRaw !== "APPROVE" && decisionRaw !== "WARN" && decisionRaw !== "BLOCK") {
    return NextResponse.json({ error: "decision must be one of APPROVE, WARN, BLOCK" }, { status: 400 })
  }
  const comment =
    typeof body.comment === "string" && body.comment.trim().length > 0 ? body.comment.trim().slice(0, 2000) : null

  const submitDecision = async (): Promise<Response> => {
    return fetch(`${BACKEND_API_BASE_URL}/v1/analyses/${analysisId}/decision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: decisionRaw,
        comment,
      }),
      cache: "no-store",
    })
  }

  let backendResponse: Response
  try {
    backendResponse = await submitDecision()
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 })
  }

  if (backendResponse.status === 403) {
    await refreshDashboardAuth(request)
    try {
      backendResponse = await submitDecision()
    } catch {
      return NextResponse.json({ error: "Backend unavailable" }, { status: 502 })
    }
  }

  const rawBackendBody = await backendResponse.text()
  let parsedBackendBody: unknown = {}
  if (rawBackendBody) {
    try {
      parsedBackendBody = JSON.parse(rawBackendBody)
    } catch {
      parsedBackendBody = { detail: rawBackendBody }
    }
  }

  return NextResponse.json(parsedBackendBody, { status: backendResponse.status })
}
