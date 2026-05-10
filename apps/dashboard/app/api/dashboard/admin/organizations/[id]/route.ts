import { clerkClient } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

import { requireBackendAuth } from "@/lib/backend-admin"

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
} from "../_shared"

export const dynamic = "force-dynamic"

type UpdateBody = {
  name?: string
  slug?: string
  description?: string
  githubOrgLogin?: string | null
  githubOrgId?: string | null
  source?: string | null
  syncStatus?: string | null
  linkClerk?: boolean
}

function githubSummaryFromBody(body: UpdateBody): GithubOrganizationSummary | null {
  const githubOrgLogin = body.githubOrgLogin === "" ? null : asString(body.githubOrgLogin)
  if (!githubOrgLogin) {
    return null
  }
  return {
    id: body.githubOrgId === "" ? "" : asString(body.githubOrgId) ?? "",
    login: githubOrgLogin,
    name: githubOrgLogin,
    description: null,
    avatarUrl: null,
    htmlUrl: null,
  }
}

/**
 * PATCH /api/dashboard/admin/organizations/{id}
 *
 * Updates the local organization and keeps Clerk metadata in sync.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const { id: orgId } = await context.params
  if (!orgId) {
    return NextResponse.json({ error: "Organization ID is required" }, { status: 400 })
  }

  let body: UpdateBody
  try {
    body = (await request.json()) as UpdateBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const [currentResponse, clerkOrganizations] = await Promise.all([
    fetchBackendJson<BackendOrganization>(authContext.token, authContext.userId, `/v1/organizations/${encodeURIComponent(orgId)}`),
    listClerkOrganizations().catch(() => []),
  ])

  if (!currentResponse.ok || !currentResponse.data) {
    return NextResponse.json(
      currentResponse.data ?? { error: "Organization not found" },
      { status: currentResponse.status },
    )
  }

  const currentOrganization = currentResponse.data as BackendOrganization
  const nextName = asString(body.name) ?? currentOrganization.name
  const nextSlug = asString(body.slug) ?? currentOrganization.slug ?? slugify(nextName)
  const nextDescription = body.description === "" ? null : asString(body.description)
  const githubOrg = githubSummaryFromBody(body)

  let matchedClerkOrganization = findMatchingClerkOrganization(currentOrganization, clerkOrganizations)
  let clerkWarning: string | null = null

  if (body.linkClerk && !matchedClerkOrganization) {
    try {
      const { organization } = await ensureClerkOrganization({
        userId: authContext.userId,
        name: nextName,
        slug: nextSlug,
        description: nextDescription,
        githubOrg,
      })
      matchedClerkOrganization = organization
      if (organization.id !== orgId) {
        clerkWarning =
          "Clerk organization linked by slug. Local organization ID remains unchanged."
      }
    } catch (clerkError) {
      const message =
        clerkError instanceof Error ? clerkError.message : "Unknown Clerk error"
      clerkWarning = `Clerk organization could not be linked (${message}).`
    }
  }

  const patchPayload: Record<string, unknown> = {}
  if (body.name !== undefined) {
    patchPayload.name = nextName
  }
  if (body.slug !== undefined) {
    patchPayload.slug = nextSlug
  }

  let updatedOrganization = currentOrganization
  if (Object.keys(patchPayload).length > 0) {
    const updateResponse = await fetchBackendJson<BackendOrganization>(
      authContext.token,
      authContext.userId,
      `/v1/organizations/${encodeURIComponent(orgId)}`,
      {
        method: "PATCH",
        body: patchPayload,
      },
    )

    if (!updateResponse.ok || !updateResponse.data) {
      return NextResponse.json(
        updateResponse.data ?? { error: "Failed to update organization" },
        { status: updateResponse.status },
      )
    }

    updatedOrganization = {
      ...currentOrganization,
      ...(updateResponse.data as BackendOrganization),
      name: nextName,
      slug: nextSlug,
    }
  }

  if (matchedClerkOrganization) {
    try {
      const client = await clerkClient()
      const updatedClerk = await client.organizations.updateOrganization(matchedClerkOrganization.id, {
        name: nextName,
        slug: nextSlug,
        publicMetadata: {
          github_org_login:
            body.githubOrgLogin === ""
              ? null
              : asString(body.githubOrgLogin) ?? matchedClerkOrganization.githubOrgLogin ?? null,
          github_org_id:
            body.githubOrgId === ""
              ? null
              : asNumber(body.githubOrgId) ?? matchedClerkOrganization.githubOrgId ?? null,
          description:
            body.description === ""
              ? null
              : nextDescription ?? matchedClerkOrganization.description ?? null,
        },
      })

      matchedClerkOrganization = {
        id: updatedClerk.id,
        name: updatedClerk.name,
        slug: updatedClerk.slug ?? null,
        imageUrl: updatedClerk.imageUrl ?? null,
        description:
          body.description === ""
            ? null
            : nextDescription ?? matchedClerkOrganization.description ?? null,
        githubOrgLogin:
          body.githubOrgLogin === ""
            ? null
            : asString(body.githubOrgLogin) ?? matchedClerkOrganization.githubOrgLogin ?? null,
        githubOrgId:
          body.githubOrgId === ""
            ? null
            : asString(body.githubOrgId) ?? matchedClerkOrganization.githubOrgId ?? null,
      }
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `Platform updated, but Clerk sync failed: ${error.message}`
              : "Platform updated, but Clerk sync failed",
        },
        { status: 502 },
      )
    }
  }

  return NextResponse.json(
    {
      organization: normalizeOrganization(updatedOrganization, matchedClerkOrganization),
      ...(clerkWarning ? { warning: clerkWarning } : {}),
    },
    { status: 200 },
  )
}

/**
 * DELETE /api/dashboard/admin/organizations/{id}
 *
 * Deletes the local organization and best-effort deletes matching Clerk org.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  const { id: orgId } = await context.params
  if (!orgId) {
    return NextResponse.json({ error: "Organization ID is required" }, { status: 400 })
  }

  const [currentResponse, clerkOrganizations] = await Promise.all([
    fetchBackendJson<BackendOrganization>(authContext.token, authContext.userId, `/v1/organizations/${encodeURIComponent(orgId)}`),
    listClerkOrganizations().catch(() => []),
  ])

  if (!currentResponse.ok || !currentResponse.data) {
    return NextResponse.json(
      currentResponse.data ?? { error: "Organization not found" },
      { status: currentResponse.status },
    )
  }

  const currentOrganization = currentResponse.data as BackendOrganization
  const matchedClerkOrganization = findMatchingClerkOrganization(currentOrganization, clerkOrganizations)

  const deleteResponse = await fetchBackendJson<null>(
    authContext.token,
    authContext.userId,
    `/v1/organizations/${encodeURIComponent(orgId)}`,
    { method: "DELETE" },
  )

  if (!deleteResponse.ok && deleteResponse.status !== 204) {
    return NextResponse.json(
      deleteResponse.data ?? { error: "Failed to delete organization" },
      { status: deleteResponse.status },
    )
  }

  if (matchedClerkOrganization && !matchedClerkOrganization.id.startsWith("org_local_")) {
    try {
      const client = await clerkClient()
      await client.organizations.deleteOrganization(matchedClerkOrganization.id)
    } catch {
      // Keep local delete successful even if Clerk org was already removed.
    }
  }

  return new Response(null, { status: 204 })
}
