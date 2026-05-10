import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const TIMEOUT_MS = parseInt(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS || "15000", 10)

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const queryString = searchParams.toString()
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const url = `${BACKEND_URL}/api/v1/observability/status${queryString ? `?${queryString}` : ""}`
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[Observability API] Backend error: ${response.status} ${errorText}`)
        return NextResponse.json(
          { error: `Failed to fetch observability status: ${response.statusText}` },
          { status: response.status }
        )
      }

      const data = await response.json()
      return NextResponse.json(data)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        console.error(`[Observability API] Request timeout after ${TIMEOUT_MS}ms`)
        return NextResponse.json(
          { error: "Request timeout" },
          { status: 504 }
        )
      }
      throw fetchError
    }
  } catch (error) {
    console.error("[Observability API] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}