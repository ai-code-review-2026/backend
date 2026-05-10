import { auth, clerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const GITHUB_API_BASE_URL = "https://api.github.com"
const GITHUB_API_VERSION = "2022-11-28"

type GithubRepoInfo = {
  owner?: {
    login?: string
    type?: string
  }
}

type GithubActor = {
  login?: string
  name?: string | null
  email?: string | null
}

type GithubMemberRecord = {
  login: string
  name: string | null
  email: string | null
  source: string[]
}

async function resolveGithubToken(
  client: Awaited<ReturnType<typeof clerkClient>>,
  userId: string,
): Promise<string | null> {
  for (const provider of ["github"] as const) {
    try {
      const tokens = await client.users.getUserOauthAccessToken(userId, provider)
      const candidate = Array.isArray(tokens?.data)
        ? tokens.data.find((t) => typeof t?.token === "string" && t.token.trim().length > 0)
        : null
      if (candidate) return candidate.token
    } catch {
      // try next provider
    }
  }
  return null
}

function githubHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "ai-code-review-platform",
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function githubGet<T>(path: string, token: string | null): Promise<T | null> {
  const res = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
    headers: githubHeaders(token),
    cache: "no-store",
  })
  if (!res.ok) return null
  return (await res.json().catch(() => null)) as T | null
}

async function githubGetList<T>(path: string, token: string | null, maxPages = 5): Promise<T[]> {
  const results: T[] = []
  let url: string | null = `${GITHUB_API_BASE_URL}${path}`
  let page = 0

  while (url && page < maxPages) {
    page += 1
    const res: Response = await fetch(url, {
      headers: githubHeaders(token),
      cache: "no-store",
    })
    if (!res.ok) break

    const data = (await res.json().catch(() => [])) as unknown
    if (Array.isArray(data)) {
      for (const item of data) results.push(item as T)
    }

    const link: string = res.headers.get("Link") ?? ""
    const next: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="next"/)
    url = next ? next[1] : null
  }

  return results
}

function upsertMember(
  memberMap: Map<string, GithubMemberRecord>,
  login: string,
  source: string,
  payload?: Partial<GithubActor>,
) {
  const key = login.toLowerCase()
  const existing = memberMap.get(key)
  const nextSources = existing ? new Set(existing.source) : new Set<string>()
  nextSources.add(source)

  memberMap.set(key, {
    login,
    name: payload?.name ?? existing?.name ?? null,
    email: payload?.email ?? existing?.email ?? null,
    source: Array.from(nextSources),
  })
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const repo = searchParams.get("repo")
  if (!repo) {
    return NextResponse.json({ error: "repo query param is required" }, { status: 400 })
  }
  const repoFullName = repo.trim()

  const client = await clerkClient()
  const githubToken = await resolveGithubToken(client, userId)

  const repoInfo = await githubGet<GithubRepoInfo>(`/repos/${repoFullName}`, githubToken)
  const ownerLogin = repoInfo?.owner?.login?.trim() || repoFullName.split("/")[0] || ""
  const isOrgRepo = repoInfo?.owner?.type === "Organization" && ownerLogin.length > 0

  const [collaborators, contributors, orgMembers] = await Promise.all([
    githubGetList<GithubActor>(`/repos/${repoFullName}/collaborators?affiliation=all&per_page=100`, githubToken),
    githubGetList<GithubActor>(`/repos/${repoFullName}/contributors?per_page=100&anon=0`, githubToken),
    isOrgRepo
      ? githubGetList<GithubActor>(`/orgs/${encodeURIComponent(ownerLogin)}/members?per_page=100`, githubToken)
      : Promise.resolve([]),
  ])

  const memberMap = new Map<string, GithubMemberRecord>()

  for (const collaborator of collaborators) {
    if (typeof collaborator?.login === "string" && collaborator.login.trim()) {
      upsertMember(memberMap, collaborator.login.trim(), "collaborator", collaborator)
    }
  }

  for (const member of orgMembers) {
    if (typeof member?.login === "string" && member.login.trim()) {
      upsertMember(memberMap, member.login.trim(), "org_member", member)
    }
  }

  for (const contributor of contributors) {
    if (typeof contributor?.login === "string" && contributor.login.trim()) {
      upsertMember(memberMap, contributor.login.trim(), "contributor", contributor)
    }
  }

  const items = Array.from(memberMap.values()).sort((a, b) => a.login.localeCompare(b.login))

  return NextResponse.json({
    items,
    total: items.length,
    sources: {
      collaborators: collaborators.length,
      org_members: orgMembers.length,
      contributors: contributors.length,
    },
  })
}
