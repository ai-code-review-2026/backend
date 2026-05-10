"use client"

import { useEffect, useMemo, useRef } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { usePathname, useSearchParams } from "next/navigation"

const CLERK_INVITATION_QUERY_KEYS = ["__clerk_ticket", "__clerk_invitation_token"] as const

function hasInvitationToken(searchParams: URLSearchParams): boolean {
  return CLERK_INVITATION_QUERY_KEYS.some((key) => {
    const value = searchParams.get(key)
    return typeof value === "string" && value.trim().length > 0
  })
}

export function LocalInvitationSessionGuard() {
  const { isLoaded, userId } = useAuth()
  const { signOut } = useClerk()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const didRequestSignOut = useRef(false)

  const serializedSearchParams = searchParams.toString()
  const shouldHandleInvitation = useMemo(() => {
    // Always handle invitation tokens - sign out existing session so
    // the invited user can create their own account/session
    return hasInvitationToken(searchParams)
  }, [searchParams])

  useEffect(() => {
    if (!shouldHandleInvitation || !isLoaded || !userId || didRequestSignOut.current) {
      return
    }

    didRequestSignOut.current = true
    const redirectUrl = serializedSearchParams ? `${pathname}?${serializedSearchParams}` : pathname
    void signOut({ redirectUrl })
  }, [isLoaded, pathname, serializedSearchParams, shouldHandleInvitation, signOut, userId])

  return null
}
