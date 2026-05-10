import { auth, currentUser } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"
import { createHash } from "node:crypto"
import { extractRoleFromClaims, normalizeRole, type AppRole } from "@/lib/roles"
import {
  isTerminalAnalysisStatus,
  normalizeAnalysisStatus,
} from "@/lib/domain/analysis-status"
import { resolveDurationLabel } from "@/lib/domain/dates"
import { resolveGithubTokenForUser } from "@/lib/server/github/auth"
import {
  buildGithubHeaders,
  GITHUB_API_BASE_URL,
  normalizeGithubError,
} from "@/lib/server/github/client"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const BACKEND_FETCH_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS ?? "15000") || 15_000,
)
const BACKEND_WRITE_TIMEOUT_MS = Math.max(
  2_000,
  Number(process.env.DASHBOARD_BACKEND_WRITE_TIMEOUT_MS ?? "30000") || 30_000,
)

const COMMIT_SHA_PATTERN = /^[0-9a-fA-F]{6,64}$/
const REPO_PATTERN = /^[^/\s]+\/[^/\s]+$/
const MAX_GITHUB_SNAPSHOT_FILES = 220
const MAX_GITHUB_SNAPSHOT_FILE_BYTES = 200_000
const MAX_GITHUB_SNAPSHOT_TOTAL_BYTES = 1_500_000
const MAX_GITHUB_SNAPSHOT_DIFF_BYTES = 1_850_000
const DASHBOARD_ANALYSES_DEFAULT_SIZE = 40
const DASHBOARD_ANALYSES_MIN_SIZE = 10
const DASHBOARD_ANALYSES_MAX_SIZE = 100
const DASHBOARD_ANALYSES_ROUTE_CACHE_TTL_MS = 5_000

type CreateAnalysisBody = {
  repo?: unknown
  project_id?: unknown
  pr_number?: unknown
  commit_sha?: unknown
  diff_text?: unknown
  metadata?: unknown
}

type BackendAnalysisListItem = {
  analysis_id?: string
  project_id?: string | null
  repo?: string
  pr_number?: number | null
  commit_sha?: string | null
  status?: string
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
  findings_count?: number
  blocker_count?: number
  warn_count?: number
  info_count?: number
}

type BackendAnalysisListResponse = {
  items?: BackendAnalysisListItem[]
}

type DashboardAnalysisListItem = {
  id: string
  projectId: string | null
  repo: string
  prLabel: string
  commitSha: string | null
  author: string
  status: string
  createdAt: string
  updatedAt: string
  durationLabel: string
  blockerCount: number
  warnCount: number
  infoCount: number
}

type AnalysesRouteCacheEntry = {
  expiresAt: number
  items: DashboardAnalysisListItem[]
}

type ParsedCreateAnalysisBody = {
  repo: string
  projectId: string
  diffText: string | null
  prNumber: number | null
  commitSha: string | null
  metadata: Record<string, unknown>
}

type GithubPullDetails = {
  title?: string
  head?: { sha?: string } | null
  base?: { sha?: string } | null
}

type GithubCommitDetails = {
  sha?: string
}

type GithubRepositoryDetails = {
  default_branch?: string
}

type GithubBranchDetails = {
  name?: string
  commit?: {
    sha?: string
    commit?: {
      tree?: {
        sha?: string
      } | null
    } | null
  } | null
}

type GithubTreeEntry = {
  path?: string
  type?: string
  sha?: string
  size?: number
}

type GithubTreeDetails = {
  tree?: GithubTreeEntry[]
  truncated?: boolean
}

type GithubBlobDetails = {
  content?: string
  encoding?: string
}

type GithubDiffResolution = {
  diffText: string
  resolvedCommitSha: string | null
  metadataUpdates: Record<string, unknown>
}

const analysesRouteCache = new Map<string, AnalysesRouteCacheEntry>()

function isUnifiedDiff(text: string): boolean {
  return text.includes("diff --git") || text.includes("@@")
}

function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9-_.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") ?? ""
}

