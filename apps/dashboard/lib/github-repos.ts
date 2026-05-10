export type GithubRepoOption = {
  id: number
  name: string
  fullName: string
  private: boolean
  htmlUrl: string | null
  defaultBranch: string | null
  ownerLogin: string | null
  updatedAt: string | null
  description?: string | null
  language?: string | null
}

export type GithubReposResult = {
  connected: boolean
  items: GithubRepoOption[]
  error: string | null
  login?: string
  tokenAvailable?: boolean
}

export async function fetchGithubRepos(options?: {
  account?: string
  accountType?: "org" | "user"
}): Promise<GithubReposResult> {
  const params = new URLSearchParams()
  if (options?.account) {
    params.set("account", options.account)
    params.set("type", options.accountType ?? "user")
  }
  const query = params.toString()
  const response = await fetch(`/api/dashboard/github/repos${query ? `?${query}` : ""}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  })
  const data = (await response.json().catch(() => ({}))) as Partial<GithubReposResult>

  if (!response.ok) {
    return {
      connected: false,
      items: [],
      error: data.error ?? `Failed to fetch GitHub repositories (HTTP ${response.status})`,
    }
  }

  return {
    connected:
      data.connected !== false ||
      data.tokenAvailable === true ||
      (Array.isArray(data.items) && data.items.length > 0) ||
      Boolean(data.login),
    items: Array.isArray(data.items) ? data.items : [],
    error: data.error ?? null,
    login: data.login,
    tokenAvailable: data.tokenAvailable,
  }
}
