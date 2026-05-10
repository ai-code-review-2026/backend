// Client-safe version of backend URL utilities
// This file can be imported in client components

const DEFAULT_BACKEND_HTTP_URL = "http://localhost:8000"

function normalizeUrl(value: string | undefined | null): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    return DEFAULT_BACKEND_HTTP_URL
  }
  return trimmed.replace(/\/$/, "")
}

export function getBackendHttpBaseUrl(): string {
  // Only use NEXT_PUBLIC_ env vars in client
  return normalizeUrl(process.env.NEXT_PUBLIC_BACKEND_URL)
}

export function getBackendApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${getBackendHttpBaseUrl()}${normalizedPath}`
}

export function getBackendWebSocketBaseUrl(): string {
  const httpBase = getBackendHttpBaseUrl()
  return httpBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:")
}
