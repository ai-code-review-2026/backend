import { NextRequest, NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

// GET /api/dashboard/projects/[repoId]/context/status
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ repoId: string }> },
) {
  const authResult = await requireBackendAuth()
  if (!authResult.ok) {
    return authResult.response
  }

  try {
    const { repoId } = await context.params
    return proxyBackendRequest({
      path: `/api/v1/projects/${repoId}/context/status`,
      method: "GET",
      token: authResult.token,
      userId: authResult.userId,
    })
  } catch (error) {
    console.error("Error fetching context status:", error)
    return NextResponse.json(
      { error: "Failed to fetch context status" },
      { status: 500 }
    )
  }
}

// POST /api/dashboard/projects/[repoId]/context/refresh
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ repoId: string }> },
) {
  const authResult = await requireBackendAuth()
  if (!authResult.ok) {
    return authResult.response
  }

  try {
    const { repoId } = await context.params
    return proxyBackendRequest({
      path: `/api/v1/projects/${repoId}/context/refresh`,
      method: "POST",
      token: authResult.token,
      userId: authResult.userId,
    })
  } catch (error) {
    console.error("Error refreshing project context:", error)
    return NextResponse.json(
      { error: "Failed to refresh project context" },
      { status: 500 }
    )
  }
}
