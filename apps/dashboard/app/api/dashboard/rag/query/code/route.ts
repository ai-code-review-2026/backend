import { NextRequest, NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

// POST /api/dashboard/rag/query/code
export async function POST(request: NextRequest) {
  const authResult = await requireBackendAuth()
  if (!authResult.ok) {
    return authResult.response
  }

  try {
    const body = await request.json().catch(() => ({}))
    return proxyBackendRequest({
      path: "/api/v1/rag/query/code",
      method: "POST",
      token: authResult.token,
      userId: authResult.userId,
      body,
    })
  } catch (error) {
    console.error("Error querying code context:", error)
    return NextResponse.json(
      { error: "Failed to query code context" },
      { status: 500 }
    )
  }
}
