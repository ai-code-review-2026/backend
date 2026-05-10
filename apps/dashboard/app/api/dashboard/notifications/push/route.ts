import { auth } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

const BACKEND = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export async function POST(req: NextRequest) {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body?.token || !body?.platform)
    return NextResponse.json({ error: "token and platform required" }, { status: 400 })
  try {
    const res = await fetch(`${BACKEND}/v1/mobile/push/subscribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token: body.token, platform: body.platform }),
      signal: AbortSignal.timeout(5000),
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ success: false }, { status: 503 })
  }
}

export async function DELETE(req: NextRequest) {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const t = new URL(req.url).searchParams.get("token")
  if (!t) return NextResponse.json({ error: "token required" }, { status: 400 })
  try {
    const res = await fetch(`${BACKEND}/v1/mobile/push/unsubscribe?token=${encodeURIComponent(t)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ success: false })
  }
}
