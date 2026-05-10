/**
 * Capacitor utilities and platform detection
 * This file provides utilities for working with Capacitor in a Next.js app
 */

import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { Keyboard } from '@capacitor/keyboard'
import { App } from '@capacitor/app'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Browser } from '@capacitor/browser'
import { Preferences } from '@capacitor/preferences'

// Platform detection
export const isNativePlatform = () => Capacitor.isNativePlatform()
export const isIOS = () => Capacitor.getPlatform() === 'ios'
export const isAndroid = () => Capacitor.getPlatform() === 'android'
export const isWeb = () => Capacitor.getPlatform() === 'web'
export const getPlatform = () => Capacitor.getPlatform()

/**
 * Check if running in a Capacitor environment
 * This is an async check that's safer for SSR/static builds
 */
export async function isCapacitor(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false
  }
  return Capacitor.isNativePlatform()
}

/**
 * Initialize Capacitor plugins on app start
 * Call this in your root layout or _app.tsx
 */
export async function initializeCapacitor() {
  if (!isNativePlatform()) {
    return
  }

  try {
    // Configure status bar
    await StatusBar.setStyle({ style: Style.Dark })
    if (isAndroid()) {
      await StatusBar.setBackgroundColor({ color: '#0a0a0a' })
    }

    // Hide splash screen after app is ready
    await SplashScreen.hide()

    // Setup keyboard listeners (iOS)
    if (isIOS()) {
      Keyboard.addListener('keyboardWillShow', () => {
        document.body.classList.add('keyboard-visible')
      })
      Keyboard.addListener('keyboardWillHide', () => {
        document.body.classList.remove('keyboard-visible')
      })
    }

    // Handle Android back button
    if (isAndroid()) {
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back()
        } else {
          App.exitApp()
        }
      })
    }

    // Handle app state changes
    App.addListener('appStateChange', ({ isActive }) => {
      console.log('App state changed. Is active:', isActive)
      // You can dispatch events or update state here
    })

    // Handle deep links
    App.addListener('appUrlOpen', ({ url }) => {
      console.log('App opened with URL:', url)
      // Handle deep linking here
      handleDeepLink(url)
    })

  } catch (error) {
    console.error('Error initializing Capacitor:', error)
  }
}

/**
 * Handle deep links for OAuth callbacks and navigation
 */
function handleDeepLink(url: string) {
  try {
    const parsedUrl = new URL(url)
    const path = parsedUrl.pathname

    // Handle OAuth callbacks from Clerk
    if (path.includes('/oauth-callback') || path.includes('/sso-callback')) {
      // Redirect to the callback page
      window.location.href = path + parsedUrl.search
      return
    }

    // Handle other deep links
    if (path.startsWith('/dashboard')) {
      window.location.href = path
    }
  } catch (error) {
    console.error('Error handling deep link:', error)
  }
}

// Haptic feedback utilities
export const haptics = {
  light: async () => {
    if (isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Light })
    }
  },
  medium: async () => {
    if (isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Medium })
    }
  },
  heavy: async () => {
    if (isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Heavy })
    }
  },
  vibrate: async () => {
    if (isNativePlatform()) {
      await Haptics.vibrate()
    }
  },
}

// Browser utilities (for opening external links)
export const browser = {
  open: async (url: string) => {
    if (isNativePlatform()) {
      await Browser.open({ url })
    } else {
      window.open(url, '_blank')
    }
  },
  close: async () => {
    if (isNativePlatform()) {
      await Browser.close()
    }
  },
}

// Storage utilities (preferences)
export const storage = {
  get: async (key: string): Promise<string | null> => {
    const { value } = await Preferences.get({ key })
    return value
  },
  set: async (key: string, value: string): Promise<void> => {
    await Preferences.set({ key, value })
  },
  remove: async (key: string): Promise<void> => {
    await Preferences.remove({ key })
  },
  clear: async (): Promise<void> => {
    await Preferences.clear()
  },
}

// Status bar utilities
export const statusBar = {
  hide: async () => {
    if (isNativePlatform()) {
      await StatusBar.hide()
    }
  },
  show: async () => {
    if (isNativePlatform()) {
      await StatusBar.show()
    }
  },
  setLight: async () => {
    if (isNativePlatform()) {
      await StatusBar.setStyle({ style: Style.Light })
    }
  },
  setDark: async () => {
    if (isNativePlatform()) {
      await StatusBar.setStyle({ style: Style.Dark })
    }
  },
  setBackgroundColor: async (color: string) => {
    if (isAndroid()) {
      await StatusBar.setBackgroundColor({ color })
    }
  },
}

// Keyboard utilities
export const keyboard = {
  hide: async () => {
    if (isNativePlatform()) {
      await Keyboard.hide()
    }
  },
  show: async () => {
    if (isNativePlatform()) {
      await Keyboard.show()
    }
  },
}
