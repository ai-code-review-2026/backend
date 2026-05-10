export type PushKeyResponse = {
  enabled: boolean
  public_key: string | null
}

const NOTIFICATION_SW_PATH = "/sw-notifications.js"

export function isPushNotificationsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  )
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied"
  }
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied"
  }
  return Notification.requestPermission()
}

export async function fetchPushPublicKey(): Promise<PushKeyResponse | null> {
  try {
    const response = await fetch("/api/notifications/push-public-key", { method: "GET" })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null
  }

  try {
    const existing = await navigator.serviceWorker.getRegistration(NOTIFICATION_SW_PATH)
    if (existing) return existing
    return await navigator.serviceWorker.register(NOTIFICATION_SW_PATH)
  } catch {
    return null
  }
}

export async function ensurePushSubscription(publicKey: string): Promise<boolean> {
  if (!isPushNotificationsSupported() || !publicKey) {
    return false
  }

  const permission = getNotificationPermission()
  if (permission !== "granted") {
    return false
  }

  const registration = await registerNotificationServiceWorker()
  if (!registration) {
    return false
  }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }

  const response = await fetch("/api/notifications/push-subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  })
  return response.ok
}

export async function unregisterPushSubscription(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    return false
  }

  const registration = await navigator.serviceWorker.getRegistration(NOTIFICATION_SW_PATH)
  if (!registration) {
    return true
  }

  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    return true
  }

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  const response = await fetch("/api/notifications/push-subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  })
  return response.ok
}

export async function hasActivePushSubscription(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    return false
  }
  const registration = await navigator.serviceWorker.getRegistration(NOTIFICATION_SW_PATH)
  if (!registration) {
    return false
  }
  const subscription = await registration.pushManager.getSubscription()
  return subscription !== null
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
