'use client'

import { useEffect, useState, useCallback } from 'react'
import { App } from '@capacitor/app'
import { 
  isNativePlatform, 
  isIOS, 
  isAndroid, 
  isWeb, 
  getPlatform,
  initializeCapacitor,
  haptics,
  browser,
  storage,
  statusBar,
  keyboard
} from '@/lib/capacitor'

interface UseCapacitorReturn {
  // Platform info
  isNative: boolean
  isIOS: boolean
  isAndroid: boolean
  isWeb: boolean
  platform: string
  isReady: boolean
  
  // App info
  appInfo: {
    name: string
    id: string
    build: string
    version: string
  } | null
  
  // Utilities
  haptics: typeof haptics
  browser: typeof browser
  storage: typeof storage
  statusBar: typeof statusBar
  keyboard: typeof keyboard
  
  // App actions
  exitApp: () => Promise<void>
  minimizeApp: () => Promise<void>
}

/**
 * Hook to access Capacitor functionality in React components
 * Handles initialization and provides platform-specific utilities
 */
export function useCapacitor(): UseCapacitorReturn {
  const [isReady, setIsReady] = useState(false)
  const [appInfo, setAppInfo] = useState<UseCapacitorReturn['appInfo']>(null)

  useEffect(() => {
    async function init() {
      // Initialize Capacitor plugins
      await initializeCapacitor()
      
      // Get app info if on native platform
      if (isNativePlatform()) {
        try {
          const info = await App.getInfo()
          setAppInfo(info)
        } catch (error) {
          console.error('Error getting app info:', error)
        }
      }
      
      setIsReady(true)
    }

    init()
  }, [])

  const exitApp = useCallback(async () => {
    if (isNativePlatform()) {
      await App.exitApp()
    }
  }, [])

  const minimizeApp = useCallback(async () => {
    if (isAndroid()) {
      await App.minimizeApp()
    }
  }, [])

  return {
    // Platform detection (these don't need state, they're synchronous)
    isNative: isNativePlatform(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isWeb: isWeb(),
    platform: getPlatform(),
    isReady,
    
    // App info
    appInfo,
    
    // Utilities
    haptics,
    browser,
    storage,
    statusBar,
    keyboard,
    
    // App actions
    exitApp,
    minimizeApp,
  }
}

/**
 * Hook to detect if we're in a Capacitor environment
 * Lighter weight than useCapacitor if you just need platform detection
 */
export function usePlatform() {
  return {
    isNative: isNativePlatform(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isWeb: isWeb(),
    platform: getPlatform(),
  }
}

/**
 * Hook for handling safe areas on iOS
 */
export function useSafeArea() {
  const [safeArea, setSafeArea] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  })

  useEffect(() => {
    // Get CSS safe area values
    const computeStyle = getComputedStyle(document.documentElement)
    
    const updateSafeArea = () => {
      setSafeArea({
        top: parseInt(computeStyle.getPropertyValue('--sat') || '0', 10),
        bottom: parseInt(computeStyle.getPropertyValue('--sab') || '0', 10),
        left: parseInt(computeStyle.getPropertyValue('--sal') || '0', 10),
        right: parseInt(computeStyle.getPropertyValue('--sar') || '0', 10),
      })
    }

    updateSafeArea()
    window.addEventListener('resize', updateSafeArea)
    
    return () => window.removeEventListener('resize', updateSafeArea)
  }, [])

  return safeArea
}

/**
 * Hook for keyboard visibility state
 */
export function useKeyboardState() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    if (!isNativePlatform()) return

    const showListener = (info: { keyboardHeight: number }) => {
      setIsKeyboardVisible(true)
      setKeyboardHeight(info.keyboardHeight)
    }

    const hideListener = () => {
      setIsKeyboardVisible(false)
      setKeyboardHeight(0)
    }

    // Import dynamically to avoid SSR issues
    import('@capacitor/keyboard').then(({ Keyboard }) => {
      Keyboard.addListener('keyboardWillShow', showListener)
      Keyboard.addListener('keyboardWillHide', hideListener)
    })

    return () => {
      import('@capacitor/keyboard').then(({ Keyboard }) => {
        Keyboard.removeAllListeners()
      })
    }
  }, [])

  return { isKeyboardVisible, keyboardHeight }
}
