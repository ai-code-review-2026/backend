import { auth, clerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

const GITHUB_API_BASE_URL = "https://api.github.com"
const GITHUB_API_VERSION = "2022-11-28"
const MAX_COMMIT_PAGES = 10 // up to 1 000 commits per branch

// ── Types ──────────────────────────────────────────────────────────────────

type MemberRoleOverride = { github_login: string; role: string }

type ImportRequestBody = {
  full_name?: string
  project_name?: string
  member_role_overrides?: MemberRoleOverride[]
  // Backward-compatible camelCase payload used by the create-project modal.
  repoFullName?: string
  projectName?: string
  memberRoleOverrides?: MemberRoleOverride[]
  members?: Array<{ github_login?: string; role?: string; email?: string | null }>
}

type GithubBranchItem = {
  name?: string
  protected?: boolean
  commit?: { sha?: string; url?: string }
}

type GithubCommitItem = {
  sha?: string
  commit?: {
    message?: string
    author?: { name?: string; email?: string; date?: string }
    committer?: { name?: string; email?: string; date?: string }
  }
  parents?: Array<{ sha?: string }>
}

type GithubCollaboratorItem = {
  login?: string
  email?: string
  name?: string
}

type GithubRepoInfo = {
  full_name?: string
  name?: string
  description?: string
  default_branch?: string
  private?: boolean
  language?: string
  id?: number
  owner?: { login?: string; type?: string }
}

// ── GitHub helpers ────────────────────────────────────────────────────────

function githubHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "ai-code-review-platform",
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
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
    const res: Response = await fetch(url, { headers: githubHeaders(token), cache: "no-store" })
    if (!res.ok) break

    const data = (await res.json().catch(() => [])) as unknown
    if (Array.isArray(data)) {
      for (const item of data) results.push(item as T)
    }

    // Follow Link: <url>; rel="next" pagination
    const linkHeader: string = res.headers.get("Link") ?? ""
    const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
    url = nextMatch ? nextMatch[1] : null
  }
  return results
}

