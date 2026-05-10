import { NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export async function GET() {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }
  return proxyBackendRequest({
    method: "GET",
    path: "/v1/admin/policies",
    token: authContext.token,
    userId: authContext.userId,
  })
}

export async function PUT(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  return proxyBackendRequest({
    method: "PUT",
    path: "/v1/admin/policies",
    token: authContext.token,
    userId: authContext.userId,
    body: payload,
  })
}
