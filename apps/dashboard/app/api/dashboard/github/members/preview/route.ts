import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import {
  buildGithubHeaders,
  requestGithub,
  resolveGithubTokenForUser,
} from "@/lib/github-client"
import { GitHubApiError } from "@/lib/server/github/client"

type RepoRequestBody = {
  repository?: string
}

type GitHubPermissions = {
  admin?: boolean
  maintain?: boolean
  push?: boolean
  triage?: boolean
  pull?: boolean
}

type GitHubRepositoryResponse = {
  full_name?: string
  name?: string
  private?: boolean
  owner?: {
    login?: string
    type?: "User" | "Organization"
  }
  permissions?: GitHubPermissions
}

type GitHubMemberResponse = {
  id?: number
  login?: string
  avatar_url?: string
  type?: "User" | "Bot"
  site_admin?: boolean
  name?: string | null
  email?: string | null
}

type PreviewMember = {
  login: string
  email?: string
  name?: string
  avatar_url: string
  type: "User" | "Bot"
  site_admin: boolean
  source: "collaborator" | "organization"
}

type PreviewResponse = {
  repository: {
    full_name: string
    name: string
    owner: {
      login: string
      type: "User" | "Organization"
    }
    private: boolean
    permissions: {
      admin: boolean
      maintain: boolean
      push: boolean
    }
  }
  collaborators: PreviewMember[]
  organization?: {
    login: string
    id: number
    avatar_url: string
  }
  organization_members: PreviewMember[]
  all_members: PreviewMember[]
  suggested_roles: Record<string, string>
}

function normalizeRepoFullName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || !trimmed.includes("/")) {
    return null
  }
  return trimmed
}

async function githubGetList<T>(path: string, token: string): Promise<T[]> {
  const results: T[] = []
  let url: string | null = `https://api.github.com${path}`
  let page = 0

  while (url && page < 5) {
    page += 1
    const response = await fetch(url, {
      headers: buildGithubHeaders(token),
      cache: "no-store",
    })
    if (!response.ok) {
      break
    }

    const payload = (await response.json().catch(() => [])) as unknown
    if (Array.isArray(payload)) {
      for (const item of payload) {
        results.push(item as T)
      }
    }

    const linkHeader = response.headers.get("Link") ?? ""
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
    url = nextMatch ? nextMatch[1] : null
  }

  return results
}

function toPreviewMember(
  member: GitHubMemberResponse,
  source: PreviewMember["source"],
): PreviewMember | null {
  if (typeof member.login !== "string" || member.login.trim().length === 0) {
    return null
  }

  return {
    login: member.login.trim(),
    email: typeof member.email === "string" && member.email.trim().length > 0 ? member.email.trim() : undefined,
    name: typeof member.name === "string" && member.name.trim().length > 0 ? member.name.trim() : undefined,
    avatar_url: typeof member.avatar_url === "string" ? member.avatar_url : "",
    type: member.type === "Bot" ? "Bot" : "User",
    site_admin: member.site_admin === true,
    source,
  }
}

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as RepoRequestBody | null
  const repository = normalizeRepoFullName(body?.repository)
  if (!repository) {
    return NextResponse.json(
      { error: "repository is required and must use the format owner/repo" },
      { status: 400 },
    )
  }

  const token = await resolveGithubTokenForUser(userId)
  if (!token) {
    return NextResponse.json(
      { error: "GitHub account not connected in Clerk OAuth" },
      { status: 401 },
    )
  }

  let repo: GitHubRepositoryResponse
  try {
    repo = await requestGithub<GitHubRepositoryResponse>(`/repos/${repository}`, {}, token)
  } catch (error: unknown) {
    const githubError = error as GitHubApiError
    return NextResponse.json(
      { error: githubError?.message ?? "GitHub repository lookup failed" },
      { status: githubError?.status ?? 500 },
    )
  }

  const ownerLogin = repo.owner?.login?.trim() || repository.split("/")[0] || ""
  const ownerType = repo.owner?.type === "Organization" ? "Organization" : "User"

  const [collaboratorRows, organizationRows] = await Promise.all([
    githubGetList<GitHubMemberResponse>(
      `/repos/${repository}/collaborators?affiliation=all&per_page=100`,
      token,
    ),
    ownerType === "Organization"
      ? githubGetList<GitHubMemberResponse>(
          `/orgs/${encodeURIComponent(ownerLogin)}/members?per_page=100`,
          token,
        )
      : Promise.resolve([]),
  ])

  const collaborators = collaboratorRows
    .map((member) => toPreviewMember(member, "collaborator"))
    .filter((member): member is PreviewMember => member !== null)

  const organizationMembers = organizationRows
    .map((member) => toPreviewMember(member, "organization"))
    .filter((member): member is PreviewMember => member !== null)

  const dedupedMembers = new Map<string, PreviewMember>()
  for (const member of [...collaborators, ...organizationMembers]) {
    const key = member.login.toLowerCase()
    if (!dedupedMembers.has(key)) {
      dedupedMembers.set(key, member)
    }
  }

  const allMembers = Array.from(dedupedMembers.values()).sort((a, b) =>
    a.login.localeCompare(b.login),
  )

  const suggestedRoles: Record<string, string> = {}
  for (const member of allMembers) {
    suggestedRoles[member.login] = member.login.toLowerCase() === ownerLogin.toLowerCase() ? "admin" : "developer"
  }

  const response: PreviewResponse = {
    repository: {
      full_name: repo.full_name?.trim() || repository,
      name: repo.name?.trim() || repository.split("/").pop() || repository,
      owner: {
        login: ownerLogin,
        type: ownerType,
      },
      private: repo.private === true,
      permissions: {
        admin: repo.permissions?.admin === true,
        maintain: repo.permissions?.maintain === true,
        push: repo.permissions?.push === true,
      },
    },
    collaborators,
    organization:
      ownerType === "Organization"
        ? {
            login: ownerLogin,
            id: 0,
            avatar_url: organizationMembers[0]?.avatar_url || "",
          }
        : undefined,
    organization_members: organizationMembers,
    all_members: allMembers,
    suggested_roles: suggestedRoles,
  }

  return NextResponse.json(response, { status: 200 })
}
