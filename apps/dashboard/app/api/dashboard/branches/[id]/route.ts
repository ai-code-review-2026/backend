import { auth } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const BACKEND_FETCH_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS ?? "15000") || 15_000,
)

type UpdateBranchBody = {
  description?: string | null
  is_protected?: boolean
  is_active?: boolean
}

/**
 * GET /api/dashboard/branches/[id]
 * Get a specific branch by ID
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, getToken } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getToken()
    const { id: branchId } = await context.params

    const backendUrl = `${BACKEND_API_BASE_URL}/v1/branches/${branchId}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS)

    try {
      const response = await fetch(backendUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return NextResponse.json(
          { error: errorData.message || "Branch not found" },
          { status: response.status }
        )
      }

      const data = await response.json()
      return NextResponse.json(data)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json({ error: "Request timeout" }, { status: 504 })
      }
      throw fetchError
    }
  } catch (error) {
    console.error("Error in branch GET:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/dashboard/branches/[id]
 * Update a branch
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, getToken } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getToken()
    const { id: branchId } = await context.params
    const body: UpdateBranchBody = await request.json()

    const backendUrl = `${BACKEND_API_BASE_URL}/v1/branches/${branchId}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS)

    try {
      const response = await fetch(backendUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return NextResponse.json(
          { error: errorData.message || "Failed to update branch" },
          { status: response.status }
        )
      }

      const data = await response.json()
      return NextResponse.json(data)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json({ error: "Request timeout" }, { status: 504 })
      }
      throw fetchError
    }
  } catch (error) {
    console.error("Error in branch PATCH:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/dashboard/branches/[id]
 * Delete a branch
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, getToken } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getToken()
    const { id: branchId } = await context.params
    const searchParams = request.nextUrl.searchParams
    const force = searchParams.get("force") === "true"

    const backendUrl = `${BACKEND_API_BASE_URL}/v1/branches/${branchId}${force ? "?force=true" : ""}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS)

    try {
      const response = await fetch(backendUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return NextResponse.json(
          { error: errorData.message || errorData.detail?.message || "Failed to delete branch" },
          { status: response.status }
        )
      }

      return new NextResponse(null, { status: 204 })
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json({ error: "Request timeout" }, { status: 504 })
      }
      throw fetchError
    }
  } catch (error) {
    console.error("Error in branch DELETE:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
