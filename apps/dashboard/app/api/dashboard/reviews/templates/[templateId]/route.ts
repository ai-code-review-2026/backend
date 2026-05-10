import { NextRequest, NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

function encodeTemplateId(templateId: string): string {
  return encodeURIComponent(templateId.trim())
}

export async function GET(
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
    method: "GET",
    path: `/api/v1/reviews/templates/${encodeTemplateId(templateId)}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}

export async function PATCH(
  request: NextRequest,
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

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  return proxyBackendRequest({
    method: "PATCH",
    path: `/api/v1/reviews/templates/${encodeTemplateId(templateId)}`,
    token: authContext.token,
    userId: authContext.userId,
    body,
  })
}

export async function DELETE(
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
    method: "DELETE",
    path: `/api/v1/reviews/templates/${encodeTemplateId(templateId)}`,
    token: authContext.token,
    userId: authContext.userId,
  })
}
