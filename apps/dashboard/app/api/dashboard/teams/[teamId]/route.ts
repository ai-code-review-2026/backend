import { NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ teamId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  try {
    const { teamId } = await context.params
    const body = await request.json()
    return proxyBackendRequest({
      method: "PATCH",
      path: `/api/v1/teams/${encodeURIComponent(teamId)}`,
      token: authContext.token,
      userId: authContext.userId,
      body,
    })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ teamId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { teamId } = await context.params

  return proxyBackendRequest({
    method: "GET",
    path: `/api/v1/teams/${encodeURIComponent(teamId)}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ teamId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { teamId } = await context.params

  return proxyBackendRequest({
    method: "DELETE",
    path: `/api/v1/teams/${encodeURIComponent(teamId)}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
