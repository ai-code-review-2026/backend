import { NextRequest, NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

// POST /api/dashboard/rag/query/documentation
export async function POST(request: NextRequest) {
  const authResult = await requireBackendAuth()
  if (!authResult.ok) {
    return authResult.response
  }

  try {
    const body = await request.json().catch(() => ({}))
    return proxyBackendRequest({
      path: "/api/v1/rag/query/documentation",
      method: "POST",
      token: authResult.token,
      userId: authResult.userId,
      body,
    })
  } catch (error) {
    console.error("Error querying documentation:", error)
    return NextResponse.json(
      { error: "Failed to query documentation" },
      { status: 500 }
    )
  }
}
