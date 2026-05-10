const CLERK_QUERY_PREFIX = "__clerk_"
const EXTRA_FORWARD_QUERY_KEYS = new Set(["redirect_url", "redirectUrl"])

export const CLERK_INVITATION_QUERY_KEYS = ["__clerk_ticket", "__clerk_invitation_token"] as const

type SearchParamValue = string | string[] | undefined
type SearchParamsRecord = Record<string, SearchParamValue> | undefined
type SearchParamsLike = {
  get: (name: string) => string | null
  forEach: (callback: (value: string, key: string) => void) => void
}

function isPresent(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function shouldForwardClerkAuthParam(key: string): boolean {
  return key.startsWith(CLERK_QUERY_PREFIX) || EXTRA_FORWARD_QUERY_KEYS.has(key)
}

export function hasClerkInvitationToken(searchParams: Pick<SearchParamsLike, "get">): boolean {
  return CLERK_INVITATION_QUERY_KEYS.some((key) => isPresent(searchParams.get(key)))
}

export function buildPathWithForwardedClerkAuthParams(pathname: string, searchParams: SearchParamsLike): string {
  const forwardedParams = new URLSearchParams()

  searchParams.forEach((value, key) => {
    if (shouldForwardClerkAuthParam(key)) {
      forwardedParams.append(key, value)
    }
  })

  const query = forwardedParams.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function buildPathWithForwardedClerkAuthParamsFromRecord(
  pathname: string,
  searchParams: SearchParamsRecord,
): string {
  const forwardedParams = new URLSearchParams()

  if (searchParams) {
    for (const [key, rawValue] of Object.entries(searchParams)) {
      if (!shouldForwardClerkAuthParam(key)) {
        continue
      }

      if (typeof rawValue === "string") {
        forwardedParams.set(key, rawValue)
      } else if (Array.isArray(rawValue)) {
        for (const value of rawValue) {
          forwardedParams.append(key, value)
        }
      }
    }
  }

  const query = forwardedParams.toString()
  return query ? `${pathname}?${query}` : pathname
}
