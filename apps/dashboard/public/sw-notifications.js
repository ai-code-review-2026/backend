self.addEventListener("push", (event) => {
  if (!event.data) {
    return
  }

  let payload = {}
  try {
    payload = event.data.json()
  } catch (_err) {
    payload = {
      title: "Devora",
      body: event.data.text(),
      data: {},
    }
  }

  const title = payload.title || "Devora"
  const body = payload.body || ""
  const data = payload.data || {}
  const icon = "/favicon.ico"

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      data,
      tag: data.type || "notification",
      renotify: false,
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const analysisId = data.analysis_id || data.analysisId
  const sessionId = data.session_id || data.sessionId
  const explicitUrl = data.url

  let targetPath = "/dashboard/notifications"
  if (typeof explicitUrl === "string" && explicitUrl.length > 0) {
    targetPath = explicitUrl
  } else if (typeof sessionId === "string" && sessionId.length > 0) {
    targetPath = `/dashboard/review-session/${sessionId}`
  } else if (typeof analysisId === "string" && analysisId.length > 0) {
    targetPath = `/dashboard/diff/${analysisId}`
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetPath)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetPath)
      }
      return Promise.resolve(undefined)
    }),
  )
})
