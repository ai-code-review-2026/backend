export function getDefaultNotificationPreferences() {
  return {
    email: {
      enabled: true,
      new_review_assigned: true,
      review_completed: true,
      comment_replies: true,
      mention: true,
      weekly_digest: false,
      daily_summary: true,
      security_alerts: true,
    },
    push: {
      enabled: true,
      new_review_assigned: true,
      review_completed: false,
      comment_replies: true,
      mention: true,
      realtime_updates: true,
    },
    inApp: {
      enabled: true,
      sound: false,
      desktop: true,
      show_preview: true,
    },
    schedule: {
      quiet_hours_enabled: false,
      quiet_hours_start: "22:00",
      quiet_hours_end: "08:00",
      weekend_notifications: false,
    },
    slack: null,
    teams: null,
  }
}

export function getEmptyNotificationsResponse() {
  return {
    notifications: [],
    total: 0,
  }
}

export function getEmptyUnreadCountResponse() {
  return {
    count: 0,
  }
}
