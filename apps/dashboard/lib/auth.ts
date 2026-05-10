import "server-only"

import { auth, currentUser } from "@clerk/nextjs/server"
import { cache } from "react"

import type { DashboardAuthUser } from "@/lib/dashboard-user"
import { getBackendApiUrl } from "@/lib/backend-url"
import {
  extractRoleFromClaims,
  getDefaultPermissionsForRole,
  normalizeRole,
  type AppRole,
} from "@/lib/roles"

type BackendAuthSyncResponse = {
  user_id: string
  email: string
  display_name?: string | null
  github_login?: string | null
  canonical_role?: string
  roles?: string[]
  permissions?: string[]
  org_id?: string | null
  org_slug?: string | null
  org_name?: string | null
  org_role?: string | null
}

const BACKEND_SYNC_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DASHBOARD_BACKEND_SYNC_TIMEOUT_MS ?? "15000") || 15_000,
)
const CLERK_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim())

function parseAdminEmails(rawValue: string | undefined): Set<string> {
  if (!rawValue || rawValue.trim().length === 0) {
    return new Set()
  }
  return new Set(
    rawValue
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

const ADMIN_EMAIL_OVERRIDES = parseAdminEmails(
  process.env.DASHBOARD_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS,
)

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function initials(name: string, email: string): string {
  const words = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase()
  }

  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase()
  }

  return email.slice(0, 2).toUpperCase() || "US"
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()),
    ),
  )
}

function firstRecordString(record: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!record) {
    return undefined
  }

  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

function extractGithubLogin(user: Awaited<ReturnType<typeof currentUser>>): string | undefined {
  if (!user) {
    return undefined
  }

  const directUsername = typeof user.username === "string" ? user.username.trim() : ""
  if (directUsername) {
    return directUsername.toLowerCase()
  }

  const rawUser = user as unknown as Record<string, unknown>
  const metadataBlocks = [
    rawUser.publicMetadata,
    rawUser.unsafeMetadata,
    rawUser.privateMetadata,
  ].filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")

  for (const block of metadataBlocks) {
    const candidate = firstRecordString(block, "github_login", "githubLogin", "github_username", "githubUsername", "username")
    if (candidate) {
      return candidate.toLowerCase()
    }
  }

  const externalAccounts = rawUser.externalAccounts
  if (Array.isArray(externalAccounts)) {
    for (const account of externalAccounts) {
      if (!account || typeof account !== "object") continue
      const record = account as Record<string, unknown>
      const provider = firstRecordString(record, "provider", "providerId", "strategy")
      if (!provider || !provider.toLowerCase().includes("github")) continue
      const candidate = firstRecordString(record, "username", "login", "preferred_username")
      if (candidate) {
        return candidate.toLowerCase()
      }
    }
  }

  return undefined
}

async function syncAccessWithBackend(args: {
  token: string | null
  email: string | undefined
  displayName: string | undefined
  githubLogin: string | undefined
  roleCandidate: AppRole
  orgId: string | null
  orgSlug: string | null
  orgRole: string | null
  orgNameCandidate: string | undefined
}): Promise<BackendAuthSyncResponse | null> {
  const { token, email, displayName, githubLogin, roleCandidate, orgId, orgSlug, orgRole, orgNameCandidate } = args
  if (!token) {
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKEND_SYNC_TIMEOUT_MS)

  try {
    const response = await fetch(getBackendApiUrl("/v1/auth/sync"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        display_name: displayName,
        github_login: githubLogin,
        role: roleCandidate,
        org_id: orgId,
        org_slug: orgSlug,
        org_name: orgNameCandidate,
        org_role: orgRole,
      }),
      signal: controller.signal,
      cache: "no-store",
    })

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as BackendAuthSyncResponse
    return payload
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export const getAuthenticatedDashboardUser = cache(async (): Promise<DashboardAuthUser | null> => {
  if (!CLERK_CONFIGURED) {
    return null
  }

  const { userId, sessionClaims, orgId, orgRole, orgSlug, getToken } = await auth()
  if (!userId) {
    return null
  }

  const claims = (sessionClaims as Record<string, unknown> | null | undefined) ?? {}
  const baseClaimsRole = extractRoleFromClaims(claims)
  const claimName =
    firstString(
      claims.name,
      claims.full_name,
      claims.fullName,
      [claims.first_name, claims.last_name].filter(Boolean).join(" "),
      [claims.firstName, claims.lastName].filter(Boolean).join(" "),
      claims.username,
    ) ?? undefined
  const claimEmail =
    firstString(
      claims.email,
      claims.email_address,
      claims.emailAddress,
      claims.primary_email_address,
      claims.primaryEmailAddress,
    ) ?? undefined

  const [user, token] = await Promise.all([currentUser(), getToken()])

  const name =
    firstString(
      claimName,
      [user?.firstName, user?.lastName].filter(Boolean).join(" "),
      user?.fullName,
      user?.username,
    ) ?? "Utilisateur"

  const email =
    firstString(
      claimEmail,
      user?.emailAddresses?.find((address) => address.id === user?.primaryEmailAddressId)?.emailAddress,
      user?.emailAddresses?.[0]?.emailAddress,
    ) ?? "unknown@example.local"
  const githubLogin = extractGithubLogin(user) ?? firstString(claims.github_login, claims.githubUsername, claims.username)

  const metadataRoleCandidate =
    typeof user?.publicMetadata?.role === "string" ? normalizeRole(user.publicMetadata.role) : "developer"
  const baseRole = metadataRoleCandidate !== "developer" ? metadataRoleCandidate : baseClaimsRole
  const roleCandidate = ADMIN_EMAIL_OVERRIDES.has(email.trim().toLowerCase()) ? "admin" : baseRole

  const orgNameCandidate =
    (typeof claims.org_name === "string" ? claims.org_name : undefined) ??
    (typeof claims.organization_name === "string" ? claims.organization_name : undefined)

  const synced = await syncAccessWithBackend({
    token,
    email,
    displayName: name,
    githubLogin,
    roleCandidate,
    orgId: orgId ?? null,
    orgSlug: orgSlug ?? null,
    orgRole: orgRole ?? null,
    orgNameCandidate,
  })

  let canonicalRole = normalizeRole(synced?.canonical_role ?? synced?.roles ?? roleCandidate)
  if (ADMIN_EMAIL_OVERRIDES.has(email.trim().toLowerCase())) {
    canonicalRole = "admin"
  }

  const legacyRoles = uniqueStrings([...(synced?.roles ?? []), roleCandidate])
  const permissions = uniqueStrings([
    ...(synced?.permissions ?? []),
    ...getDefaultPermissionsForRole(canonicalRole),
  ])

  const normalizedOrgRole = (() => {
    const value =
      synced?.org_role ??
      (typeof orgRole === "string" && orgRole.trim().length > 0 ? orgRole.trim().toLowerCase() : undefined)
    if (!value) {
      return undefined
    }
    return value.startsWith("org:") ? value.slice(4) : value
  })()

  const organization =
    (synced?.org_id ?? orgId) != null
      ? {
          id: synced?.org_id ?? orgId!,
          slug: synced?.org_slug ?? orgSlug ?? undefined,
          name: synced?.org_name ?? orgNameCandidate ?? undefined,
          role: normalizedOrgRole,
        }
      : null

  return {
    id: userId,
    name: synced?.display_name?.trim() || name,
    email: synced?.email?.trim() || email,
    githubLogin: synced?.github_login?.trim() || githubLogin || null,
    role: canonicalRole,
    canonicalRole,
    legacyRoles,
    permissions,
    avatar: initials(name, email),
    organization,
  }
})
