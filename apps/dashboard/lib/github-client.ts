/**
 * Server-side GitHub client helpers for dashboard API routes.
 *
 * All functions are intended to be called from server-side Next.js route
 * handlers â€” NEVER import this from client components.
 */

import {
  resolveGithubTokenForUser,
  resolveGithubTokensForUser,
} from "./server/github/auth"
import {
  buildGithubHeaders,
  normalizeGithubError,
  requestGithub,
} from "./server/github/client"

type GitHubRepository = {
  name: string
  full_name: string
  default_branch: string
  owner: {
    login: string
    type: string
  }
  permissions?: {
    admin?: boolean
    maintain?: boolean
    push?: boolean
    triage?: boolean
    pull?: boolean
  }
}

type GitReference = {
  ref: string
  object?: {
    sha?: string
  }
}

type GitCommit = {
  sha: string
  tree?: {
    sha?: string
  }
}

type GitTreeEntry = {
  path: string
  mode?: string
  type: "blob" | "tree" | "commit"
  sha?: string
  size?: number
}

type GitTreeChange = {
  path: string
  mode?: string
  type?: "blob" | "tree" | "commit"
  sha?: string | null
  content?: string
}

// â”€â”€ Low-level helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export { buildGithubHeaders, normalizeGithubError, requestGithub }

function normalizeGitPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "")
    .trim()
}

function toBlobTreeChange(change: GitTreeChange): Record<string, unknown> {
  const path = normalizeGitPath(change.path)
  if (!path) {
    throw new Error("Git tree change path is required")
  }

  const payload: Record<string, unknown> = {
    path,
    mode: change.mode ?? "100644",
    type: change.type ?? "blob",
  }

  if (typeof change.content === "string") {
    payload.content = change.content
    return payload
  }

  payload.sha = change.sha ?? null
  return payload
}

// â”€â”€ Auth / token resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export {
  resolveGithubInstallationToken,
  resolveGithubTokenForUser,
  resolveGithubTokensForUser,
} from "./server/github/auth"

// â”€â”€ User / scope checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getGithubUser(token: string) {
  return (await requestGithub("/user", { method: "GET" }, token)) as {
    login: string
    id: number
    avatar_url: string
    [k: string]: unknown
  }
}

export async function isUserMemberOfTeam(
  org: string,
  teamSlug: string,
  username: string,
  token?: string | null,
): Promise<boolean> {
  try {
    await requestGithub(
      `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`,
      { method: "GET" },
      token,
    )
    return true
  } catch (e: unknown) {
    if ((e as { status?: number })?.status === 404) return false
    throw e
  }
}

export async function isUserMemberOfOrg(
  org: string,
  username: string,
  token?: string | null,
): Promise<boolean> {
  try {
    await requestGithub(
      `/orgs/${encodeURIComponent(org)}/members/${encodeURIComponent(username)}`,
      { method: "GET" },
      token,
    )
    return true
  } catch (e: unknown) {
    if ((e as { status?: number })?.status === 404) return false
    throw e
  }
}

export async function isUserAllowedInScope(
  token: string | null,
  username: string,
): Promise<boolean> {
  const teamsEnv = process.env.ALLOWED_GITHUB_TEAMS || ""
  const orgsEnv = process.env.ALLOWED_GITHUB_ORGS || ""

  if (teamsEnv) {
    const entries = teamsEnv.split(",").map((s) => s.trim()).filter(Boolean)
    for (const entry of entries) {
      const [org, team] = entry.split(":").map((s) => s.trim())
      if (!org || !team) continue
      try {
        if (await isUserMemberOfTeam(org, team, username, token)) return true
      } catch {
        // continue
      }
    }
    return false
  }

  if (orgsEnv) {
    const orgs = orgsEnv.split(",").map((s) => s.trim()).filter(Boolean)
    for (const org of orgs) {
      try {
        if (await isUserMemberOfOrg(org, username, token)) return true
      } catch {
        // continue
      }
    }
    return false
  }

  // No restrictions configured â€” allow by default in dev
  return true
}

