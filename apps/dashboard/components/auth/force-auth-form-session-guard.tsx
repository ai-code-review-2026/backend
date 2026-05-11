"use client"

import { useEffect, useMemo, useRef } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { usePathname, useSearchParams } from "next/navigation"

function buildRedirectUrl(pathname: string, searchParams: URLSearchParams): string {
  const nextParams = new URLSearchParams(searchParams.toString())
  nextParams.delete("prompt")
  const serialized = nextParams.toString()
  return serialized ? `${pathname}?${serialized}` : pathname
}

export function ForceAuthFormSessionGuard() {
  const { isLoaded, userId } = useAuth()
  const { signOut } = useClerk()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const didRequestSignOut = useRef(false)

  const shouldForcePromptLogin = useMemo(() => searchParams.get("prompt") === "login", [searchParams])

  useEffect(() => {
    if (!shouldForcePromptLogin || !isLoaded || !userId || didRequestSignOut.current) {
      return
    }

    didRequestSignOut.current = true
    const redirectUrl = buildRedirectUrl(pathname, searchParams)
    void signOut({ redirectUrl })
  }, [isLoaded, pathname, searchParams, shouldForcePromptLogin, signOut, userId])

  return null
}
