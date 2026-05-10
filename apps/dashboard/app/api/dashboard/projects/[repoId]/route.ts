import { auth } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

const BACKEND_FETCH_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS ?? "15000") || 15_000,
)

type BackendAnalysisDetails = {
  analysis_id?: string
  project_id?: string | null
  repo?: string | null
}

type FetchBackendResult =
  | { ok: true; response: Response }
  | { ok: false; timeout: true }

async function fetchBackendWithTimeout(
  path: string,
  headers: Record<string, string>,
): Promise<FetchBackendResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(`${BACKEND_API_BASE_URL}${path}`, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    })
    return { ok: true, response }
  } catch {
    return { ok: false, timeout: true }
  } finally {
    clearTimeout(timeout)
  }
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/projects/{repoId}
 *
 * Proxies backend project details and supports backward-compatibility:
 * if the provided id is actually an analysis_id, resolve it to project_id.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ repoId: string }> },
) {
  const { userId, getToken } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getToken()
  if (!token) {
    return NextResponse.json({ error: "Missing Clerk token" }, { status: 401 })
  }

  const { repoId: rawResourceId } = await context.params
  const resourceId = readNonEmptyString(rawResourceId)
  if (!resourceId) {
    return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
  }

  const backendHeaders = {
    Authorization: `Bearer ${token}`,
    "X-User-Id": userId,
    Accept: "application/json",
  }

  const fetchProjectDetails = async (projectId: string): Promise<FetchBackendResult> =>
    fetchBackendWithTimeout(
      `/api/v1/projects/${encodeURIComponent(projectId)}/details`,
      backendHeaders,
    )

  const firstProjectDetails = await fetchProjectDetails(resourceId)
  if (!firstProjectDetails.ok) {
    return NextResponse.json(
      { error: "Backend timeout while fetching project details" },
      { status: 504 },
    )
  }

  if (firstProjectDetails.response.ok) {
    const body = await firstProjectDetails.response.json().catch(() => null)
    if (!body) {
      return NextResponse.json(
        { error: "Invalid response from backend" },
        { status: 502 },
      )
    }
    return NextResponse.json(body, { status: 200 })
  }

  if (firstProjectDetails.response.status !== 404) {
    return NextResponse.json(
      { error: "Failed to fetch project details" },
      { status: firstProjectDetails.response.status },
    )
  }

  // Backward compatibility:
  // some old dashboard links used analysis_id in /dashboard/projects/{id}.
  const analysisLookup = await fetchBackendWithTimeout(
    `/v1/analyses/${encodeURIComponent(resourceId)}`,
    backendHeaders,
  )
  if (!analysisLookup.ok) {
    return NextResponse.json(
      { error: "Backend timeout while resolving analysis to project" },
      { status: 504 },
    )
  }

  if (!analysisLookup.response.ok) {
    if (analysisLookup.response.status === 404) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    return NextResponse.json(
      { error: "Failed to resolve project details" },
      { status: analysisLookup.response.status },
    )
  }

  const analysisPayload = (await analysisLookup.response.json().catch(() => null)) as BackendAnalysisDetails | null
  const resolvedProjectId = readNonEmptyString(analysisPayload?.project_id)
  const fallbackRepoId = readNonEmptyString(analysisPayload?.repo)
  const resolvedProjectOrRepoId = resolvedProjectId ?? fallbackRepoId
  if (!resolvedProjectOrRepoId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const resolvedProjectDetails = await fetchProjectDetails(resolvedProjectOrRepoId)
  if (!resolvedProjectDetails.ok) {
    return NextResponse.json(
      { error: "Backend timeout while fetching resolved project details" },
      { status: 504 },
    )
  }

  if (!resolvedProjectDetails.response.ok) {
    if (resolvedProjectDetails.response.status === 404) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    return NextResponse.json(
      { error: "Failed to fetch project details" },
      { status: resolvedProjectDetails.response.status },
    )
  }

  const resolvedBody = await resolvedProjectDetails.response.json().catch(() => null)
  if (!resolvedBody) {
    return NextResponse.json(
      { error: "Invalid response from backend" },
      { status: 502 },
    )
  }

  return NextResponse.json(
    {
      ...resolvedBody,
      resolved_project_id: resolvedProjectOrRepoId,
      requested_id: resourceId,
    },
    { status: 200 },
  )
}
