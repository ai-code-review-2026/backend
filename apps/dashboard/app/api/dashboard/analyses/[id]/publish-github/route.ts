import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

const TIMEOUT_MS = parseInt(process.env.DASHBOARD_BACKEND_WRITE_TIMEOUT_MS || "30000", 10)

type PublishGitHubBody = {
  force?: boolean
}

type PublishGitHubResponse = {
  status: "published" | "already_published" | "skipped" | "disabled" | "failed"
  message: string
  published_at?: string
  repo?: string
  pr_number?: number
  findings_count?: number
  comment_id?: string
  error?: string
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
    // Best-effort refresh only. Publication should still proceed.
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

  let body: PublishGitHubBody
  try {
    body = (await request.json()) as PublishGitHubBody
  } catch {
    // If no body provided, default to empty object
    body = {}
  }

  const force = body.force === true

  const publishToGitHub = async (): Promise<Response> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(`${BACKEND_API_BASE_URL}/v1/analyses/${analysisId}/publish-github`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-User-Id": userId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force }),
        cache: "no-store",
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  let backendResponse: Response
  try {
    backendResponse = await publishToGitHub()
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Request timeout", timeout_ms: TIMEOUT_MS }, { status: 504 })
    }
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 })
  }

  if (backendResponse.status === 403) {
    await refreshDashboardAuth(request)
    try {
      backendResponse = await publishToGitHub()
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return NextResponse.json({ error: "Request timeout", timeout_ms: TIMEOUT_MS }, { status: 504 })
      }
      return NextResponse.json({ error: "Backend unavailable" }, { status: 502 })
    }
  }

  const rawBackendBody = await backendResponse.text()
  let parsedBackendBody: PublishGitHubResponse | { error?: string; detail?: string } = {}
  if (rawBackendBody) {
    try {
      parsedBackendBody = JSON.parse(rawBackendBody) as PublishGitHubResponse
    } catch {
      parsedBackendBody = { detail: rawBackendBody }
    }
  }

  return NextResponse.json(parsedBackendBody, { status: backendResponse.status })
}
