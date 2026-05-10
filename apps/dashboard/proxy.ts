import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import {
  buildPathWithForwardedClerkAuthParams,
  hasClerkInvitationToken,
} from "@/lib/clerk-invitation"

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/auth/role-redirect(.*)"])
const isInvitationAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/accept-invitation(.*)"])
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim())

const protectedProxy = clerkMiddleware(async (auth, req) => {
  const hasInvitationToken = hasClerkInvitationToken(req.nextUrl.searchParams)
  if (hasInvitationToken && !isInvitationAuthRoute(req)) {
    const acceptInvitePath = buildPathWithForwardedClerkAuthParams("/accept-invitation", req.nextUrl.searchParams)
    return NextResponse.redirect(new URL(acceptInvitePath, req.url))
  }

  if (isProtectedRoute(req)) {
    await auth.protect()
  }

  return NextResponse.next()
})

export default function proxy(...args: Parameters<typeof protectedProxy>) {
  if (!clerkEnabled) {
    return NextResponse.next()
  }

  return protectedProxy(...args)
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
