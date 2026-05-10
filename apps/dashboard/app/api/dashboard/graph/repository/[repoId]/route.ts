import { auth } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

const BACKEND_FETCH_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS ?? "30000") || 30_000,
)

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/graph/repository/[repoId]
 *
 * Proxies the backend repository graph endpoint with Clerk authentication.
 * Query params: include_chunks, limit
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> },
) {
  const { userId, getToken } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getToken()
  if (!token) {
    return NextResponse.json({ error: "Missing Clerk token" }, { status: 401 })
  }

  const { repoId } = await params

  const searchParams = request.nextUrl.searchParams
  const includeChunks = searchParams.get("include_chunks") ?? "false"
  const limit = searchParams.get("limit") ?? "1000"

  const backendParams = new URLSearchParams({ include_chunks: includeChunks, limit })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS)

  try {
    const backendResponse = await fetch(
      `${BACKEND_API_BASE_URL}/api/v1/graph/repository/${encodeURIComponent(repoId)}?${backendParams.toString()}`,
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

    if (!backendResponse.ok) {
      const errorBody = await backendResponse.text()
      console.error("[dashboard/graph/repository][GET] backend error", {
        status: backendResponse.status,
        body: errorBody,
      })
      return NextResponse.json(
        { error: "Failed to fetch repository graph", detail: errorBody },
        { status: backendResponse.status },
      )
    }

    const data = await backendResponse.json()
    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    console.error("[dashboard/graph/repository][GET] error:", error)
    return NextResponse.json(
      { error: "Backend timeout while fetching repository graph" },
      { status: 504 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
