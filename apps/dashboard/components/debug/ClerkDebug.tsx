// Debug component to check Clerk authentication status
"use client"

import { useAuth, useUser } from "@clerk/nextjs"
import { useEffect, useState } from "react"

export function ClerkDebug() {
  const { isLoaded, userId, sessionId, getToken } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const [tokenInfo, setTokenInfo] = useState<any>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded && userId) {
      getToken()
        .then(token => {
          setTokenInfo({
            token: token?.substring(0, 50) + "...",
            length: token?.length || 0
          })
        })
        .catch(err => {
          setTokenError(err.message)
        })
    }
  }, [isLoaded, userId, getToken])

  if (!isLoaded || !userLoaded) {
    return <div className="p-4 bg-gray-100 rounded">Loading auth state...</div>
  }

  return (
    <div className="p-4 bg-gray-100 rounded mb-4">
      <h3 className="font-bold mb-2">Clerk Debug Info:</h3>
      <div className="space-y-1 text-sm">
        <p><strong>User ID:</strong> {userId || "Not authenticated"}</p>
        <p><strong>Session ID:</strong> {sessionId || "No session"}</p>
        <p><strong>User Email:</strong> {user?.primaryEmailAddress?.emailAddress || "No email"}</p>
        <p><strong>Token Info:</strong> {tokenInfo ? `${tokenInfo.token} (${tokenInfo.length} chars)` : "No token"}</p>
        {tokenError && (
          <p className="text-red-600"><strong>Token Error:</strong> {tokenError}</p>
        )}
      </div>
    </div>
  )
}