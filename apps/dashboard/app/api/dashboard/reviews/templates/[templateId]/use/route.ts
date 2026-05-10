import { NextRequest, NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await context.params
  if (!templateId || templateId.trim().length === 0) {
    return NextResponse.json({ error: "Invalid template id" }, { status: 400 })
  }

  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  return proxyBackendRequest({
    method: "POST",
    path: `/api/v1/reviews/templates/${encodeURIComponent(templateId.trim())}/use`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
