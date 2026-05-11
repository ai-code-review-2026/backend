import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET(request: Request) {
  const store = await cookies()
  const response = NextResponse.redirect(new URL("/sign-in?prompt=login", request.url))

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate")

  for (const cookie of store.getAll()) {
    response.cookies.set(cookie.name, "", {
      expires: new Date(0),
      maxAge: 0,
      path: "/",
    })
  }

  return response
}
