import { auth } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const BACKEND_FETCH_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS ?? "15000") || 15_000,
)

type Branch = {
  id: string
  repo_id: string
  org_id: string | null
  branch_name: string
  branch_type: string
  branch_pattern: string | null
  last_commit_sha: string | null
  last_commit_author: string | null
  last_commit_message: string | null
  last_commit_at: string | null
  created_by: string | null
  created_at: string
  base_branch: string | null
  merged_into: string | null
  merge_status: string | null
  merged_at: string | null
  merged_by: string | null
  is_protected: boolean
  is_default: boolean
  is_active: boolean
  ahead_count: number
  behind_count: number
  last_synced_at: string | null
  description: string | null
  metadata_json: Record<string, unknown>
  updated_at: string
}

type BranchListResponse = {
  branches: Branch[]
  total: number
  page: number
  limit: number
}

type CreateBranchBody = {
  repo_id: string
  org_id?: string | null
  branch_name: string
  branch_type: string
  base_branch?: string | null
  description?: string | null
  is_protected?: boolean
  is_default?: boolean
}

/**
 * GET /api/dashboard/branches
 * List branches with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, getToken } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getToken()
    const searchParams = request.nextUrl.searchParams

    // Build query string for backend
    const params = new URLSearchParams()

    const repoId = searchParams.get("repo_id")
    if (repoId) params.set("repo_id", repoId)

    const orgId = searchParams.get("org_id")
    if (orgId) params.set("org_id", orgId)

    const branchType = searchParams.get("branch_type")
    if (branchType) params.set("branch_type", branchType)

    const isProtected = searchParams.get("is_protected")
    if (isProtected) params.set("is_protected", isProtected)

    const isActive = searchParams.get("is_active")
    if (isActive) params.set("is_active", isActive)

    const page = searchParams.get("page") || "1"
    params.set("page", page)

    const limit = searchParams.get("limit") || "50"
    params.set("limit", limit)

    const backendUrl = `${BACKEND_API_BASE_URL}/v1/branches?${params.toString()}`

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
        console.error("Backend error fetching branches:", errorData)
        return NextResponse.json(
          { error: errorData.message || "Failed to fetch branches" },
          { status: response.status }
        )
      }

      const data: BranchListResponse = await response.json()
      return NextResponse.json(data)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json({ error: "Request timeout" }, { status: 504 })
      }
      throw fetchError
    }
  } catch (error) {
    console.error("Error in branches GET:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/dashboard/branches
 * Create a new branch
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, getToken } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getToken()
    const body: CreateBranchBody = await request.json()

    // Validate required fields
    if (!body.repo_id || !body.branch_name || !body.branch_type) {
      return NextResponse.json(
        { error: "Missing required fields: repo_id, branch_name, branch_type" },
        { status: 400 }
      )
    }

    // Validate branch type
    const validTypes = ["main", "develop", "feature", "hotfix", "release", "custom"]
    if (!validTypes.includes(body.branch_type)) {
      return NextResponse.json(
        { error: `Invalid branch_type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      )
    }

    const backendUrl = `${BACKEND_API_BASE_URL}/v1/branches`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS)

    try {
      const response = await fetch(backendUrl, {
        method: "POST",
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
        console.error("Backend error creating branch:", errorData)
        return NextResponse.json(
          { error: errorData.message || errorData.detail?.message || "Failed to create branch" },
          { status: response.status }
        )
      }

      const data = await response.json()
      return NextResponse.json(data, { status: 201 })
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json({ error: "Request timeout" }, { status: 504 })
      }
      throw fetchError
    }
  } catch (error) {
    console.error("Error in branches POST:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