// â”€â”€ File operations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token?: string | null,
): Promise<{ content: string; sha: string }> {
  const res = (await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
    { method: "GET" },
    token,
  )) as { content?: string; sha?: string }
  const b64 = res?.content
  const sha = res?.sha ?? ""
  const content = b64 ? Buffer.from(String(b64), "base64").toString("utf8") : ""
  return { content, sha }
}

export async function getRepository(
  owner: string,
  repo: string,
  token?: string | null,
): Promise<GitHubRepository> {
  return (await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { method: "GET" },
    token,
  )) as GitHubRepository
}

export async function getRepoTree(
  owner: string,
  repo: string,
  ref: string,
  token?: string | null,
): Promise<Array<{ path: string; type: string; sha: string; mode?: string; size?: number }>> {
  const res = (await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    { method: "GET" },
    token,
  )) as { tree?: Array<{ path: string; type: string; sha: string; mode?: string; size?: number }> }
  return res?.tree ?? []
}

async function getBranchReference(
  owner: string,
  repo: string,
  branch: string,
  token?: string | null,
): Promise<GitReference> {
  return (await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`,
    { method: "GET" },
    token,
  )) as GitReference
}

async function getCommit(
  owner: string,
  repo: string,
  sha: string,
  token?: string | null,
): Promise<GitCommit> {
  return (await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(sha)}`,
    { method: "GET" },
    token,
  )) as GitCommit
}

async function createTree(params: {
  owner: string
  repo: string
  baseTreeSha: string
  changes: GitTreeChange[]
  token?: string | null
}): Promise<{ sha: string }> {
  const { owner, repo, baseTreeSha, changes, token } = params
  return (await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`,
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: changes.map(toBlobTreeChange),
      }),
    },
    token,
  )) as { sha: string }
}

async function createCommitObject(params: {
  owner: string
  repo: string
  message: string
  treeSha: string
  parentSha: string
  token?: string | null
}): Promise<{ sha: string }> {
  const { owner, repo, message, treeSha, parentSha, token } = params
  return (await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [parentSha],
      }),
    },
    token,
  )) as { sha: string }
}

async function updateBranchReference(params: {
  owner: string
  repo: string
  branch: string
  commitSha: string
  token?: string | null
}): Promise<{ ref: string; object?: { sha?: string } }> {
  const { owner, repo, branch, commitSha, token } = params
  return (await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        sha: commitSha,
        force: false,
      }),
    },
    token,
  )) as { ref: string; object?: { sha?: string } }
}

export async function commitTreeChanges(params: {
  owner: string
  repo: string
  branch: string
  message: string
  changes: GitTreeChange[]
  token?: string | null
}) {
  const { owner, repo, branch, message, changes, token } = params
  if (!changes.length) {
    throw new Error("At least one tree change is required")
  }

  const branchRef = await getBranchReference(owner, repo, branch, token)
  const headSha = branchRef?.object?.sha
  if (!headSha) {
    const err: Error & { status?: number } = new Error(
      `Unable to resolve HEAD for branch ${branch}`,
    )
    err.status = 404
    throw err
  }

  const headCommit = await getCommit(owner, repo, headSha, token)
  const baseTreeSha = headCommit?.tree?.sha
  if (!baseTreeSha) {
    const err: Error & { status?: number } = new Error(
      `Unable to resolve tree for branch ${branch}`,
    )
    err.status = 500
    throw err
  }

  try {
    const tree = await createTree({
      owner,
      repo,
      baseTreeSha,
      changes,
      token,
    })
    const commit = await createCommitObject({
      owner,
      repo,
      message,
      treeSha: tree.sha,
      parentSha: headSha,
      token,
    })
    await updateBranchReference({
      owner,
      repo,
      branch,
      commitSha: commit.sha,
      token,
    })

    return {
      branch,
      baseCommitSha: headSha,
      treeSha: tree.sha,
      commitSha: commit.sha,
    }
  } catch (err: unknown) {
    const error = err as { status?: number; body?: unknown }
    if (error?.status === 409 || error?.status === 422) {
      const latestHead = await getBranchReference(owner, repo, branch, token).catch(
        () => null,
      )
      const conflictErr: Error & { status?: number; body?: unknown } = new Error(
        "Conflict while updating branch",
      )
      conflictErr.status = 409
      conflictErr.body = {
        ...((error.body && typeof error.body === "object"
          ? error.body
          : {}) as Record<string, unknown>),
        conflict: true,
        latestHeadSha: latestHead?.object?.sha ?? null,
      }
      throw conflictErr
    }
    throw err
  }
}

export async function createOrUpdateFile(params: {
  owner: string
  repo: string
  path: string
  content: string
  branch: string
  message?: string | null
  token?: string | null
}) {
  const { owner, repo, path, content, branch, message, token } = params
  const contentB64 = Buffer.from(content, "utf8").toString("base64")

  // Check if file exists on the target branch to get its SHA
  let existingSha: string | null = null
  try {
    const getRes = (await requestGithub(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
      { method: "GET" },
      token,
    )) as { sha?: string }
    existingSha = getRes?.sha ?? null
  } catch (err: unknown) {
    if ((err as { status?: number })?.status !== 404) throw err
    // 404 means new file â€” that's fine
  }

  const body: Record<string, unknown> = {
    message: message ?? (existingSha ? `Update ${path}` : `Create ${path}`),
    content: contentB64,
    branch,
  }
  if (existingSha) body.sha = existingSha

  try {
    return await requestGithub(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`,
      { method: "PUT", body: JSON.stringify(body) },
      token,
    )
  } catch (err: unknown) {
    const e = err as { status?: number; body?: unknown }
    if (e?.status === 409 || e?.status === 422) {
      const latest = await fetchFileContent(owner, repo, path, branch, token).catch(
        () => null,
      )
      const conflictErr: Error & { status?: number; body?: unknown } = new Error(
        "Conflict while updating file",
      )
      conflictErr.status = e.status
      conflictErr.body = {
        ...((e.body && typeof e.body === "object" ? e.body : {}) as Record<string, unknown>),
        conflict: true,
        latest,
      }
      throw conflictErr
    }
    throw err
  }
}

