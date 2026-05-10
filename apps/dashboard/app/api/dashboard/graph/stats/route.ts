import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

const BACKEND_FETCH_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS ?? "15000") || 15_000,
)

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/graph/stats
 *
 * Proxies the backend graph statistics endpoint with Clerk authentication.
 */
export async function GET() {
  const { userId, getToken } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getToken()
  if (!token) {
    return NextResponse.json({ error: "Missing Clerk token" }, { status: 401 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS)

  try {
    const backendResponse = await fetch(`${BACKEND_API_BASE_URL}/api/v1/graph/stats`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userId,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    })

    if (!backendResponse.ok) {
      const errorBody = await backendResponse.text()
      console.error("[dashboard/graph/stats][GET] backend error", {
        status: backendResponse.status,
        body: errorBody,
      })
      return NextResponse.json(
        { error: "Failed to fetch graph stats", detail: errorBody },
        { status: backendResponse.status },
      )
    }

    const data = await backendResponse.json()
    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    console.error("[dashboard/graph/stats][GET] error:", error)
    return NextResponse.json({ error: "Backend timeout while fetching graph stats" }, { status: 504 })
  } finally {
    clearTimeout(timeout)
  }
}
