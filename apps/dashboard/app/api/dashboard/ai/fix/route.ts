import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const BACKEND_BASE_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const TIMEOUT_MS = parseInt(process.env.DASHBOARD_BACKEND_WRITE_TIMEOUT_MS || "30000", 10)

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/ai/fix-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${userId}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("Backend AI fix error:", response.status, errorText)
        return NextResponse.json(
          { error: `Fix failed: ${response.status}` },
          { status: response.status }
        )
      }

      const data = await response.json()
      return NextResponse.json(data)
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof Error && error.name === "AbortError") {
        return NextResponse.json(
          { error: "Request timeout" },
          { status: 408 }
        )
      }
      
      console.error("AI fix request failed:", error)
      return NextResponse.json(
        { error: "Failed to fix code" },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("AI fix request error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}