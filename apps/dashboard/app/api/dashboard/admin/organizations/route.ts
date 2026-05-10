import { clerkClient } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

import { requireBackendAuth } from "@/lib/backend-admin"
import { resolveGithubTokenForUser } from "@/lib/server/github/auth"
import {
  GITHUB_API_BASE_URL,
  buildGithubHeaders,
  normalizeGithubError,
  parseGithubResponse,
} from "@/lib/server/github/client"

import {
  asNumber,
  asString,
  ensureClerkOrganization,
  fetchBackendJson,
  findMatchingClerkOrganization,
  listClerkOrganizations,
  normalizeOrganization,
  slugify,
  type BackendOrganization,
  type GithubOrganizationSummary,
} from "./_shared"

export const dynamic = "force-dynamic"

type CreateOrganizationBody = {
  mode?: "platform" | "github_import"
  name?: string
  slug?: string
  description?: string
  githubOrgLogin?: string
}

async function listGithubOrganizationsForUser(userId: string): Promise<GithubOrganizationSummary[]> {
  const token = await resolveGithubTokenForUser(userId)
  if (!token) {
    return []
  }

  const response = await fetch(`${GITHUB_API_BASE_URL}/user/orgs?per_page=100`, {
    headers: buildGithubHeaders(token),
    cache: "no-store",
  })
  const payload = await parseGithubResponse(response)

  if (!response.ok || !Array.isArray(payload)) {
    return []
  }

  return payload.map((item) => {
    const record = item as Record<string, unknown>
    return {
      id: String(record.id ?? ""),
      login: String(record.login ?? ""),
      name: asString(record.name) ?? String(record.login ?? ""),
      description: asString(record.description),
      avatarUrl: asString(record.avatar_url),
      htmlUrl: asString(record.html_url),
    }
  })
}

async function fetchGithubOrganizationDetails(
  userId: string,
  login: string,
): Promise<GithubOrganizationSummary> {
  const token = await resolveGithubTokenForUser(userId)
  if (!token) {
    throw new Error("GitHub account not connected")
  }

  const response = await fetch(`${GITHUB_API_BASE_URL}/orgs/${encodeURIComponent(login)}`, {
    headers: buildGithubHeaders(token),
    cache: "no-store",
  })
  const payload = await parseGithubResponse(response)

  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error(normalizeGithubError(payload, response.status, true))
  }

  const record = payload as Record<string, unknown>
  return {
    id: String(record.id ?? ""),
    login: String(record.login ?? login),
    name: asString(record.name) ?? String(record.login ?? login),
    description: asString(record.description),
    avatarUrl: asString(record.avatar_url),
    htmlUrl: asString(record.html_url),
  }
}

/**
 * GET /api/dashboard/admin/organizations
 *
 * Returns the linked platform organizations plus available GitHub orgs and Clerk orgs.
 */
export async function GET(request: NextRequest) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  try {
    const search = asString(request.nextUrl.searchParams.get("search"))

    const [backendResponse, githubOrganizations, clerkOrganizations] = await Promise.all([
      fetchBackendJson<{ items?: BackendOrganization[] }>(
        authContext.token,
        authContext.userId,
        "/v1/organizations",
        { method: "GET" },
      ),
      listGithubOrganizationsForUser(authContext.userId),
      listClerkOrganizations().catch(() => []),
    ])

    const backendItems =
      backendResponse.ok &&
      Array.isArray((backendResponse.data as { items?: BackendOrganization[] } | null)?.items)
        ? ((backendResponse.data as { items?: BackendOrganization[] }).items ?? [])
        : []

    const organizations = backendItems
      .map((org) => normalizeOrganization(org, findMatchingClerkOrganization(org, clerkOrganizations)))
      .filter((org) => {
        if (!search) {
          return true
        }
        const haystack = [org.name, org.slug, org.githubOrgLogin, org.clerkOrgId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(search.toLowerCase())
      })

    return NextResponse.json({
      organizations,
      githubOrganizations,
      clerkOrganizations,
      capabilities: {
        canCreateGithubOrganizations: false,
        githubCreationReason:
          "GitHub organizations must already exist. This workflow creates the platform + Clerk organization, then links an existing GitHub organization.",
      },
    })
  } catch (error) {
    console.error("[admin/organizations][GET] unexpected failure", error)
    return NextResponse.json({
      organizations: [],
      githubOrganizations: [],
      clerkOrganizations: [],
      capabilities: {
        canCreateGithubOrganizations: false,
        githubCreationReason:
          "GitHub organizations must already exist. This workflow creates the platform + Clerk organization, then links an existing GitHub organization.",
      },
      warning: "Organization data is temporarily unavailable.",
    })
  }
}

/**
 * POST /api/dashboard/admin/organizations
 *
 * Creates a platform organization, a Clerk organization, and optionally links an existing GitHub organization.
 */
