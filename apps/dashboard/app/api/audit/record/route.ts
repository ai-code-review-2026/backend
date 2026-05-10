import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

// POST /api/audit/record
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const auditData = await request.json()
    
    // Add request metadata
    const clientIP = request.headers.get("x-forwarded-for") || 
                     request.headers.get("x-real-ip") || 
                     "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    // Get auth info for backend request
    const authResult = await requireBackendAuth()
    if (!authResult.ok) {
      return authResult.response
    }

    // Record audit action via backend
    const response = await proxyBackendRequest({
      path: "/api/v1/audit/record",
      method: "POST",
      data: {
        ...auditData,
        actor_id: userId,
        actor_email: authResult.userEmail,
        ip_address: clientIP,
        user_agent: userAgent,
        timestamp: new Date().toISOString()
      },
      token: authResult.token,
      userId: authResult.userId
    })

    return response

  } catch (error) {
    console.error("Audit record error:", error)
    return NextResponse.json(
      { error: "Failed to record audit action" },
      { status: 500 }
    )
  }
}