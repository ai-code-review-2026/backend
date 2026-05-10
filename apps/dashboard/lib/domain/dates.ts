export function safeDateValue(input: string | Date | null | undefined): Date | null {
  if (!input) {
    return null
  }
  const candidate = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(candidate.getTime())) {
    return null
  }
  return candidate
}

export function formatDate(
  input: string | Date | null | undefined,
  locale = "fr-FR",
): string {
  const date = safeDateValue(input)
  if (!date) {
    return "-"
  }
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function formatDateTime(
  input: string | Date | null | undefined,
  locale = "fr-FR",
): string {
  const date = safeDateValue(input)
  if (!date) {
    return "-"
  }
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatRelativeTime(
  input: string | Date | null | undefined,
  locale = "fr-FR",
): string {
  const date = safeDateValue(input)
  if (!date) {
    return "-"
  }

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000))
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return "a l'instant"
  if (diffMins < 60) return `il y a ${diffMins} min`
  if (diffHours < 24) return `il y a ${diffHours}h`
  if (diffDays < 7) return `il y a ${diffDays}j`
  return date.toLocaleDateString(locale)
}

export function formatCompactRelativeTime(
  input: string | Date | null | undefined,
): string {
  const date = safeDateValue(input)
  if (!date) {
    return "-"
  }

  const diffMs = Math.max(0, Date.now() - date.getTime())
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) {
    return `${seconds}s`
  }
  return `${minutes}m ${seconds}s`
}

export function resolveDurationLabel(
  createdAt: string | undefined,
  updatedAt: string | undefined,
  terminal: boolean,
): string {
  const created = safeDateValue(createdAt)
  if (!created) {
    return "-"
  }
  const updated = safeDateValue(updatedAt)
  const end = terminal && updated ? updated : new Date()
  return formatDurationMs(end.getTime() - created.getTime())
}
