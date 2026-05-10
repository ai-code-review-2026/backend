import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const TIMEOUT_MS = parseInt(process.env.DASHBOARD_BACKEND_WRITE_TIMEOUT_MS || "30000", 10)

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ repoId: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { repoId } = await context.params
    const { searchParams } = new URL(request.url)
    const testQueries = searchParams.get("testQueries") || "5"

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/v1/rag/repos/${encodeURIComponent(repoId)}/evaluation?test_queries=${testQueries}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }
      )

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[RAG Evaluation API] Backend error: ${response.status} ${errorText}`)
        return NextResponse.json(
          { error: `Failed to evaluate RAG: ${response.statusText}` },
          { status: response.status }
        )
      }

      const data = await response.json()
      return NextResponse.json(data)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        console.error(`[RAG Evaluation API] Request timeout after ${TIMEOUT_MS}ms`)
        return NextResponse.json(
          { error: "Request timeout" },
          { status: 504 }
        )
      }
      throw fetchError
    }
  } catch (error) {
    console.error("[RAG Evaluation API] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ repoId: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { repoId } = await context.params

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/v1/rag/repos/${encodeURIComponent(repoId)}/benchmark`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }
      )

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[RAG Benchmark API] Backend error: ${response.status} ${errorText}`)
        return NextResponse.json(
          { error: `Failed to run benchmark: ${response.statusText}` },
          { status: response.status }
        )
      }

      const data = await response.json()
      return NextResponse.json(data)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        console.error(`[RAG Benchmark API] Request timeout after ${TIMEOUT_MS}ms`)
        return NextResponse.json(
          { error: "Request timeout" },
          { status: 504 }
        )
      }
      throw fetchError
    }
  } catch (error) {
    console.error("[RAG Benchmark API] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
