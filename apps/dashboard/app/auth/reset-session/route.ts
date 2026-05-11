import { NextResponse } from "next/server"
import { cookies } from "next/headers"

function shouldClearCookie(name: string) {
  const normalized = name.toLowerCase()

  return (
    normalized.startsWith("__clerk") ||
    normalized.startsWith("__client") ||
    normalized.startsWith("__session") ||
    normalized.includes("clerk") ||
    normalized.includes("session")
  )
}

export async function GET(request: Request) {
  const store = await cookies()
  const response = NextResponse.redirect(new URL("/sign-in", request.url))

  for (const cookie of store.getAll()) {
    if (!shouldClearCookie(cookie.name)) {
      continue
    }

    response.cookies.set(cookie.name, "", {
      expires: new Date(0),
      maxAge: 0,
      path: "/",
    })
  }

  return response
}
