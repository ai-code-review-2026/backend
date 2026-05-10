import { NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export async function GET() {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }
  return proxyBackendRequest({
    method: "GET",
    path: "/api/v1/reviews/vscode-tokens",
    token: authContext.token,
    userId: authContext.userId,
  })
}

export async function POST(request: Request) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  let payload: unknown = {}
  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  if (payload !== null && typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  return proxyBackendRequest({
    method: "POST",
    path: "/api/v1/reviews/vscode-tokens",
    token: authContext.token,
    userId: authContext.userId,
    body: payload,
  })
}