function normalizeRepo(rawRepo: string): { repo: string; normalized: boolean; originalRepo: string | null } {
  if (REPO_PATTERN.test(rawRepo)) {
    return { repo: rawRepo, normalized: false, originalRepo: null }
  }
  const segment = slugifySegment(rawRepo) || "manual-repo"
  return {
    repo: `local/${segment}`,
    normalized: true,
    originalRepo: rawRepo,
  }
}

function inferFilePathFromMetadata(metadata: Record<string, unknown>, fallbackRepo: string): string {
  const metadataFileName = metadata.imported_file_name
  if (typeof metadataFileName === "string" && metadataFileName.trim().length > 0) {
    return metadataFileName.trim().replace(/\\/g, "/")
  }
  const repoTail = fallbackRepo.split("/").pop() ?? "manual-change"
  return `${repoTail}.txt`
}

function synthesizeUnifiedDiff(content: string, filePath: string): string {
  const normalizedPath = filePath.replace(/^\/+/, "").replace(/\\/g, "/")
  const normalizedContent = content.replace(/\r\n/g, "\n")
  const rawLines = normalizedContent.split("\n")
  const safeLines = rawLines.length === 0 ? [""] : rawLines
  const additions = safeLines.map((line) => `+${line}`).join("\n")
  const lineCount = safeLines.length

  return [
    `diff --git a/${normalizedPath} b/${normalizedPath}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${normalizedPath}`,
    `@@ -0,0 +1,${lineCount} @@`,
    additions,
    "",
  ].join("\n")
}

const GITHUB_SNAPSHOT_EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".turbo",
  ".vercel",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".ruff_cache",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".idea",
  ".vscode",
])

const GITHUB_SNAPSHOT_EXCLUDED_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "poetry.lock",
  "semgrep_out.json",
  "semgrep_err.txt",
  "Thumbs.db",
])

const GITHUB_SNAPSHOT_SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
  ".kt",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".cs",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".swift",
  ".sql",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".md",
  ".txt",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".xml",
  ".sh",
  ".ps1",
  ".bat",
])

const GITHUB_SNAPSHOT_SUPPORTED_BASENAMES = new Set([".env", ".env.example", ".gitignore", "Dockerfile", "Makefile"])

function normalizePathForSnapshot(rawPath: string): string {
  return rawPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/")
}

function shouldIncludeGithubSnapshotPath(relativePath: string): boolean {
  const parts = normalizePathForSnapshot(relativePath).split("/").filter(Boolean)
  if (parts.length === 0) {
    return false
  }
  if (parts.some((part) => GITHUB_SNAPSHOT_EXCLUDED_DIRECTORIES.has(part))) {
    return false
  }
  const fileName = parts[parts.length - 1]
  if (GITHUB_SNAPSHOT_EXCLUDED_FILES.has(fileName)) {
    return false
  }
  const dotIndex = fileName.lastIndexOf(".")
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ""
  return (
    GITHUB_SNAPSHOT_SUPPORTED_EXTENSIONS.has(extension) || GITHUB_SNAPSHOT_SUPPORTED_BASENAMES.has(fileName)
  )
}