export async function POST(request: NextRequest) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  let body: CreateOrganizationBody
  try {
    body = (await request.json()) as CreateOrganizationBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const mode = body.mode === "github_import" ? "github_import" : "platform"
  const selectedGithubLogin = mode === "github_import" ? asString(body.githubOrgLogin) : null

  let githubOrg: GithubOrganizationSummary | null = null
  if (mode === "github_import") {
    if (!selectedGithubLogin) {
      return NextResponse.json(
        { error: "A GitHub organization must be selected for import." },
        { status: 400 },
      )
    }

    try {
      githubOrg = await fetchGithubOrganizationDetails(authContext.userId, selectedGithubLogin)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to fetch GitHub organization" },
        { status: 400 },
      )
    }
  }

  const name = asString(body.name) ?? githubOrg?.name ?? githubOrg?.login ?? null
  if (!name) {
    return NextResponse.json({ error: "Organization name is required" }, { status: 400 })
  }

  const slug = asString(body.slug) ?? (githubOrg ? slugify(githubOrg.login) : slugify(name))
  const description = asString(body.description) ?? githubOrg?.description ?? null

  const [existingResponse, existingClerkOrganizations] = await Promise.all([
    fetchBackendJson<{ items?: BackendOrganization[] }>(
      authContext.token,
      authContext.userId,
      "/v1/organizations",
      { method: "GET" },
    ),
    listClerkOrganizations().catch(() => []),
  ])

  const existingOrgs =
    existingResponse.ok &&
    Array.isArray((existingResponse.data as { items?: BackendOrganization[] } | null)?.items)
      ? ((existingResponse.data as { items?: BackendOrganization[] }).items ?? [])
      : []

  const normalizedExisting = existingOrgs.map((org) =>
    normalizeOrganization(org, findMatchingClerkOrganization(org, existingClerkOrganizations)),
  )

  if (githubOrg) {
    const duplicateGithubLink = normalizedExisting.find(
      (org) => org.githubOrgLogin?.toLowerCase() === githubOrg?.login.toLowerCase(),
    )
    if (duplicateGithubLink) {
      return NextResponse.json(
        { error: `This GitHub organization is already linked to '${duplicateGithubLink.name}'.` },
        { status: 409 },
      )
    }
  }

  const duplicateSlug = normalizedExisting.find((org) => org.slug?.toLowerCase() === slug.toLowerCase())
  if (duplicateSlug) {
    return NextResponse.json(
      { error: `Slug '${slug}' is already used by '${duplicateSlug.name}'.` },
      { status: 409 },
    )
  }

  let createdClerkOrganizationId: string | null = null
  let clerkOrganization:
    | {
        id: string
        name: string
        slug: string | null
        imageUrl: string | null
        description: string | null
        githubOrgLogin: string | null
        githubOrgId: string | null
      }
    | null = null
  const warnings: string[] = []

  try {
    const { organization, created } = await ensureClerkOrganization({
      userId: authContext.userId,
      name,
      slug,
      description,
      githubOrg,
    })
    createdClerkOrganizationId = created ? organization.id : null
    clerkOrganization = organization
  } catch (clerkError) {
    console.warn(
      "[organizations] Clerk org creation skipped:",
      clerkError instanceof Error ? clerkError.message : clerkError,
    )
    warnings.push(
      "Clerk organization could not be created automatically. " +
        "This may be due to plan restrictions or permissions. " +
        "The platform organization was still created.",
    )
  }

  const { randomUUID } = await import("crypto")
  const orgId = clerkOrganization?.id ?? `org_local_${randomUUID().replace(/-/g, "").slice(0, 20)}`

  const backendResponse = await fetchBackendJson<{ id: string; name: string; slug?: string | null }>(
    authContext.token,
    authContext.userId,
    "/v1/organizations",
    {
      method: "POST",
      body: {
        clerk_organization_id: orgId,
        name,
        slug,
        github_org_id: asNumber(githubOrg?.id),
        github_org_name: githubOrg?.login ?? null,
      },
    },
  )

  if (!backendResponse.ok || !backendResponse.data) {
    if (createdClerkOrganizationId) {
      try {
        const client = await clerkClient()
        await client.organizations.deleteOrganization(createdClerkOrganizationId)
      } catch {
        // Best-effort rollback.
      }
    }
    return NextResponse.json(
      backendResponse.data ?? { error: "Failed to create organization" },
      { status: backendResponse.status },
    )
  }

  const backendOrganization = backendResponse.data as { id: string; name: string; slug?: string | null }

  // Best effort: ensure creator is an active admin member so non-admin users
  // can see the organization in `/v1/organizations` list immediately.
  try {
    const membershipSyncResponse = await fetchBackendJson(
      authContext.token,
      authContext.userId,
      `/v1/organizations/${encodeURIComponent(backendOrganization.id)}/members`,
      {
        method: "POST",
        body: {
          user_id: authContext.userId,
          role: "admin",
        },
      },
    )
    if (!membershipSyncResponse.ok && membershipSyncResponse.status !== 409) {
      warnings.push("Organization created, but creator membership sync failed.")
    }
  } catch {
    warnings.push("Organization created, but creator membership sync failed.")
  }

  const normalized = normalizeOrganization(
    {
      id: backendOrganization.id,
      name: backendOrganization.name ?? name,
      slug: backendOrganization.slug ?? slug,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    clerkOrganization,
  )

  if (!githubOrg) {
    warnings.push(
      "GitHub organization creation is not automatic. Link an existing GitHub organization later if needed.",
    )
  }

  return NextResponse.json(
    {
      organization: normalized,
      clerkOrganization,
      githubOrganization: githubOrg,
      warnings,
    },
    { status: 201 },
  )
}