export async function deleteFile(params: {
  owner: string
  repo: string
  path: string
  branch: string
  message?: string | null
  token?: string | null
}) {
  const { owner, repo, path, branch, message, token } = params

  // Get the current SHA
  const getRes = (await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
    { method: "GET" },
    token,
  )) as { sha?: string }

  const sha = getRes?.sha
  if (!sha) throw new Error(`File not found: ${path}`)

  return await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`,
    {
      method: "DELETE",
      body: JSON.stringify({
        message: message ?? `Delete ${path}`,
        sha,
        branch,
      }),
    },
    token,
  )
}

export async function createFolder(params: {
  owner: string
  repo: string
  path: string
  branch: string
  message?: string | null
  token?: string | null
}) {
  const { owner, repo, path, branch, message, token } = params
  const normalizedPath = normalizeGitPath(path)
  if (!normalizedPath) {
    throw new Error("Folder path is required")
  }

  const placeholderPath = `${normalizedPath}/.gitkeep`
  return await commitTreeChanges({
    owner,
    repo,
    branch,
    message: message ?? `Create folder ${normalizedPath}`,
    changes: [{ path: placeholderPath, content: "" }],
    token,
  })
}

export async function deletePath(params: {
  owner: string
  repo: string
  path: string
  branch: string
  message?: string | null
  token?: string | null
}) {
  const { owner, repo, path, branch, message, token } = params
  const normalizedPath = normalizeGitPath(path)
  if (!normalizedPath) {
    throw new Error("Path is required")
  }

  const tree = await getRepoTree(owner, repo, branch, token)
  const exactFile = tree.find(
    (entry) => entry.type === "blob" && normalizeGitPath(entry.path) === normalizedPath,
  )
  const prefix = `${normalizedPath}/`
  const folderFiles = tree.filter(
    (entry) => entry.type === "blob" && normalizeGitPath(entry.path).startsWith(prefix),
  )

  const targets = exactFile ? [exactFile] : folderFiles
  if (!targets.length) {
    const err: Error & { status?: number } = new Error(`Path not found: ${normalizedPath}`)
    err.status = 404
    throw err
  }

  return await commitTreeChanges({
    owner,
    repo,
    branch,
    message: message ?? `Delete ${normalizedPath}`,
    changes: targets.map((entry) => ({
      path: entry.path,
      sha: null,
      type: "blob",
      mode: entry.mode ?? "100644",
    })),
    token,
  })
}

export async function renamePath(params: {
  owner: string
  repo: string
  oldPath: string
  newPath: string
  branch: string
  message?: string | null
  token?: string | null
}) {
  const { owner, repo, oldPath, newPath, branch, message, token } = params
  const normalizedOldPath = normalizeGitPath(oldPath)
  const normalizedNewPath = normalizeGitPath(newPath)

  if (!normalizedOldPath || !normalizedNewPath) {
    throw new Error("Both oldPath and newPath are required")
  }
  if (normalizedOldPath === normalizedNewPath) {
    throw new Error("oldPath and newPath must be different")
  }

  const tree = await getRepoTree(owner, repo, branch, token)
  const exactFile = tree.find(
    (entry) => entry.type === "blob" && normalizeGitPath(entry.path) === normalizedOldPath,
  )
  const oldPrefix = `${normalizedOldPath}/`
  const folderFiles = tree.filter(
    (entry) => entry.type === "blob" && normalizeGitPath(entry.path).startsWith(oldPrefix),
  )
  const sourceFiles = exactFile ? [exactFile] : folderFiles

  if (!sourceFiles.length) {
    const err: Error & { status?: number } = new Error(
      `Path not found: ${normalizedOldPath}`,
    )
    err.status = 404
    throw err
  }

  const newPrefix = `${normalizedNewPath}/`
  const destinationExists = tree.some((entry) => {
    const entryPath = normalizeGitPath(entry.path)
    if (entry.type !== "blob") {
      return false
    }
    if (exactFile) {
      return entryPath === normalizedNewPath
    }
    return entryPath === normalizedNewPath || entryPath.startsWith(newPrefix)
  })

  if (destinationExists) {
    const err: Error & { status?: number } = new Error(
      `Destination already exists: ${normalizedNewPath}`,
    )
    err.status = 409
    throw err
  }

  const changes: GitTreeChange[] = []
  for (const entry of sourceFiles) {
    const destinationPath = exactFile
      ? normalizedNewPath
      : `${normalizedNewPath}/${normalizeGitPath(entry.path).slice(oldPrefix.length)}`

    changes.push({
      path: destinationPath,
      sha: entry.sha,
      type: "blob",
      mode: entry.mode ?? "100644",
    })
    changes.push({
      path: entry.path,
      sha: null,
      type: "blob",
      mode: entry.mode ?? "100644",
    })
  }

  return await commitTreeChanges({
    owner,
    repo,
    branch,
    message: message ?? `Rename ${normalizedOldPath} to ${normalizedNewPath}`,
    changes,
    token,
  })
}

// â”€â”€ Branch operations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function createBranch(params: {
  owner: string
  repo: string
  newBranch: string
  baseBranch?: string
  token?: string | null
}) {
  const { owner, repo, newBranch, baseBranch, token } = params
  const base = baseBranch ?? "main"

  const baseRef = (await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(base)}`,
    { method: "GET" },
    token,
  )) as { object?: { sha?: string } }

  const sha = baseRef?.object?.sha
  if (!sha) {
    const err: Error & { status?: number } = new Error(
      "Unable to resolve base commit SHA",
    )
    err.status = 500
    throw err
  }

  return await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
    {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
    },
    token,
  )
}