function isTextContent(content: string): boolean {
  return !content.includes("\u0000")
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf-8")
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

type GithubSnapshotFile = {
  path: string
  content: string
}

function synthesizeGithubSnapshotDiff(files: GithubSnapshotFile[]): string {
  return files
    .map(({ path, content }) => {
      const normalizedPath = normalizePathForSnapshot(path)
      const normalizedContent = content.replace(/\r\n/g, "\n")
      const lines = normalizedContent.length > 0 ? normalizedContent.split("\n") : []
      const additions = lines.map((line) => `+${line}`).join("\n")
      const hunkHeader = lines.length > 0 ? `@@ -0,0 +1,${lines.length} @@` : "@@ -0,0 +0,0 @@"
      return [
        `diff --git a/${normalizedPath} b/${normalizedPath}`,
        "new file mode 100644",
        "index 0000000..1111111",
        "--- /dev/null",
        `+++ b/${normalizedPath}`,
        hunkHeader,
        additions,
        "",
      ].join("\n")
    })
    .join("\n")
}

function deriveCommitSha(diffText: string): string {
  return createHash("sha1").update(diffText).digest("hex").slice(0, 12)
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeOptionalObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function extractBackendError(parsedBackendBody: unknown): {
  message: string | null
  details: Record<string, unknown> | null
  code: string | null
} {
  const topLevel = asRecord(parsedBackendBody)
  if (!topLevel) {
    return { message: null, details: null, code: null }
  }

  const nestedError = asRecord(topLevel.error)
  const topLevelErrorString = typeof topLevel.error === "string" ? asNonEmptyString(topLevel.error) : null

  const message =
    topLevelErrorString ??
    asNonEmptyString(topLevel.message) ??
    asNonEmptyString(topLevel.detail) ??
    (nestedError ? asNonEmptyString(nestedError.message) : null) ??
    (nestedError ? asNonEmptyString(nestedError.detail) : null)

  const details = asRecord(topLevel.details) ?? (nestedError ? asRecord(nestedError.details) : null)
  const code = asNonEmptyString(topLevel.code) ?? (nestedError ? asNonEmptyString(nestedError.code) : null)

  return { message, details, code }
}

function readStringFromClaims(claims: unknown, key: string): string | null {
  if (typeof claims !== "object" || claims === null) {
    return null
  }
  const value = (claims as Record<string, unknown>)[key]
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function extractEmailFromClaims(claims: unknown): string | undefined {
  const direct = readStringFromClaims(claims, "email")
  if (direct) {
    return direct
  }
  const emailAddress = readStringFromClaims(claims, "email_address")
  if (emailAddress) {
    return emailAddress
  }
  return undefined
}

function resolveUserRole(user: Awaited<ReturnType<typeof currentUser>>, claims: unknown): AppRole {
  const claimsRole = extractRoleFromClaims(claims)
  if (claimsRole !== "developer") {
    return claimsRole
  }
  const roleCandidate = user?.publicMetadata?.role ?? user?.unsafeMetadata?.role ?? user?.privateMetadata?.role
  if (typeof roleCandidate === "string" && roleCandidate.trim().length > 0) {
    return normalizeRole(roleCandidate)
  }
  return claimsRole
}

function extractAuthorLabel(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) {
    return null
  }
  const candidates = [
    metadata.author_name,
    metadata.author,
    metadata.author_login,
    metadata.actor,
    metadata.user_name,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return null
}

function isOwnedByUser(
  metadata: Record<string, unknown> | undefined,
  options: { userId: string; email: string | undefined },
): boolean {
  const { userId, email } = options
  if (!metadata) {
    return false
  }
  const idCandidates = [
    metadata.author_id,
    metadata.user_id,
    metadata.actor_id,
    metadata.clerk_user_id,
    metadata.github_actor_id,
  ]
  for (const candidate of idCandidates) {
    if (typeof candidate === "string" && candidate.trim() === userId) {
      return true
    }
  }
  if (email) {
    const emailCandidates = [metadata.author_email, metadata.user_email, metadata.actor_email]
    for (const candidate of emailCandidates) {
      if (typeof candidate === "string" && candidate.trim().toLowerCase() === email.toLowerCase()) {
        return true
      }
    }
  }
  return false
}

function hasOwnerIdentity(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) {
    return false
  }
  const identityCandidates = [
    metadata.author_id,
    metadata.user_id,
    metadata.actor_id,
    metadata.clerk_user_id,
    metadata.github_actor_id,
    metadata.author_email,
    metadata.user_email,
    metadata.actor_email,
  ]
  return identityCandidates.some((candidate) => typeof candidate === "string" && candidate.trim().length > 0)
}

function normalizeDashboardAnalysesSize(raw: string | null): number {
  if (!raw) {
    return DASHBOARD_ANALYSES_DEFAULT_SIZE
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return DASHBOARD_ANALYSES_DEFAULT_SIZE
  }
  const normalized = Math.floor(parsed)
  return Math.max(DASHBOARD_ANALYSES_MIN_SIZE, Math.min(DASHBOARD_ANALYSES_MAX_SIZE, normalized))
}

async function fetchBackendJSON<T>(path: string, token: string | null, userId: string): Promise<T | null> {
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (userId) {
    headers["X-User-Id"] = userId
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(`${BACKEND_API_BASE_URL}${path}`, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchGithubJson<T>(token: string | null, path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
    method: "GET",
    headers: buildGithubHeaders(token, "application/vnd.github+json"),
    cache: "no-store",
  })
  if (!response.ok) {
    const rawBody = await response.text()
    let parsedBody: unknown = rawBody
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody)
      } catch {
        parsedBody = rawBody
      }
    }
    throw new Error(normalizeGithubError(parsedBody))
  }
  return (await response.json()) as T
}

