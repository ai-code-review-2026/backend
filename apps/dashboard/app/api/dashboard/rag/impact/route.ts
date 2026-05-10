import { NextRequest, NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

const EMPTY_RAG_IMPACT = {
  total_analyses: 0,
  analyses_with_rag: 0,
  analyses_without_rag: 0,
  with_rag: {
    avg_findings: 0,
    avg_blocker: 0,
    avg_warn: 0,
    avg_llm_findings: 0,
    avg_kb_chunks: 0,
  },
  without_rag: {
    avg_findings: 0,
    avg_blocker: 0,
    avg_warn: 0,
    avg_llm_findings: 0,
    avg_kb_chunks: 0,
  },
  impact: {
    findings_delta: 0,
    llm_findings_delta: 0,
  },
}

export async function GET(request: NextRequest) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }
  const url = new URL(request.url)
  const limit = url.searchParams.get("limit") ?? "200"
  const timeRange = url.searchParams.get("timeRange")
  const queryParams = new URLSearchParams({
    limit,
    ...(timeRange ? { time_range: timeRange } : {}),
  })

  const proxied = await proxyBackendRequest({
    method: "GET",
    path: `/v1/reviews/metrics/rag-impact?${queryParams.toString()}`,
    token: authContext.token,
    userId: authContext.userId,
  })

  if (proxied.status >= 500 || proxied.status === 502) {
    return NextResponse.json(EMPTY_RAG_IMPACT, { status: 200 })
  }

  return proxied
}
