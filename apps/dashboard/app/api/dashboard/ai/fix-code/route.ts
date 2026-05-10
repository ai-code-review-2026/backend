import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"

/**
 * POST /api/dashboard/ai/fix-code
 * 
 * Uses AI to suggest fixes for code issues.
 * Proxies to the backend AI service.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      filePath,
      content,
      language,
      findingId,
      findingDescription,
      context,
    } = body

    if (!filePath || !content) {
      return NextResponse.json(
        { error: "Missing required fields: filePath and content" },
        { status: 400 }
      )
    }

    const backendUrl =
      process.env.BACKEND_API_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "http://localhost:8000"

    // Call the backend AI fix endpoint
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000) // 60s timeout for AI

    try {
      const response = await fetch(`${backendUrl}/v1/ai/fix-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": userId,
        },
        body: JSON.stringify({
          file_path: filePath,
          content,
          language,
          finding_id: findingId,
          finding_description: findingDescription,
          context,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        // If backend doesn't have AI fix endpoint, provide a fallback response
        if (response.status === 404) {
          return NextResponse.json({
            fixedContent: null,
            message: "AI fix service is not available. Please configure LLM integration.",
            commitMessage: null,
          })
        }

        const errorData = await response.json().catch(() => ({}))
        return NextResponse.json(
          { error: errorData.detail || errorData.message || "AI fix failed" },
          { status: response.status }
        )
      }

      const data = await response.json()
      
      return NextResponse.json({
        fixedContent: data.fixed_content || data.fixedContent,
        message: data.message,
        commitMessage: data.commit_message || data.commitMessage,
        changes: data.changes,
      })
    } catch (fetchError) {
      clearTimeout(timeout)
      
      if ((fetchError as Error).name === "AbortError") {
        return NextResponse.json(
          { error: "AI fix request timed out" },
          { status: 504 }
        )
      }

      // If backend is not available, return a helpful message
      console.error("[AI Fix] Backend not available:", fetchError)
      return NextResponse.json({
        fixedContent: null,
        message: "AI fix service is temporarily unavailable. Please try again later.",
        commitMessage: null,
      })
    }
  } catch (error) {
    console.error("[AI Fix] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process AI fix request" },
      { status: 500 }
    )
  }
}
