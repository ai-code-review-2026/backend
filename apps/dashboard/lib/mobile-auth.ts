/**
 * Mobile-specific authentication utilities for Clerk
 * Handles OAuth flows, deep linking, and session management for Capacitor
 */

import { Browser } from '@capacitor/browser'
import { App } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import { isNativePlatform, isIOS, isAndroid } from './capacitor'

// Constants
const AUTH_REDIRECT_KEY = 'clerk_auth_redirect'
const SESSION_TOKEN_KEY = 'clerk_session_token'

// URL schemes for OAuth callback
export const URL_SCHEMES = {
  ios: 'aicodeview://',
  android: 'aicodeview://',
  web: typeof window !== 'undefined' ? window.location.origin : '',
}

/**
 * Get the appropriate redirect URL for OAuth based on platform
 */
export function getOAuthRedirectUrl(): string {
  if (!isNativePlatform()) {
    return `${window.location.origin}/auth/role-redirect`
  }
  
  // For native apps, use custom URL scheme
  const scheme = isIOS() ? URL_SCHEMES.ios : URL_SCHEMES.android
  return `${scheme}auth/callback`
}

/**
 * Get the OAuth callback URL for Clerk configuration
 */
export function getClerkCallbackUrl(): string {
  if (!isNativePlatform()) {
    return `${window.location.origin}/sso-callback`
  }
  
  const scheme = isIOS() ? URL_SCHEMES.ios : URL_SCHEMES.android
  return `${scheme}sso-callback`
}

/**
 * Initialize deep link handling for OAuth callbacks
 * Call this during app initialization
 */
export function initializeAuthDeepLinks(
  onAuthSuccess: (token: string) => void,
  onAuthError: (error: string) => void
): () => void {
  if (!isNativePlatform()) {
    return () => {}
  }

  const handler = App.addListener('appUrlOpen', async ({ url }) => {
    console.log('Auth deep link received:', url)
    
    try {
      const parsedUrl = new URL(url)
      const path = parsedUrl.pathname
      
      // Handle SSO callback
      if (path.includes('sso-callback') || path.includes('oauth-callback')) {
        // Extract the token or session info from URL
        const token = parsedUrl.searchParams.get('__clerk_status')
        const sessionToken = parsedUrl.searchParams.get('session_token')
        
        if (sessionToken) {
          await saveSessionToken(sessionToken)
          onAuthSuccess(sessionToken)
        } else if (token === 'verified') {
          onAuthSuccess('verified')
        } else {
          const error = parsedUrl.searchParams.get('error') || 'Unknown auth error'
          onAuthError(error)
        }
        
        // Close the browser if it's open
        await Browser.close().catch(() => {})
      }
      
      // Handle auth callback
      if (path.includes('auth/callback')) {
        const status = parsedUrl.searchParams.get('status')
        if (status === 'success') {
          onAuthSuccess('success')
        } else {
          onAuthError(parsedUrl.searchParams.get('error') || 'Auth failed')
        }
        await Browser.close().catch(() => {})
      }
    } catch (error) {
      console.error('Error handling auth deep link:', error)
      onAuthError('Failed to process authentication')
    }
  })

  // Return cleanup function
  return () => {
    handler.remove()
  }
}

/**
 * Open OAuth provider in in-app browser
 */
export async function openOAuthFlow(url: string): Promise<void> {
  if (!isNativePlatform()) {
    // On web, just redirect
    window.location.href = url
    return
  }

  // Store the current location for redirect after auth
  await Preferences.set({
    key: AUTH_REDIRECT_KEY,
    value: window.location.pathname,
  })

  // Open in-app browser
  await Browser.open({
    url,
    presentationStyle: 'popover',
    toolbarColor: '#0a0a0a',
  })
}

/**
 * Save session token to secure storage
 */
async function saveSessionToken(token: string): Promise<void> {
  await Preferences.set({
    key: SESSION_TOKEN_KEY,
    value: token,
  })
}

/**
 * Get stored session token
 */
export async function getStoredSessionToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: SESSION_TOKEN_KEY })
  return value
}

/**
 * Clear stored session token
 */
export async function clearSessionToken(): Promise<void> {
  await Preferences.remove({ key: SESSION_TOKEN_KEY })
}

/**
 * Get the redirect path after authentication
 */
export async function getAuthRedirectPath(): Promise<string> {
  const { value } = await Preferences.get({ key: AUTH_REDIRECT_KEY })
  await Preferences.remove({ key: AUTH_REDIRECT_KEY })
  return value || '/dashboard'
}

/**
 * Check if we're returning from an OAuth flow
 */
export function isOAuthCallback(): boolean {
  if (typeof window === 'undefined') return false
  
  const url = new URL(window.location.href)
  return url.pathname.includes('sso-callback') || 
         url.pathname.includes('oauth-callback') ||
         url.searchParams.has('__clerk_status')
}

/**
 * Handle sign out on mobile
 */
export async function mobileSignOut(): Promise<void> {
  // Clear stored tokens
  await clearSessionToken()
  await Preferences.remove({ key: AUTH_REDIRECT_KEY })
  
  // Redirect to sign-in
  if (isNativePlatform()) {
    window.location.href = '/sign-in'
  }
}
