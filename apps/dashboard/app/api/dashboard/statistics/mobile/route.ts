import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const EMPTY = { total_analyses:0, completed_analyses:0, pending_analyses:0, findings_this_week:0, approved_prs:0, return_prs:0 }

export async function GET() {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) return NextResponse.json(EMPTY)
  try {
    const res = await fetch(`${BACKEND}/v1/statistics?time_range=7d`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return NextResponse.json(EMPTY)
    const d = await res.json()
    const q = d.quality_metrics || {}
    return NextResponse.json({
      total_analyses:     q.total_analyses              ?? 0,
      completed_analyses: q.completed_analyses          ?? 0,
      pending_analyses:   q.pending_analyses            ?? 0,
      findings_this_week: q.total_findings              ?? 0,
      approved_prs:       q.approved_count              ?? 0,
      return_prs:         q.changes_requested_count     ?? 0,
    })
  } catch {
    return NextResponse.json(EMPTY)
  }
}
