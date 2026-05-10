import { createSign } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { clerkClient } from "@clerk/nextjs/server"

let fallbackEnvCache: Record<string, string> | null = null

const GITHUB_OAUTH_PROVIDERS = ["github"] as const
const GITHUB_API_BASE_URL = getEnvValue("GITHUB_API_BASE_URL") || "https://api.github.com"
const GITHUB_INSTALLATION_TOKEN_SAFETY_SECONDS = 60

let cachedInstallationToken: { token: string; expiresAt: number } | null = null
let installationTokenPromise: Promise<string | null> | null = null

function envFlag(value: string | null | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase())
}

function getEnvValue(name: string): string | null {
  const direct = process.env[name]
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct
  }

  const fallback = loadFallbackEnv()[name]
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback
  }

  return null
}

function loadFallbackEnv(): Record<string, string> {
  if (fallbackEnvCache) {
    return fallbackEnvCache
  }

  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", ".env.local"),
    resolve(process.cwd(), "..", ".env"),
    resolve(process.cwd(), "..", "..", ".env.local"),
    resolve(process.cwd(), "..", "..", ".env"),
  ]

  const parsed: Record<string, string> = {}
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue
    }

    const contents = readFileSync(candidate, "utf8")
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue
      }

      const separatorIndex = trimmed.indexOf("=")
      const key = trimmed.slice(0, separatorIndex).trim()
      if (!key || parsed[key] != null) {
        continue
      }

      let value = trimmed.slice(separatorIndex + 1).trim()
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      if (quoted && value.length >= 2) {
        value = value.slice(1, -1)
      }
      parsed[key] = value.replaceAll("\\n", "\n")
    }
  }

  fallbackEnvCache = parsed
  return parsed
}

function parseEnvInt(value: string | null | undefined): number | null {
  if (typeof value !== "string") {
    return null
  }
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim()
  return trimmed.includes("\\n") ? trimmed.replaceAll("\\n", "\n") : trimmed
}

function base64UrlEncode(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

function createGitHubAppJwt(appId: number, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: String(appId),
    }),
  )
  const signingInput = `${header}.${payload}`
  const signer = createSign("RSA-SHA256")
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign(normalizePrivateKey(privateKey))
  return `${signingInput}.${base64UrlEncode(signature)}`
}

async function fetchGithubInstallationToken(): Promise<{ token: string; expiresAt: number } | null> {
  const appId = parseEnvInt(getEnvValue("GITHUB_APP_ID"))
  const installationId = parseEnvInt(getEnvValue("GITHUB_APP_INSTALLATION_ID"))
  const privateKey = getEnvValue("GITHUB_APP_PRIVATE_KEY_PEM")

  if (appId == null || installationId == null || !privateKey?.trim()) {
    return null
  }

  const jwt = createGitHubAppJwt(appId, privateKey)
  const response = await fetch(`${GITHUB_API_BASE_URL}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: "{}",
  })

  const raw = await response.text()
  let payload: unknown = null
  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = raw
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { message?: unknown }).message === "string"
        ? String((payload as { message?: string }).message)
        : `GitHub installation token request failed with status ${response.status}`
    throw new Error(message)
  }

  const tokenCandidate = (payload as { token?: unknown } | null)?.token
  const token = typeof tokenCandidate === "string" ? tokenCandidate.trim() : ""
  const expiresAtCandidate = (payload as { expires_at?: unknown } | null)?.expires_at
  const expiresAtRaw =
    typeof expiresAtCandidate === "string" ? expiresAtCandidate : ""
  const expiresAtMs = Date.parse(expiresAtRaw)
  const expiresAt = Number.isFinite(expiresAtMs) ? expiresAtMs : Number.NaN

  if (!token || !Number.isFinite(expiresAt)) {
    return null
  }

  return {
    token,
    expiresAt,
  }
}

function isInstallationTokenValid(expiresAt: number | null | undefined): boolean {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    return false
  }
  return expiresAt - GITHUB_INSTALLATION_TOKEN_SAFETY_SECONDS * 1000 > Date.now()
}

export async function resolveGithubTokensForUser(
  userId: string | null | undefined,
): Promise<string[]> {
  if (!userId) {
    return []
  }

  const candidates: string[] = []
  let client: Awaited<ReturnType<typeof clerkClient>> | null = null

  try {
    client = await clerkClient()
  } catch (error) {
    console.error("Failed to initialize Clerk client for GitHub token lookup:", error)
  }

  if (client) {
    for (const provider of GITHUB_OAUTH_PROVIDERS) {
      try {
        const oauthTokens = await client.users.getUserOauthAccessToken(
          userId,
          provider as "github",
        )
        if (Array.isArray(oauthTokens?.data)) {
          for (const entry of oauthTokens.data) {
            if (
              typeof entry?.token === "string" &&
              entry.token.trim().length > 0
            ) {
              candidates.push(entry.token.trim())
            }
          }
        }
      } catch {
        // Provider not configured for this Clerk instance.
      }
    }
  }

  const allowGlobalFallback = envFlag(getEnvValue("DASHBOARD_ALLOW_GLOBAL_GITHUB_TOKEN_FALLBACK"))
  if (allowGlobalFallback) {
    const fallbackToken = getEnvValue("GITHUB_OAUTH_TOKEN") || getEnvValue("GH_TOKEN")
    if (typeof fallbackToken === "string" && fallbackToken.trim().length > 0) {
      candidates.push(fallbackToken.trim())
    }
  }

  return Array.from(new Set(candidates))
}

export async function resolveGithubInstallationToken(): Promise<string | null> {
  if (isInstallationTokenValid(cachedInstallationToken?.expiresAt)) {
    return cachedInstallationToken?.token ?? null
  }

  if (installationTokenPromise) {
    return installationTokenPromise
  }

  installationTokenPromise = (async () => {
    try {
      const refreshed = await fetchGithubInstallationToken()
      if (!refreshed) {
        cachedInstallationToken = null
        return null
      }

      cachedInstallationToken = refreshed
      return refreshed.token
    } catch {
      return null
    }
  })()

  try {
    return await installationTokenPromise
  } finally {
    installationTokenPromise = null
  }
}

export async function resolveGithubTokenForUser(
  userId: string | null | undefined,
): Promise<string | null> {
  const tokens = await resolveGithubTokensForUser(userId)
  return tokens[0] ?? null
}
