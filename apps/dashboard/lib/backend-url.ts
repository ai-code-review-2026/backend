import "server-only"

const DEFAULT_BACKEND_HTTP_URL = "http://localhost:8000"

function normalizeUrl(value: string | undefined | null): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    return DEFAULT_BACKEND_HTTP_URL
  }
  return trimmed.replace(/\/$/, "")
}

export function getBackendHttpBaseUrl(): string {
  return normalizeUrl(process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL)
}

export function getBackendApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${getBackendHttpBaseUrl()}${normalizedPath}`
}

export function getBackendWebSocketBaseUrl(): string {
  const httpBase = getBackendHttpBaseUrl()
  return httpBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:")
}
