'use client'

import { useEffect, useState, createContext, useContext, ReactNode, useRef } from 'react'
import { initializeCapacitor, isNativePlatform, getPlatform } from '@/lib/capacitor'
import {
  registerPushNotifications,
  onPushReceived,
  onPushActionPerformed,
  handlePushNavigation,
} from '@/lib/capacitor-push'
import { useAuth } from '@clerk/nextjs'

interface CapacitorContextValue {
  isNative: boolean
  platform: string
  isReady: boolean
  pushEnabled: boolean
}

const CapacitorContext = createContext<CapacitorContextValue>({
  isNative: false,
  platform: 'web',
  isReady: false,
  pushEnabled: false,
})

export const useCapacitorContext = () => useContext(CapacitorContext)

export function CapacitorProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const { getToken, isSignedIn } = useAuth()
  const cleanupRef = useRef<(() => void)[]>([])

  // Authenticated API call helper
  const apiCall = async (endpoint: string, options?: RequestInit) => {
    const token = await getToken()
    return fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    })
  }

  useEffect(() => {
    async function init() {
      try {
        await initializeCapacitor()
      } catch (error) {
        console.error('Failed to initialize Capacitor:', error)
      } finally {
        setIsReady(true)
      }
    }
    init()
  }, [])

  // Register push notifications when user is signed in on native
  useEffect(() => {
    if (!isReady || !isSignedIn || !isNativePlatform()) return

    let active = true

    async function setupPush() {
      try {
        await registerPushNotifications(apiCall)
        if (!active) return
        setPushEnabled(true)

        // Handle incoming notification (foreground)
        const unsubReceived = await onPushReceived(notification => {
          console.log('[Push] Foreground notification:', notification.title)
          // Show in-app toast via a custom event
          window.dispatchEvent(new CustomEvent('mobile:push:received', { detail: notification }))
        })

        // Handle notification tap (background/killed)
        const unsubAction = await onPushActionPerformed(({ notification }) => {
          const data = notification.data || {}
          handlePushNavigation(data)
        })

        cleanupRef.current.push(unsubReceived, unsubAction)
      } catch (err) {
        console.error('[Push] Setup failed:', err)
      }
    }

    setupPush()

    return () => {
      active = false
      cleanupRef.current.forEach(fn => fn())
      cleanupRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, isSignedIn])

  const value: CapacitorContextValue = {
    isNative: isNativePlatform(),
    platform: getPlatform(),
    isReady,
    pushEnabled,
  }

  return (
    <CapacitorContext.Provider value={value}>
      {children}
    </CapacitorContext.Provider>
  )
}
