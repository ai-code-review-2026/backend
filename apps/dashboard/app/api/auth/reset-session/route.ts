import { cookies, headers } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const store = await cookies()
  const requestHeaders = await headers()
  const requestUrl = new URL(request.url)
  const forwardedProto = requestHeaders.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "")
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? requestUrl.host
  const response = NextResponse.redirect(new URL(`/sign-in/?prompt=login`, `${forwardedProto}://${forwardedHost}`))

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
