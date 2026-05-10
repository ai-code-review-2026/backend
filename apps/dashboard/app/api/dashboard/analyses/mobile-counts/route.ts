import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export async function GET() {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) return NextResponse.json({})
  try {
    const res = await fetch(`${BACKEND}/v1/mobile/analyses/counts`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    return NextResponse.json(res.ok ? await res.json() : {})
  } catch {
    return NextResponse.json({})
  }
}