async function fetchGithubDiffText(token: string | null, path: string): Promise<string> {
  const response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
    method: "GET",
    headers: buildGithubHeaders(token, "application/vnd.github.v3.diff"),
    cache: "no-store",
  })
  if (!response.ok) {
    const rawBody = await response.text()
    let parsedBody: unknown = rawBody
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody)
      } catch {
        parsedBody = rawBody
      }
    }
    throw new Error(normalizeGithubError(parsedBody))
  }
  return await response.text()
}

async function fetchGithubBlobText(token: string | null, repo: string, blobSha: string): Promise<string | null> {
  const blob = await fetchGithubJson<GithubBlobDetails>(token, `/repos/${repo}/git/blobs/${blobSha}`)
  if (blob.encoding !== "base64" || typeof blob.content !== "string") {
    return null
  }
  try {
    const decoded = Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf-8")
    return isTextContent(decoded) ? decoded : null
  } catch {
    return null
  }
}

async function resolveGithubRepositorySnapshotDiff(options: {
  token: string | null
  repo: string
}): Promise<GithubDiffResolution> {
  const { token, repo } = options
  const repository = await fetchGithubJson<GithubRepositoryDetails>(token, `/repos/${repo}`)
  const defaultBranch = asNonEmptyString(repository.default_branch)
  if (!defaultBranch) {
    throw new Error("Impossible de determiner la branche par defaut GitHub pour ce repository.")
  }

  const branch = await fetchGithubJson<GithubBranchDetails>(token, `/repos/${repo}/branches/${encodeURIComponent(defaultBranch)}`)
  const commitSha = asNonEmptyString(branch.commit?.sha)
  const treeSha = asNonEmptyString(branch.commit?.commit?.tree?.sha)
  if (!commitSha || !treeSha) {
    throw new Error("Impossible de recuperer le commit/tarbre de la branche par defaut.")
  }

  const tree = await fetchGithubJson<GithubTreeDetails>(token, `/repos/${repo}/git/trees/${treeSha}?recursive=1`)
  if (tree.truncated === true) {
    throw new Error("Repository trop volumineux pour un snapshot complet via GitHub API.")
  }

  const entries = Array.isArray(tree.tree) ? tree.tree : []
  let ignoredFiles = 0
  const candidateEntries: GithubTreeEntry[] = []
  for (const entry of entries) {
    if (entry?.type !== "blob") {
      continue
    }
    if (typeof entry.path !== "string" || entry.path.trim().length === 0) {
      ignoredFiles += 1
      continue
    }
    if (typeof entry.sha !== "string" || entry.sha.trim().length === 0) {
      ignoredFiles += 1
      continue
    }
    if (!shouldIncludeGithubSnapshotPath(entry.path)) {
      ignoredFiles += 1
      continue
    }
    if (typeof entry.size === "number" && entry.size > MAX_GITHUB_SNAPSHOT_FILE_BYTES) {
      ignoredFiles += 1
      continue
    }
    candidateEntries.push(entry)
  }

  const files: GithubSnapshotFile[] = []
  let totalBytes = 0
  let stopBecauseOfLimits = false
  for (const entry of candidateEntries) {
    if (files.length >= MAX_GITHUB_SNAPSHOT_FILES) {
      stopBecauseOfLimits = true
      break
    }
    const safePath = entry.path as string
    const safeSha = entry.sha as string
    const content = await fetchGithubBlobText(token, repo, safeSha)
    if (content === null) {
      ignoredFiles += 1
      continue
    }

    const fileBytes = byteLength(content)
    if (fileBytes > MAX_GITHUB_SNAPSHOT_FILE_BYTES) {
      ignoredFiles += 1
      continue
    }
    if (totalBytes + fileBytes > MAX_GITHUB_SNAPSHOT_TOTAL_BYTES) {
      stopBecauseOfLimits = true
      break
    }

    files.push({
      path: safePath,
      content,
    })
    totalBytes += fileBytes
  }

  if (files.length === 0) {
    throw new Error("Aucun fichier texte exploitable n'a ete trouve pour ce repository.")
  }

  const diffText = synthesizeGithubSnapshotDiff(files)
  const diffBytes = byteLength(diffText)
  if (diffBytes > MAX_GITHUB_SNAPSHOT_DIFF_BYTES) {
    throw new Error(
      `Le snapshot du repository depasse la limite analysee (${formatBytes(diffBytes)} > ${formatBytes(MAX_GITHUB_SNAPSHOT_DIFF_BYTES)}).`,
    )
  }

  return {
    diffText,
    resolvedCommitSha: commitSha,
    metadataUpdates: {
      diff_source: "github_repo_snapshot",
      github_default_branch: defaultBranch,
      github_commit_sha: commitSha,
      github_snapshot_files_count: files.length,
      github_snapshot_ignored_files_count: ignoredFiles,
      github_snapshot_text_bytes: totalBytes,
      github_snapshot_diff_bytes: diffBytes,
      github_snapshot_truncated_by_limits: stopBecauseOfLimits,
    },
  }
}

