import { auth } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

const BACKEND_FETCH_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS ?? "15000") || 15_000,
)

export const dynamic = "force-dynamic"

type BackendProjectItem = {
  id?: string
  name?: string
  full_name?: string
  description?: string | null
  language?: string | null
  visibility?: string
  default_branch?: string
  status?: string
  team_id?: string | null
  team_name?: string | null
  member_count?: number
  health_score?: number
  analysis_count?: number
  last_analysis_at?: string | null
  created_at?: string
  updated_at?: string
}

type DashboardProjectItem = {
  id: string
  name: string
  repo: string
  description: string | null
  language: string | null
  visibility: string
  defaultBranch: string
  status: string
  team: string | null
  memberCount: number
  healthScore: number
  analysisCount: number
  lastAnalysisAt: string | null
  createdAt: string
  updatedAt: string
}

function normalizeProject(raw: BackendProjectItem): DashboardProjectItem | null {
  const id = raw.id?.trim() ?? ""
  const name = raw.name?.trim() ?? ""
  const repo = raw.full_name?.trim() ?? ""
  if (!id) return null
  return {
    id,
    name: name || repo || id,
    repo,
    description: raw.description ?? null,
    language: raw.language ?? null,
    visibility: raw.visibility ?? "private",
    defaultBranch: raw.default_branch ?? "main",
    status: raw.status ?? "active",
    team: raw.team_name ?? null,
    memberCount: raw.member_count ?? 0,
    healthScore: raw.health_score ?? 0,
    analysisCount: raw.analysis_count ?? 0,
    lastAnalysisAt: raw.last_analysis_at ?? null,
    createdAt: raw.created_at ?? "",
    updatedAt: raw.updated_at ?? "",
  }
}

async function parseBackendBody(response: Response): Promise<unknown> {
  const rawBody = await response.text()
  if (!rawBody) {
    return {}
  }
  try {
    return JSON.parse(rawBody)
  } catch {
    return { detail: rawBody }
  }
}

/**
 * GET /api/dashboard/projects
 *
 * Proxies the backend project list endpoint with Clerk authentication.
 * Query params: page (default 1), limit (default 100), search, team_id, status
 */
export async function GET(request: NextRequest) {
  const { userId, getToken } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getToken()
  if (!token) {
    return NextResponse.json({ error: "Missing Clerk token" }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const page = searchParams.get("page") ?? "1"
  const limit = searchParams.get("limit") ?? searchParams.get("size") ?? "100"
  const search = searchParams.get("search")
  const teamId = searchParams.get("team_id")
  const status = searchParams.get("status")

  const backendParams = new URLSearchParams({ page, limit })
  if (search) backendParams.set("search", search)
  if (teamId) backendParams.set("team_id", teamId)
  if (status) backendParams.set("status", status)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS)

  let backendResponse: Response
  try {
    backendResponse = await fetch(
      `${BACKEND_API_BASE_URL}/api/v1/projects?${backendParams.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-User-Id": userId,
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      },
    )
  } catch {
    return NextResponse.json(
      { error: "Backend timeout while fetching projects", items: [], total: 0 },
      { status: 504 },
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!backendResponse.ok) {
    // Return empty list gracefully instead of propagating backend errors,
    // so the UI can still display an empty project selector.
    return NextResponse.json({ items: [], total: 0 }, { status: 200 })
  }

  let rawBody: unknown
  try {
    rawBody = await backendResponse.json()
  } catch {
    return NextResponse.json({ items: [], total: 0 }, { status: 200 })
  }

  const rawItems = Array.isArray((rawBody as { items?: unknown }).items)
    ? ((rawBody as { items: BackendProjectItem[] }).items)
    : []

  const items = rawItems
    .map(normalizeProject)
    .filter((p): p is DashboardProjectItem => p !== null)

  const total =
    typeof (rawBody as { total?: unknown }).total === "number"
      ? (rawBody as { total: number }).total
      : items.length

  return NextResponse.json({ items, total }, { status: 200 })
}

/**
 * POST /api/dashboard/projects
 *
 * Proxies project creation to backend with Clerk authentication.
 */
export async function POST(request: NextRequest) {
  const { userId, getToken } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getToken()
  if (!token) {
    return NextResponse.json({ error: "Missing Clerk token" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS)

  try {
    const backendResponse = await fetch(`${BACKEND_API_BASE_URL}/api/v1/projects`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    })

    const parsedBody = await parseBackendBody(backendResponse)
    if (!backendResponse.ok) {
      console.error("[dashboard/projects][POST] backend error", {
        status: backendResponse.status,
        body: parsedBody,
      })
    }
    return NextResponse.json(parsedBody, { status: backendResponse.status })
  } catch {
    return NextResponse.json({ error: "Backend timeout while creating project" }, { status: 504 })
  } finally {
    clearTimeout(timeout)
  }
}
