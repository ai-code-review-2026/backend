import { NextRequest, NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

function templatesPath(request: NextRequest): string {
  const query = request.nextUrl.searchParams.toString()
  return query.length > 0 ? `/api/v1/reviews/templates?${query}` : "/api/v1/reviews/templates"
}

export async function GET(request: NextRequest) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  return proxyBackendRequest({
    method: "GET",
    path: templatesPath(request),
    token: authContext.token,
    userId: authContext.userId,
  })
}

export async function POST(request: NextRequest) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  return proxyBackendRequest({
    method: "POST",
    path: "/api/v1/reviews/templates",
    token: authContext.token,
    userId: authContext.userId,
    body,
  })
}