export async function listBranches(
  owner: string,
  repo: string,
  token?: string | null,
): Promise<Array<{ name: string; protected: boolean }>> {
  const res = (await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
    { method: "GET" },
    token,
  )) as Array<{ name: string; protected: boolean }>
  return res ?? []
}

// â”€â”€ Pull Request operations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function createPullRequest(params: {
  owner: string
  repo: string
  title: string
  body?: string | null
  head: string
  base?: string
  token?: string | null
}) {
  const { owner, repo, title, body, head, base, token } = params
  return await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({ title, head, base: base ?? "main", body }),
    },
    token,
  )
}

export async function listPullRequests(
  owner: string,
  repo: string,
  state: string = "open",
  token?: string | null,
) {
  return await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${encodeURIComponent(state)}&per_page=30`,
    { method: "GET" },
    token,
  )
}

export async function getPullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  token?: string | null,
) {
  return await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`,
    { method: "GET" },
    token,
  )
}

export async function mergePullRequest(params: {
  owner: string
  repo: string
  pullNumber: number
  mergeMethod?: "merge" | "squash" | "rebase"
  commitTitle?: string | null
  token?: string | null
}) {
  const { owner, repo, pullNumber, mergeMethod, commitTitle, token } = params
  return await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/merge`,
    {
      method: "PUT",
      body: JSON.stringify({
        merge_method: mergeMethod ?? "merge",
        ...(commitTitle ? { commit_title: commitTitle } : {}),
      }),
    },
    token,
  )
}

export async function getPullRequestFiles(
  owner: string,
  repo: string,
  pullNumber: number,
  token?: string | null,
) {
  return await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/files?per_page=100`,
    { method: "GET" },
    token,
  )
}