async function resolveGithubDiff(options: {
  token: string | null
  repo: string
  prNumber: number | null
  commitSha: string | null
}): Promise<GithubDiffResolution> {
  const { token, repo, prNumber, commitSha } = options
  if (prNumber !== null) {
    const pullPath = `/repos/${repo}/pulls/${prNumber}`
    const [pullDetails, diffText] = await Promise.all([
      fetchGithubJson<GithubPullDetails>(token, pullPath),
      fetchGithubDiffText(token, pullPath),
    ])
    return {
      diffText,
      resolvedCommitSha:
        typeof pullDetails?.head?.sha === "string" && pullDetails.head.sha.trim().length > 0
          ? pullDetails.head.sha
          : commitSha,
      metadataUpdates: {
        github_pr_number: prNumber,
        github_pr_title: typeof pullDetails?.title === "string" ? pullDetails.title : null,
        github_head_sha:
          typeof pullDetails?.head?.sha === "string" && pullDetails.head.sha.trim().length > 0
            ? pullDetails.head.sha
            : null,
        github_base_sha:
          typeof pullDetails?.base?.sha === "string" && pullDetails.base.sha.trim().length > 0
            ? pullDetails.base.sha
            : null,
        diff_source: "github_pr",
      },
    }
  }

  if (commitSha) {
    const commitPath = `/repos/${repo}/commits/${commitSha}`
    const [commitDetails, diffText] = await Promise.all([
      fetchGithubJson<GithubCommitDetails>(token, commitPath),
      fetchGithubDiffText(token, commitPath),
    ])
    const normalizedSha =
      typeof commitDetails?.sha === "string" && commitDetails.sha.trim().length > 0 ? commitDetails.sha : commitSha
    return {
      diffText,
      resolvedCommitSha: normalizedSha,
      metadataUpdates: {
        github_commit_sha: normalizedSha,
        diff_source: "github_commit",
      },
    }
  }

  throw new Error("PR number or commit SHA is required for GitHub remote analysis.")
}

