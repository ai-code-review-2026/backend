import { NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: analysisId } = await context.params
  if (!analysisId || analysisId.trim().length === 0) {
    return NextResponse.json({ error: "Invalid analysis id" }, { status: 400 })
  }

  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }
  return proxyBackendRequest({
    method: "POST",
    path: `/v1/admin/observability/jobs/${encodeURIComponent(analysisId)}/retry`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