// â”€â”€ Review / comment operations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function createPullRequestReview(params: {
  owner: string
  repo: string
  pullNumber: number
  event: string
  body?: string | null
  token?: string | null
}) {
  const { owner, repo, pullNumber, event, body, token } = params
  return await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/reviews`,
    {
      method: "POST",
      body: JSON.stringify({ event, body }),
    },
    token,
  )
}

export async function addIssueComment(params: {
  owner: string
  repo: string
  issueNumber: number
  body: string
  token?: string | null
}) {
  const { owner, repo, issueNumber, body, token } = params
  return await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
    { method: "POST", body: JSON.stringify({ body }) },
    token,
  )
}

export async function createPullRequestInlineComment(params: {
  owner: string
  repo: string
  pullNumber: number
  path: string
  startLine?: number
  endLine?: number
  body: string
  token?: string | null
}) {
  const { owner, repo, pullNumber, path, startLine, endLine, body, token } = params

  // Get the PR to find the head commit SHA
  const pr = (await getPullRequest(owner, repo, pullNumber, token)) as {
    head?: { sha?: string }
  }
  const commitId = pr?.head?.sha
  if (!commitId) throw new Error("Cannot determine PR head commit SHA")

  const reviewBody: Record<string, unknown> = {
    body: "",
    event: "COMMENT",
    comments: [
      {
        path,
        body,
        ...(startLine && endLine && startLine !== endLine
          ? { start_line: startLine, line: endLine, start_side: "RIGHT", side: "RIGHT" }
          : { line: endLine ?? startLine ?? 1, side: "RIGHT" }),
      },
    ],
    commit_id: commitId,
  }

  return await requestGithub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/reviews`,
    { method: "POST", body: JSON.stringify(reviewBody) },
    token,
  )
}

export async function listPRComments(
  owner: string,
  repo: string,
  pullNumber: number,
  token?: string | null,
) {
  // Get both review comments (inline) and issue comments (general)
  const [reviewComments, issueComments] = await Promise.all([
    requestGithub(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/comments?per_page=100`,
      { method: "GET" },
      token,
    ).catch(() => []),
    requestGithub(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${pullNumber}/comments?per_page=100`,
      { method: "GET" },
      token,
    ).catch(() => []),
  ])

  return { reviewComments, issueComments }
}