function parseCreateAnalysisBody(rawBody: CreateAnalysisBody) {
  const repo = asNonEmptyString(rawBody.repo)
  const projectId = asNonEmptyString(rawBody.project_id)
  const diffText = asNonEmptyString(rawBody.diff_text)
  if (!repo) {
    return { ok: false as const, error: "Le champ 'repo' est obligatoire." }
  }
  if (!projectId) {
    return {
      ok: false as const,
      error: "Le champ 'project_id' est obligatoire: une analyse doit etre liee a un projet existant.",
    }
  }

  let prNumber: number | null = null
  if (rawBody.pr_number !== undefined && rawBody.pr_number !== null && rawBody.pr_number !== "") {
    const candidate =
      typeof rawBody.pr_number === "number" ? rawBody.pr_number : Number(String(rawBody.pr_number))
    if (!Number.isInteger(candidate) || candidate < 1) {
      return { ok: false as const, error: "Le champ 'pr_number' doit etre un entier positif." }
    }
    prNumber = candidate
  }

  let commitSha: string | null = null
  if (rawBody.commit_sha !== undefined && rawBody.commit_sha !== null && rawBody.commit_sha !== "") {
    const normalizedCommit = asNonEmptyString(rawBody.commit_sha)
    if (!normalizedCommit || !COMMIT_SHA_PATTERN.test(normalizedCommit)) {
      return {
        ok: false as const,
        error: "Le champ 'commit_sha' doit contenir entre 6 et 64 caracteres hexadecimaux.",
      }
    }
    commitSha = normalizedCommit
  }

  return {
    ok: true as const,
    value: {
      repo,
      projectId,
      diffText,
      prNumber,
      commitSha,
      metadata: normalizeOptionalObject(rawBody.metadata),
    } satisfies ParsedCreateAnalysisBody,
  }
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const { userId, getToken, sessionClaims } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let token: string | null = null
  try {
    token = await getToken()
  } catch (error) {
    console.error("Failed to get Clerk token for analyses GET:", error)
  }
  const role = resolveUserRole(null, sessionClaims)
  const email = extractEmailFromClaims(sessionClaims)
  const size = normalizeDashboardAnalysesSize(request.nextUrl.searchParams.get("size"))
  const projectFilter = asNonEmptyString(request.nextUrl.searchParams.get("project_id"))?.toLowerCase() ?? null
  const repoFilter = asNonEmptyString(request.nextUrl.searchParams.get("repo"))?.toLowerCase() ?? null
  const cacheKey = `${userId}:${role}:${email ?? ""}:${size}:${projectFilter ?? "-"}:${repoFilter ?? "-"}`
  const now = Date.now()
  const cachedEntry = analysesRouteCache.get(cacheKey)
  if (cachedEntry && cachedEntry.expiresAt > now) {
    return NextResponse.json({ items: cachedEntry.items }, { status: 200 })
  }

  const listPayload = await fetchBackendJSON<BackendAnalysisListResponse>(`/v1/analyses?page=1&size=${size}`, token, userId)
  if (!listPayload || !Array.isArray(listPayload.items)) {
    return NextResponse.json({ items: [] }, { status: 200 })
  }

  const baseItems = listPayload.items
    .filter((item) => typeof item.analysis_id === "string" && typeof item.repo === "string")
    .map((item) => {
      const metadata = normalizeOptionalObject(item.metadata)
      const author = extractAuthorLabel(metadata) ?? "Unknown"
      const status = normalizeAnalysisStatus(item.status)
      return {
        id: item.analysis_id as string,
        projectId: typeof item.project_id === "string" && item.project_id.trim().length > 0
          ? item.project_id
          : (typeof metadata.project_id === "string" && metadata.project_id.trim().length > 0
            ? metadata.project_id
            : null),
        repo: item.repo as string,
        prLabel: typeof item.pr_number === "number" ? `PR #${item.pr_number}` : "Commit",
        commitSha: typeof item.commit_sha === "string" ? item.commit_sha : null,
        author,
        status,
        createdAt: typeof item.created_at === "string" ? item.created_at : "",
        updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
        durationLabel: resolveDurationLabel(item.created_at, item.updated_at, isTerminalAnalysisStatus(status)),
        blockerCount: typeof item.blocker_count === "number" ? item.blocker_count : 0,
        warnCount: typeof item.warn_count === "number" ? item.warn_count : 0,
        infoCount: typeof item.info_count === "number" ? item.info_count : 0,
        metadata,
      }
    })
    .sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""))

  const scopedItems =
    role === "developer"
      ? baseItems.filter((item) =>
          isOwnedByUser(item.metadata, {
            userId,
            email: email ?? undefined,
          }) || !hasOwnerIdentity(item.metadata),
        )
      : baseItems

  const filteredByProject = scopedItems.filter((item) => {
    const normalizedProject = item.projectId?.trim().toLowerCase() ?? null
    const normalizedRepo = item.repo.trim().toLowerCase()
    if (projectFilter && normalizedProject !== projectFilter) {
      return false
    }
    if (repoFilter && normalizedRepo !== repoFilter) {
      return false
    }
    return true
  })

  const selectedItems = filteredByProject.slice(0, size)
  const enrichedItems: DashboardAnalysisListItem[] = selectedItems.map((item) => ({
    id: item.id,
    projectId: item.projectId,
    repo: item.repo,
    prLabel: item.prLabel,
    commitSha: item.commitSha,
    author: item.author,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    durationLabel: item.durationLabel,
    blockerCount: item.blockerCount,
    warnCount: item.warnCount,
    infoCount: item.infoCount,
  }))

  analysesRouteCache.set(cacheKey, {
    expiresAt: now + DASHBOARD_ANALYSES_ROUTE_CACHE_TTL_MS,
    items: enrichedItems,
  })

  return NextResponse.json({ items: enrichedItems }, { status: 200 })
  } catch (error) {
    console.error("Error in analyses GET:", error)
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, getToken, orgId, orgRole, orgSlug, sessionClaims } = await auth()
    
    if (!userId) {
      console.error("POST /api/dashboard/analyses: No userId from auth()")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log(`POST /api/dashboard/analyses: Authenticated user ${userId}, org: ${orgId}, role: ${orgRole}`)

    let token: string | null = null
    try {
      token = await getToken()
    } catch (tokenError) {
      console.error("POST /api/dashboard/analyses: Token generation failed:", tokenError)
      return NextResponse.json({ 
        error: "Authentication token error",
        details: tokenError instanceof Error ? tokenError.message : "Unknown token error"
      }, { status: 401 })
    }

    if (!token) {
      console.error("POST /api/dashboard/analyses: getToken() returned null")
      return NextResponse.json({ 
        error: "Missing Clerk token",
        debug: {
          userId: !!userId,
          hasGetToken: typeof getToken === 'function',
          orgId,
          orgRole,
          sessionExists: !!sessionClaims
        }
      }, { status: 401 })
    }

    console.log(`POST /api/dashboard/analyses: Got token (length: ${token.length})`)

  let rawBody: CreateAnalysisBody
  try {
    rawBody = (await request.json()) as CreateAnalysisBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = parseCreateAnalysisBody(rawBody)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const repoNormalization = normalizeRepo(parsed.value.repo)
  let commitSha = parsed.value.commitSha
  const metadata = {
    ...parsed.value.metadata,
  }

  const analysisInputMode = typeof metadata.analysis_input_mode === "string" ? metadata.analysis_input_mode : null
  const wantsGithubRemoteDiff =
    analysisInputMode === "github_remote" ||
    (metadata.repo_selected_from_github === true && parsed.value.diffText === null)

  let normalizedDiffText = wantsGithubRemoteDiff ? "" : (parsed.value.diffText ?? "")
  if (wantsGithubRemoteDiff) {
    if (repoNormalization.normalized) {
      return NextResponse.json(
        {
          error: "Le repository GitHub doit respecter le format owner/repo.",
        },
        { status: 400 },
      )
    }

    const githubOauthToken = await resolveGithubTokenForUser(userId)
    metadata.github_auth_mode = githubOauthToken ? "oauth" : "public_unauthenticated"

    try {
      const githubDiff =
        parsed.value.prNumber !== null || commitSha
          ? await resolveGithubDiff({
              token: githubOauthToken,
              repo: repoNormalization.repo,
              prNumber: parsed.value.prNumber,
              commitSha,
            })
          : await resolveGithubRepositorySnapshotDiff({
              token: githubOauthToken,
              repo: repoNormalization.repo,
            })
      normalizedDiffText = githubDiff.diffText
      if (githubDiff.resolvedCommitSha) {
        commitSha = githubDiff.resolvedCommitSha
      }
      metadata.diff_fetched_from_github = true
      metadata.workspace_source = "github_remote"
      metadata.github_repo = repoNormalization.repo
      Object.assign(metadata, githubDiff.metadataUpdates)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de recuperer le diff depuis GitHub."
      const appended =
        githubOauthToken === null
          ? `${message}. Aucun token OAuth GitHub detecte: pour les repos prives, reconnectez GitHub dans Clerk.`
          : message
      return NextResponse.json({ error: appended }, { status: 400 })
    }
  }

  if (!normalizedDiffText.trim()) {
    return NextResponse.json(
      {
        error: "Aucun diff disponible. Importez un dossier local ou utilisez GitHub distant (PR/commit/repo complet).",
      },
      { status: 400 },
    )
  }

  if (!isUnifiedDiff(normalizedDiffText)) {
    if (metadata.diff_fetched_from_github === true) {
      return NextResponse.json(
        {
          error: "GitHub n'a pas retourne un diff unifie exploitable pour cette analyse distante.",
        },
        { status: 400 },
      )
    }
    const inferredPath = inferFilePathFromMetadata(metadata, repoNormalization.repo)
    normalizedDiffText = synthesizeUnifiedDiff(normalizedDiffText, inferredPath)
    metadata.diff_synthesized = true
    metadata.diff_synthesized_path = inferredPath
  }

  if (parsed.value.prNumber === null && !commitSha) {
    commitSha = deriveCommitSha(normalizedDiffText)
    metadata.commit_sha_autogenerated = true
  }
  if (repoNormalization.normalized) {
    metadata.original_repo_input = repoNormalization.originalRepo
    metadata.repo_normalized = repoNormalization.repo
  }

  const user = await currentUser()
  const primaryEmail =
    user?.emailAddresses?.find((address) => address.id === user?.primaryEmailAddressId)?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress
  const displayName = firstNonEmpty(
    [user?.firstName, user?.lastName].filter(Boolean).join(" "),
    user?.fullName ?? undefined,
    user?.username ?? undefined,
  )
  const claims = (sessionClaims as Record<string, unknown> | null | undefined) ?? {}
  const orgNameCandidate = firstNonEmpty(
    typeof claims.org_name === "string" ? claims.org_name : undefined,
    typeof claims.organization_name === "string" ? claims.organization_name : undefined,
  )

  const enrichedMetadata = {
    ...metadata,
    trigger: "dashboard_manual",
    author_id: userId,
    author_email: primaryEmail ?? null,
    author_name: displayName ?? null,
    clerk_user_id: userId,
    org_id: orgId ?? null,
    org_slug: orgSlug ?? null,
    org_name: orgNameCandidate ?? null,
    org_role: orgRole ?? null,
  }

  const writeController = new AbortController()
  const writeTimeout = setTimeout(() => writeController.abort(), BACKEND_WRITE_TIMEOUT_MS)
  let backendResponse: Response
  try {
    backendResponse = await fetch(`${BACKEND_API_BASE_URL}/v1/analyses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "manual",
        repo: repoNormalization.repo,
        project_id: parsed.value.projectId,
        pr_number: parsed.value.prNumber,
        commit_sha: commitSha,
        diff_text: normalizedDiffText,
        metadata: enrichedMetadata,
      }),
      signal: writeController.signal,
      cache: "no-store",
    })
  } catch {
    return NextResponse.json(
      {
        error: "Backend timeout while creating analysis",
        backend_timeout_ms: BACKEND_WRITE_TIMEOUT_MS,
      },
      { status: 504 },
    )
  } finally {
    clearTimeout(writeTimeout)
  }

  const rawBackendBody = await backendResponse.text()
  let parsedBackendBody: unknown = {}
  if (rawBackendBody) {
    try {
      parsedBackendBody = JSON.parse(rawBackendBody)
    } catch {
      parsedBackendBody = { detail: rawBackendBody }
    }
  }

  if (!backendResponse.ok) {
    // Never proxy a backend 404 as-is: the browser would interpret it as
    // "Next.js route not found" rather than "resource not found on backend".
    // Map backend 404 â†’ 422 (Unprocessable Entity) so the client can distinguish
    // a missing project/resource from a missing API route.
    const proxyStatus = backendResponse.status === 404 ? 422 : backendResponse.status
    const backendError = extractBackendError(parsedBackendBody)
    const fallbackMessage = "Failed to create analysis"
    return NextResponse.json(
      {
        error: backendError.message ?? fallbackMessage,
        message: backendError.message ?? fallbackMessage,
        code: backendError.code,
        details: backendError.details,
        backend_status: backendResponse.status,
        backend_response: parsedBackendBody,
      },
      { status: proxyStatus },
    )
  }

  return NextResponse.json(parsedBackendBody, { status: backendResponse.status })
  } catch (error) {
    console.error("POST /api/dashboard/analyses: Unexpected error:", error)
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}
