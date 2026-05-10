export const DEV_BROWSER_JWT_QUERY_PARAM = "__clerk_db_jwt"

type SearchParamValue = string | string[] | undefined
type SearchParams = Record<string, SearchParamValue> | undefined

function decodeFrontendApiHostFromPublishableKey(publishableKey: string): string | null {
  const match = publishableKey.match(/^pk_(?:test|live)_(.+)$/)
  if (!match) {
    return null
  }

  const encoded = match[1]
  const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4)

  try {
    const decoded = Buffer.from(padded, "base64").toString("utf8").trim()
    if (!decoded) {
      return null
    }
    return decoded.endsWith("$") ? decoded.slice(0, -1) : decoded
  } catch {
    return null
  }
}

export function hasDevBrowserJwt(searchParams: SearchParams): boolean {
  const rawValue = searchParams?.[DEV_BROWSER_JWT_QUERY_PARAM]
  if (typeof rawValue === "string") {
    return rawValue.trim().length > 0
  }
  if (Array.isArray(rawValue)) {
    return rawValue.some((value) => value.trim().length > 0)
  }
  return false
}

export function buildPathWithDevBrowserJwt(
  pathname: string,
  searchParams: SearchParams,
  token: string,
): string {
  const params = new URLSearchParams()

  if (searchParams) {
    for (const [key, rawValue] of Object.entries(searchParams)) {
      if (typeof rawValue === "string") {
        params.set(key, rawValue)
      } else if (Array.isArray(rawValue)) {
        for (const value of rawValue) {
          params.append(key, value)
        }
      }
    }
  }

  params.set(DEV_BROWSER_JWT_QUERY_PARAM, token)
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

export async function requestDevBrowserJwtForLocalDevelopment(): Promise<string | null> {
  if (process.env.NODE_ENV === "production") {
    return null
  }

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()
  if (!publishableKey) {
    return null
  }

  const frontendApiHost = decodeFrontendApiHostFromPublishableKey(publishableKey)
  if (!frontendApiHost) {
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2_500)

  try {
    const response = await fetch(`https://${frontendApiHost}/v1/dev_browser`, {
      method: "POST",
      headers: {
        Authorization: publishableKey,
      },
      cache: "no-store",
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as { token?: unknown }
    return typeof payload.token === "string" && payload.token.trim().length > 0 ? payload.token : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
