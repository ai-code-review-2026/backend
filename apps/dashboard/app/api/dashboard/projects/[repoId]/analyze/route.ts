import { NextRequest, NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

// POST /api/dashboard/projects/[repoId]/analyze
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
    const body = await request.json().catch(() => ({}))
    return proxyBackendRequest({
      path: `/api/v1/projects/${repoId}/analyze`,
      method: "POST",
      token: authResult.token,
      userId: authResult.userId,
      body,
    })
  } catch (error) {
    console.error("Error starting project analysis:", error)
    return NextResponse.json(
      { error: "Failed to start project analysis" },
      { status: 500 }
    )
  }
}
