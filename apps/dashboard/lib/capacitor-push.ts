/**
 * Push notification service for Capacitor mobile app
 * Handles registration, token storage, and notification routing
 */

import { isNativePlatform } from './capacitor'

interface PushRegistrationResult {
  token: string
  platform: 'android' | 'ios'
}

type NotificationHandler = (notification: {
  id: string
  title?: string
  body?: string
  data?: Record<string, string>
}) => void

type ActionHandler = (data: {
  actionId: string
  notification: {
    title?: string
    body?: string
    data?: Record<string, string>
  }
}) => void

/**
 * Register for push notifications and send the token to the backend.
 * Safe to call on web (no-op) and on native platforms.
 */
export async function registerPushNotifications(
  apiCall: (endpoint: string, options?: RequestInit) => Promise<Response>
): Promise<void> {
  if (!isNativePlatform()) return

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    const permission = await PushNotifications.requestPermissions()
    if (permission.receive !== 'granted') {
      console.warn('[Push] Permission denied')
      return
    }

    await PushNotifications.register()

    PushNotifications.addListener('registration', async ({ value: token }) => {
      console.log('[Push] Token received:', token.substring(0, 20) + '...')
      try {
        await apiCall('/api/dashboard/notifications/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            platform: (await import('@capacitor/core')).Capacitor.getPlatform(),
          }),
        })
        console.log('[Push] Token registered with backend')
      } catch (err) {
        console.error('[Push] Failed to register token:', err)
      }
    })

    PushNotifications.addListener('registrationError', err => {
      console.error('[Push] Registration error:', err)
    })

  } catch (err) {
    console.error('[Push] Failed to initialize:', err)
  }
}

/**
 * Listen for incoming push notifications (app in foreground)
 */
export async function onPushReceived(handler: NotificationHandler): Promise<() => void> {
  if (!isNativePlatform()) return () => {}

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    const listener = await PushNotifications.addListener(
      'pushNotificationReceived',
      notification => {
        handler({
          id: notification.id,
          title: notification.title,
          body: notification.body,
          data: notification.data as Record<string, string>,
        })
      }
    )

    return () => listener.remove()
  } catch (err) {
    console.error('[Push] onReceived error:', err)
    return () => {}
  }
}

/**
 * Listen for push notification tap actions (app in background/killed)
 */
export async function onPushActionPerformed(handler: ActionHandler): Promise<() => void> {
  if (!isNativePlatform()) return () => {}

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    const listener = await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      action => {
        handler({
          actionId: action.actionId,
          notification: {
            title: action.notification.title,
            body: action.notification.body,
            data: action.notification.data as Record<string, string>,
          },
        })
      }
    )

    return () => listener.remove()
  } catch (err) {
    console.error('[Push] onAction error:', err)
    return () => {}
  }
}

/**
 * Default navigation handler: routes to the correct page based on notification data
 */
export function handlePushNavigation(data: Record<string, string>): void {
  if (!data) return

  const { analysis_id, type } = data

  if (analysis_id) {
    window.location.href = `/mobile/analysis/${analysis_id}`
    return
  }

  switch (type) {
    case 'return':
    case 'waiting_author':
      window.location.href = `/mobile/prs?tab=${type}`
      break
    case 'analysis_complete':
      window.location.href = '/mobile/prs?tab=new_attention'
      break
    default:
      window.location.href = '/mobile/notifications'
  }
}