async function resolveGithubToken(client: Awaited<ReturnType<typeof clerkClient>>, userId: string): Promise<string | null> {
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

// ── POST handler ──────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // 1. Auth
  const authCtx = await requireBackendAuth()
  if (!authCtx.ok) return authCtx.response

  const { userId, token } = authCtx

  let body: ImportRequestBody
  try {
    body = (await request.json()) as ImportRequestBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const full_name = body.full_name ?? body.repoFullName
  const project_name = body.project_name ?? body.projectName

  const member_role_overrides: MemberRoleOverride[] = (() => {
    if (Array.isArray(body.member_role_overrides)) {
      return body.member_role_overrides
    }
    if (Array.isArray(body.memberRoleOverrides)) {
      return body.memberRoleOverrides
    }
    if (Array.isArray(body.members)) {
      return body.members
        .filter((member) => typeof member.github_login === "string" && member.github_login.trim().length > 0)
        .map((member) => ({
          github_login: member.github_login!.trim(),
          role: typeof member.role === "string" && member.role.trim().length > 0 ? member.role.trim() : "developer",
        }))
    }
    return []
  })()

  if (!full_name || typeof full_name !== "string") {
    return NextResponse.json({ error: "full_name is required" }, { status: 400 })
  }

  const repoFullName = full_name.trim()
  const orgLogin = repoFullName.includes("/") ? repoFullName.split("/")[0] : null

  // 2. Get GitHub OAuth token
  const client = await clerkClient()
  const githubToken = await resolveGithubToken(client, userId)

  // 3. Fetch data from GitHub in parallel
  const [repoInfo, branches, collaborators, contributors] = await Promise.all([
    githubGet<GithubRepoInfo>(`/repos/${repoFullName}`, githubToken),
    githubGetList<GithubBranchItem>(`/repos/${repoFullName}/branches?per_page=100`, githubToken),
    githubGetList<GithubCollaboratorItem>(
      `/repos/${repoFullName}/collaborators?affiliation=all&per_page=100`,
      githubToken,
    ),
    githubGetList<GithubCollaboratorItem>(
      `/repos/${repoFullName}/contributors?per_page=100&anon=0`,
      githubToken,
    ),
  ])

  // 4. Fetch commits for each branch (sequential to avoid rate-limiting)
  const branchCommitMap: Record<string, GithubCommitItem[]> = {}
  for (const branch of branches) {
    const name = branch.name
    if (!name) continue
    branchCommitMap[name] = await githubGetList<GithubCommitItem>(
      `/repos/${repoFullName}/commits?sha=${encodeURIComponent(name)}&per_page=100`,
      githubToken,
      MAX_COMMIT_PAGES,
    )
  }

  // 5. Fetch org members if this is an org repo
  let orgMembers: GithubCollaboratorItem[] = []
  if (orgLogin && repoInfo?.owner?.type === "Organization") {
    orgMembers = await githubGetList<GithubCollaboratorItem>(
      `/orgs/${encodeURIComponent(orgLogin)}/members?per_page=100`,
      githubToken,
    )
  }

  // 6. Deduplicate members (collaborators ∪ org members ∪ contributors)
  const memberMap = new Map<string, { login: string; email: string | null }>()
  for (const c of [...collaborators, ...orgMembers, ...contributors]) {
    if (typeof c.login === "string" && c.login.trim().length > 0) {
      const login = c.login.trim().toLowerCase()
      if (!memberMap.has(login)) {
        memberMap.set(login, {
          login: c.login.trim(),
          email: typeof c.email === "string" && c.email.trim().length > 0 ? c.email.trim() : null,
        })
      }
    }
  }

  // Build role lookup from override list
  const roleOverrideMap: Record<string, string> = {}
  for (const ov of member_role_overrides) {
    if (ov.github_login) roleOverrideMap[ov.github_login.toLowerCase()] = ov.role
  }

  const members = Array.from(memberMap.values()).map((m) => ({
    github_login: m.login,
    email: m.email,
    role: roleOverrideMap[m.login.toLowerCase()] ?? "developer",
  }))

  // 7. Build backend payload
  const defaultBranch = repoInfo?.default_branch ?? "main"

  const branchPayload = branches.map((b) => ({
    name: b.name ?? "",
    is_default: b.name === defaultBranch,
    last_commit_sha: b.commit?.sha ?? null,
    last_commit_message: null,
    last_commit_author: null,
    last_commit_at: null,
  }))

  const commitPayload: Array<{
    sha: string
    branch_name: string
    message: string | null
    author_name: string | null
    author_email: string | null
    authored_at: string | null
    committer_name: string | null
    committer_email: string | null
    committed_at: string | null
    parent_shas: string[]
  }> = []

  for (const [branchName, commits] of Object.entries(branchCommitMap)) {
    for (const c of commits) {
      if (!c.sha) continue
      commitPayload.push({
        sha: c.sha,
        branch_name: branchName,
        message: c.commit?.message ?? null,
        author_name: c.commit?.author?.name ?? null,
        author_email: c.commit?.author?.email ?? null,
        authored_at: c.commit?.author?.date ?? null,
        committer_name: c.commit?.committer?.name ?? null,
        committer_email: c.commit?.committer?.email ?? null,
        committed_at: c.commit?.committer?.date ?? null,
        parent_shas: (c.parents ?? []).map((p) => p.sha ?? "").filter(Boolean),
      })
    }
  }

  const importPayload = {
    full_name: repoFullName,
    project_name: project_name ?? repoInfo?.name ?? repoFullName.split("/").pop(),
    description: repoInfo?.description ?? null,
    visibility: repoInfo?.private ? "private" : "public",
    default_branch: defaultBranch,
    github_id: repoInfo?.id != null ? String(repoInfo.id) : null,
    language: repoInfo?.language ?? null,
    org_github_login: repoInfo?.owner?.type === "Organization" ? orgLogin : null,
    org_name: repoInfo?.owner?.type === "Organization" ? orgLogin : null,
    branches: branchPayload,
    commits: commitPayload,
    members,
  }

  // 8. Call backend /import-full
  const backendRes = await proxyBackendRequest({
    method: "POST",
    path: "/api/v1/repositories/import-full",
    token,
    userId,
    body: importPayload,
    timeoutMs: 60_000,
  })

  const backendData = (await backendRes.json().catch(() => ({}))) as {
    members_to_invite?: Array<{ email: string; github_login?: string | null; role: string; project_id: string }>
    project_id?: string
  }

  if (backendRes.status !== 201) {
    return NextResponse.json(backendData, { status: backendRes.status })
  }

  // 9. Send Clerk invitations for members who need one
  const membersToInvite = backendData.members_to_invite ?? []
  let invitedCount = 0
  let alreadyMemberCount = 0
  const invitationErrors: string[] = []

  for (const member of membersToInvite) {
    if (!member.email) continue
    try {
      // Check if they already have a Clerk account
      const existingUsers = await client.users.getUserList({ emailAddress: [member.email] })
      if ((existingUsers?.data?.length ?? 0) > 0) {
        alreadyMemberCount += 1
        continue
      }

      // Send platform invitation (Clerk allowlist / invitation)
      await client.invitations.createInvitation({
        emailAddress: member.email,
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sign-up`,
        publicMetadata: {
          invited_project_id: member.project_id,
          invited_role: member.role,
          invited_github_login: member.github_login ?? null,
        },
        ignoreExisting: true,
      })
      invitedCount += 1
    } catch (err) {
      invitationErrors.push(`${member.email}: ${String(err)}`)
    }
  }

  return NextResponse.json(
    {
      ...backendData,
      invited_count: invitedCount,
      already_member_count: alreadyMemberCount,
      invitation_errors: invitationErrors.length > 0 ? invitationErrors : undefined,
    },
    { status: 201 },
  )
}
