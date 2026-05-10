import { NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await context.params
  if (!tokenId || tokenId.trim().length === 0) {
    return NextResponse.json({ error: "Invalid token id" }, { status: 400 })
  }

  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  return proxyBackendRequest({
    method: "DELETE",
    path: `/api/v1/reviews/vscode-tokens/${encodeURIComponent(tokenId)}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}

