export const GITHUB_API_BASE_URL = "https://api.github.com"
export const GITHUB_API_VERSION = "2022-11-28"

export class GitHubApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "GitHubApiError"
    this.status = status
    this.body = body
  }
}

export function buildGithubHeaders(
  token?: string | null,
  accept = "application/vnd.github+json",
  contentType: string | null = "application/json",
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  }
  if (contentType) {
    headers["Content-Type"] = contentType
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

export function normalizeGithubError(
  raw: unknown,
  statusCode?: number,
  hasToken?: boolean,
): string {
  let baseMessage = "GitHub request failed"

  if (typeof raw === "string" && raw.trim().length > 0) {
    baseMessage = raw.trim()
  } else if (typeof raw === "object" && raw !== null) {
    const message = (raw as { message?: unknown }).message
    if (typeof message === "string" && message.trim().length > 0) {
      baseMessage = message.trim()
    }
  }

  if (statusCode === 403 && baseMessage.toLowerCase().includes("rate limit")) {
    const tokenHint = hasToken
      ? ""
      : " No GitHub OAuth token detected. Reconnect GitHub in Clerk to increase the rate limit."
    return `${baseMessage}${tokenHint}`
  }

  if (statusCode === 404) {
    return `${baseMessage}. Resource not found (repository, branch, or file path may be inaccessible).`
  }

  return baseMessage
}

export async function parseGithubResponse(response: Response): Promise<unknown> {
  const rawBody = await response.text()
  if (!rawBody) {
    return null
  }
  try {
    return JSON.parse(rawBody)
  } catch {
    return rawBody
  }
}

export async function requestGithub<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
  accept = "application/vnd.github+json",
): Promise<T> {
  const headers = new Headers(init.headers)
  for (const [key, value] of Object.entries(buildGithubHeaders(token, accept))) {
    headers.set(key, value)
  }

  const response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
    ...init,
    headers,
  })
  const payload = await parseGithubResponse(response)

  if (!response.ok) {
    throw new GitHubApiError(
      normalizeGithubError(payload, response.status, Boolean(token)),
      response.status,
      payload,
    )
  }

  return payload as T
}
