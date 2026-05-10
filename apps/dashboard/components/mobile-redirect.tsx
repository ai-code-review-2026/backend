'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'

export function MobileRedirect() {
  const router = useRouter()
  const pathname = usePathname()
  const { isLoaded, isSignedIn } = useAuth()

  useEffect(() => {
    const check = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return
        if (!isLoaded) return

        const isEntryRoute = pathname === '/' || pathname === '/landing'
        if (!isEntryRoute) return

        if (isSignedIn) {
          router.replace('/mobile/prs')
        } else {
          router.replace('/sign-in')
        }
      } catch {
        // Not running in Capacitor context
      }
    }
    check()
  }, [isLoaded, isSignedIn, pathname, router])

  return null
}
