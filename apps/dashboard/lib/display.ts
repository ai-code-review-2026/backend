export function formatDisplayValue(value: unknown): string {
  if (value == null) {
    return ""
  }

  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value)
  }

  if (value instanceof Error) {
    return value.message || value.name
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatDisplayValue(item)).filter(Boolean).join(", ")
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    for (const key of ["message", "detail", "details", "title", "error", "reason", "status", "code"]) {
      const nested = formatDisplayValue(record[key])
      if (nested) {
        return nested
      }
    }

    try {
      return JSON.stringify(value)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }

  return String(value)
}

export function extractApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload == null) {
    return fallback
  }

  if (typeof payload === "string") {
    return payload.trim() || fallback
  }

  if (payload instanceof Error) {
    return payload.message.trim() || fallback
  }

  if (typeof payload !== "object") {
    return formatDisplayValue(payload) || fallback
  }

  const record = payload as Record<string, unknown>
  for (const key of ["message", "detail", "details", "title", "error", "reason", "status", "code"]) {
    const candidate = formatDisplayValue(record[key])
    if (candidate) {
      return candidate
    }
  }

  return formatDisplayValue(payload) || fallback
}
