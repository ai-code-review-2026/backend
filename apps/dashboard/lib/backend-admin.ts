import "server-only"

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { getBackendApiUrl } from "@/lib/backend-url"

const BACKEND_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS ?? "15000") || 15_000,
)

type AuthContext =
  | {
      ok: true
      userId: string
      token: string
    }
  | {
      ok: false
      response: NextResponse
    }

type ProxyOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  token: string
  userId: string
  body?: unknown
  timeoutMs?: number
}

function isHtmlPayload(rawBody: string, contentType: string | null): boolean {
  const normalized = rawBody.trim().toLowerCase()
  return (
    (contentType ?? "").toLowerCase().includes("text/html") ||
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html")
  )
}

export async function requireBackendAuth(): Promise<AuthContext> {
  try {
    const { userId, getToken } = await auth()
    if (!userId) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      }
    }
    const token = await getToken()
    if (!token) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Missing Clerk token" }, { status: 401 }),
      }
    }
    return {
      ok: true,
      userId,
      token,
    }
  } catch (error) {
    console.error("[backend-auth] Failed to resolve Clerk auth context", error)
    return {
      ok: false,
      response: NextResponse.json({ error: "Unable to resolve authentication" }, { status: 401 }),
    }
  }
}

export async function proxyBackendRequest(options: ProxyOptions): Promise<NextResponse> {
  const { method, path, token, userId, body, timeoutMs } = options
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? BACKEND_TIMEOUT_MS)

  try {
    const response = await fetch(getBackendApiUrl(path), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userId,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    })

    const rawBody = await response.text()
    const contentType = response.headers.get("content-type")
    let parsedBody: unknown = {}
    if (rawBody) {
      if (isHtmlPayload(rawBody, contentType)) {
        parsedBody = {
          error:
            "Backend target returned HTML instead of JSON. Check BACKEND_API_URL / NEXT_PUBLIC_BACKEND_URL and ensure the backend is reachable.",
        }
      } else {
        try {
          parsedBody = JSON.parse(rawBody)
        } catch {
          parsedBody = { detail: rawBody }
        }
      }
    }
    return NextResponse.json(parsedBody, { status: response.status })
  } catch (error) {
    console.error(`[backend-proxy] ${method} ${path} failed`, error)
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
