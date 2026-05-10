import { clerkClient } from "@clerk/nextjs/server"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

const BACKEND_FETCH_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS ?? "15000") || 15_000,
)

export type BackendOrganization = {
  id: string
  name: string
  slug?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  role?: string | null
}

export type GithubOrganizationSummary = {
  id: string
  login: string
  name: string
  description: string | null
  avatarUrl: string | null
  htmlUrl: string | null
}

export type ClerkOrganizationSummary = {
  id: string
  name: string
  slug: string | null
  imageUrl: string | null
  description: string | null
  githubOrgLogin: string | null
  githubOrgId: string | null
}

type BackendErrorPayload = { error: string; detail?: string }

export function slugify(value: string): string {
  const collapsed = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
  return collapsed || `organization-${Math.random().toString(36).slice(2, 8)}`
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function metadataString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return null
}

function normalizeClerkOrganization(org: {
  id: string
  name: string
  slug?: string | null
  imageUrl?: string | null
  publicMetadata?: unknown
}): ClerkOrganizationSummary {
  const metadata = metadataRecord(org.publicMetadata)
  return {
    id: org.id,
    name: org.name,
    slug: org.slug ?? null,
    imageUrl: org.imageUrl ?? null,
    description: metadataString(metadata, "description"),
    githubOrgLogin: metadataString(metadata, "github_org_login"),
    githubOrgId: metadataString(metadata, "github_org_id"),
  }
}

export function findMatchingClerkOrganization(
  organization: BackendOrganization,
  clerkOrganizations: ClerkOrganizationSummary[],
): ClerkOrganizationSummary | null {
  const byId = clerkOrganizations.find((item) => item.id === organization.id)
  if (byId) {
    return byId
  }
  const slug = organization.slug?.trim().toLowerCase()
  if (slug) {
    const bySlug = clerkOrganizations.find((item) => item.slug?.trim().toLowerCase() === slug)
    if (bySlug) {
      return bySlug
    }
  }
  return null
}

export function normalizeOrganization(
  organization: BackendOrganization,
  clerkOrganization: ClerkOrganizationSummary | null,
  memberCount = 0,
) {
  const clerkOrgId = clerkOrganization?.id ?? (organization.id.startsWith("org_") ? organization.id : null)
  const githubOrgLogin = clerkOrganization?.githubOrgLogin ?? null
  const githubOrgId = clerkOrganization?.githubOrgId ?? null

  let syncStatus = "local_only"
  if (clerkOrgId && githubOrgLogin) {
    syncStatus = "linked"
  } else if (clerkOrgId) {
    syncStatus = "clerk_only"
  } else if (githubOrgLogin) {
    syncStatus = "github_only"
  }

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug ?? clerkOrganization?.slug ?? null,
    description: clerkOrganization?.description ?? null,
    memberCount,
    createdAt: organization.createdAt ?? null,
    updatedAt: organization.updatedAt ?? organization.createdAt ?? null,
    clerkOrgId,
    githubOrgId,
    githubOrgLogin,
    source: githubOrgLogin ? "github_import" : "platform",
    syncStatus,
  }
}

export async function listClerkOrganizations(): Promise<ClerkOrganizationSummary[]> {
  const client = await clerkClient()
  const response = await client.organizations.getOrganizationList({ limit: 100 })
  const items = Array.isArray(response?.data) ? response.data : []
  return items.map((org) =>
    normalizeClerkOrganization({
      id: org.id,
      name: org.name,
      slug: org.slug ?? null,
      imageUrl: org.imageUrl ?? null,
      publicMetadata: org.publicMetadata,
    }),
  )
}

export async function ensureClerkOrganization(args: {
  userId: string
  name: string
  slug: string
  description: string | null
  githubOrg: GithubOrganizationSummary | null
  existingClerkOrgId?: string | null
}): Promise<{ organization: ClerkOrganizationSummary; created: boolean }> {
  const client = await clerkClient()
  const existing = await client.organizations.getOrganizationList({ limit: 100 })
  const match = Array.isArray(existing?.data)
    ? existing.data.find(
        (item) =>
          (args.existingClerkOrgId ? item.id === args.existingClerkOrgId : false) ||
          item.slug === args.slug,
      )
    : null

  if (match) {
    const updated = await client.organizations.updateOrganization(match.id, {
      name: args.name,
      slug: args.slug,
      publicMetadata: {
        github_org_login: args.githubOrg?.login ?? null,
        github_org_id: args.githubOrg?.id ?? null,
        description: args.description,
      },
    })
    return {
      organization: normalizeClerkOrganization({
        id: updated.id,
        name: updated.name,
        slug: updated.slug ?? null,
        imageUrl: updated.imageUrl ?? null,
        publicMetadata: updated.publicMetadata,
      }),
      created: false,
    }
  }

  const created = await client.organizations.createOrganization({
    name: args.name,
    slug: args.slug,
    createdBy: args.userId,
    publicMetadata: {
      github_org_login: args.githubOrg?.login ?? null,
      github_org_id: args.githubOrg?.id ?? null,
      description: args.description,
    },
  })

  try {
    await client.organizations.createOrganizationMembership({
      organizationId: created.id,
      userId: args.userId,
      role: "org:admin",
    })
  } catch {
    // Creator is often already a member in Clerk.
  }

  return {
    organization: normalizeClerkOrganization({
      id: created.id,
      name: created.name,
      slug: created.slug ?? null,
      imageUrl: created.imageUrl ?? null,
      publicMetadata: created.publicMetadata,
    }),
    created: true,
  }
}

export async function fetchBackendJson<T>(
  token: string,
  userId: string,
  path: string,
  init?: {
    method?: "GET" | "POST" | "PATCH" | "DELETE"
    body?: unknown
  },
): Promise<{ ok: boolean; status: number; data: T | BackendErrorPayload | null }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(`${BACKEND_API_BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userId,
        Accept: "application/json",
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    })

    if (response.status === 204) {
      return { ok: true, status: 204, data: null }
    }

    const rawBody = await response.text()
    let parsed: unknown = null
    if (rawBody) {
      try {
        parsed = JSON.parse(rawBody)
      } catch {
        parsed = { detail: rawBody }
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data: (parsed as T | BackendErrorPayload | null) ?? null,
    }
  } catch {
    return {
      ok: false,
      status: 502,
      data: { error: "Backend unavailable" },
    }
  } finally {
    clearTimeout(timeout)
  }
}
