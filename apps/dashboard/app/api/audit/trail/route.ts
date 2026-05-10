import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

// GET /api/audit/trail
export async function GET(request: NextRequest) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    
    // Get auth info for backend request
    const authResult = await requireBackendAuth()
    if (!authResult.ok) {
      return authResult.response
    }

    // Proxy request to backend with query parameters
    const queryString = searchParams.toString()
    const response = await proxyBackendRequest({
      path: `/api/v1/audit/trail?${queryString}`,
      method: "GET",
      token: authResult.token,
      userId: authResult.userId
    })

    return response

  } catch (error) {
    console.error("Audit trail error:", error)
    return NextResponse.json(
      { error: "Failed to fetch audit trail" },
      { status: 500 }
    )
  }
}