import { NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * GET /api/reviews/comments
 * 
 * Fetches review comments for a specific analysis.
 */
export async function GET(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const { searchParams } = new URL(request.url)
  const analysisId = searchParams.get("analysis_id")
  
  if (!analysisId) {
    return NextResponse.json({ error: "analysis_id is required" }, { status: 400 })
  }

  return proxyBackendRequest({
    method: "GET",
    path: `/api/v1/reviews/comments?analysis_id=${encodeURIComponent(analysisId)}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}

/**
 * POST /api/reviews/comments
 * 
 * Create a new review comment.
 */
export async function POST(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  try {
    const body = await request.json()
    return proxyBackendRequest({
      method: "POST",
      path: "/api/v1/reviews/comments",
      token: authContext.token,
      userId: authContext.userId,
      body,
    })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
