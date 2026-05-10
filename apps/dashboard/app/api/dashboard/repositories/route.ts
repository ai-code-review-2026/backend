import { NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/repositories
 * Returns empty list when backend is unavailable.
 */
export async function GET(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const { searchParams } = new URL(request.url)
  const page = searchParams.get("page") || "1"
  const limit = searchParams.get("limit") || "20"
  const language = searchParams.get("language") || ""
  const visibility = searchParams.get("visibility") || ""
  const search = searchParams.get("search") || ""

  const queryParams = new URLSearchParams({
    page,
    limit,
    ...(language && { language }),
    ...(visibility && { visibility }),
    ...(search && { search }),
  })

  const proxied = await proxyBackendRequest({
    method: "GET",
    path: `/api/v1/repositories?${queryParams.toString()}`,
    token: authContext.token,
    userId: authContext.userId,
  })

  if (proxied.status >= 500 || proxied.status === 502) {
    return NextResponse.json({ items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20, pages: 1 }, { status: 200 })
  }

  const raw = (await proxied.json().catch(() => null)) as
    | { items?: unknown[]; total?: number; page?: number; limit?: number; pages?: number }
    | null

  const items = Array.isArray(raw?.items) ? raw.items : []
  const normalizedPage = typeof raw?.page === "number" ? raw.page : Number(page) || 1
  const normalizedLimit = typeof raw?.limit === "number" ? raw.limit : Number(limit) || 20
  const normalizedTotal = typeof raw?.total === "number" ? raw.total : items.length
  const normalizedPages =
    typeof raw?.pages === "number"
      ? raw.pages
      : Math.max(1, Math.ceil(normalizedTotal / Math.max(1, normalizedLimit)))

  return NextResponse.json(
    {
      ...(raw && typeof raw === "object" ? raw : {}),
      items,
      total: normalizedTotal,
      page: normalizedPage,
      limit: normalizedLimit,
      pages: normalizedPages,
    },
    { status: proxied.status },
  )
}

/**
 * POST /api/dashboard/repositories
 */
export async function POST(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  try {
    const body = await request.json()
    return proxyBackendRequest({
      method: "POST",
      path: "/api/v1/repositories",
      token: authContext.token,
      userId: authContext.userId,
      body,
    })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
