import { NextRequest, NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

// GET /api/dashboard/rag/agents/status
export async function GET(request: NextRequest) {
  const authResult = await requireBackendAuth()
  if (!authResult.ok) {
    return authResult.response
  }

  try {
    return proxyBackendRequest({
      path: "/api/v1/rag/agents/status",
      method: "GET",
      token: authResult.token,
      userId: authResult.userId,
    })
  } catch (error) {
    console.error("Error getting agents status:", error)
    return NextResponse.json(
      { error: "Failed to get agents status" },
      { status: 500 }
    )
  }
}
