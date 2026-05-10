import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const FALLBACK = { status:"down", queue_depth:0, failure_rate:0, active_workers:0,
  analyses_last_hour:0, avg_analysis_duration_s:0, neo4j_connected:false,
  redis_connected:false, celery_workers_online:0, pending_analyses:0, running_analyses:0 }

export async function GET() {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const res = await fetch(`${BACKEND}/v1/mobile/health`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    return NextResponse.json(res.ok ? await res.json() : FALLBACK)
  } catch {
    return NextResponse.json(FALLBACK)
  }
}
