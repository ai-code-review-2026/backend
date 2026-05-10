import { clerkClient } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

import { requireBackendAuth } from "@/lib/backend-admin"

import {
  fetchBackendJson,
  findMatchingClerkOrganization,
  listClerkOrganizations,
  type BackendOrganization,
} from "../../_shared"

const MAX_USER_LOOKUP = 500

export const dynamic = "force-dynamic"

type OrganizationMembersResponse = {
  items?: Array<{
    userId?: string
    role?: string
    status?: string
    createdAt?: string
    user?: {
      id?: string
      email?: string
      displayName?: string
      avatarUrl?: string
    } | null
  }>
}

type OrgMember = {
  user_id: string
  email: string
  display_name: string | null
  role: string
  joined_at: string
}

function mapRoleToBackend(role: string): "admin" | "reviewer" | "developer" {
  if (role === "admin") {
    return "admin"
  }
  if (role === "viewer") {
    return "reviewer"
  }
  return "developer"
}

async function resolveClerkOrganizationId(
  token: string,
  userId: string,
  orgId: string,
): Promise<string | null> {
  const [orgResponse, clerkOrganizations] = await Promise.all([
    fetchBackendJson<BackendOrganization>(token, userId, `/v1/organizations/${encodeURIComponent(orgId)}`),
    listClerkOrganizations().catch(() => []),
  ])

  if (!orgResponse.ok || !orgResponse.data) {
    return null
  }

  const backendOrganization = orgResponse.data as BackendOrganization
  const matched = findMatchingClerkOrganization(backendOrganization, clerkOrganizations)
  return matched?.id ?? (orgId.startsWith("org_") ? orgId : null)
}

/**
 * GET /api/dashboard/admin/organizations/[id]/members
 * Returns organization members and pending Clerk invitations.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireBackendAuth()
  if (!auth.ok) {
    return auth.response
  }

  const { id: orgId } = await context.params

  const backendRes = await fetchBackendJson<OrganizationMembersResponse>(
    auth.token,
    auth.userId,
    `/v1/organizations/${encodeURIComponent(orgId)}/members`,
    { method: "GET" },
  )

  const backendItems =
    backendRes.ok && Array.isArray((backendRes.data as OrganizationMembersResponse | null)?.items)
      ? ((backendRes.data as OrganizationMembersResponse).items ?? [])
      : []

  const members: OrgMember[] = backendItems.map((member) => ({
    user_id: String(member.userId ?? member.user?.id ?? ""),
    email: String(member.user?.email ?? ""),
    display_name: member.user?.displayName ?? null,
    role: String(member.role ?? "member"),
    joined_at: String(member.createdAt ?? ""),
  }))

  let pendingInvitations: { id: string; emailAddress: string; role: string; createdAt: number }[] = []
  try {
    const clerkOrgId = await resolveClerkOrganizationId(auth.token, auth.userId, orgId)
    if (clerkOrgId && !clerkOrgId.startsWith("org_local_")) {
      const client = await clerkClient()
      const invitations = await client.organizations.getOrganizationInvitationList({
        organizationId: clerkOrgId,
        status: ["pending"],
      })
      pendingInvitations = (invitations.data ?? []).map((invitation) => ({
        id: invitation.id,
        emailAddress: invitation.emailAddress,
        role: invitation.role,
        createdAt: invitation.createdAt,
      }))
    }
  } catch {
    // Pending invitations are best-effort.
  }

  return NextResponse.json({ members, pendingInvitations })
}

/**
 * POST /api/dashboard/admin/organizations/[id]/members
 * Invite a user by email via Clerk and add active memberships when user exists.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireBackendAuth()
  if (!auth.ok) {
    return auth.response
  }

  const { id: orgId } = await context.params

  let body: { email?: string; role?: string }
  try {
    body = (await request.json()) as { email?: string; role?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 })
  }

  const requestedRole = typeof body.role === "string" ? body.role : "member"
  const backendRole = mapRoleToBackend(requestedRole)
  const warnings: string[] = []

  if (requestedRole === "viewer") {
    warnings.push("Viewer is mapped to reviewer in backend role model.")
  }

  let clerkInvitation: { id: string; emailAddress: string } | null = null
  try {
    const clerkOrgId = await resolveClerkOrganizationId(auth.token, auth.userId, orgId)
    if (clerkOrgId && !clerkOrgId.startsWith("org_local_")) {
      const client = await clerkClient()
      const invitation = await client.organizations.createOrganizationInvitation({
        organizationId: clerkOrgId,
        emailAddress: email,
        role: requestedRole === "admin" ? "org:admin" : "org:member",
        inviterUserId: auth.userId,
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"}/dashboard`,
      })
      clerkInvitation = { id: invitation.id, emailAddress: invitation.emailAddress }
    } else {
      warnings.push("Clerk organization not linked, email invitation was skipped.")
    }
  } catch (clerkError) {
    warnings.push(
      clerkError instanceof Error
        ? `Clerk invitation failed: ${clerkError.message}`
        : "Clerk invitation could not be sent",
    )
  }

  let backendMember: unknown = null
  try {
    const usersRes = await fetchBackendJson<{ items?: Array<{ id: string; email: string }> }>(
      auth.token,
      auth.userId,
      `/v1/admin/users?limit=${MAX_USER_LOOKUP}`,
      { method: "GET" },
    )

    const users =
      usersRes.ok && Array.isArray((usersRes.data as { items?: unknown[] } | null)?.items)
        ? ((usersRes.data as { items: Array<{ id: string; email: string }> }).items ?? [])
        : []

    const matchedUser = users.find((user) => user.email?.toLowerCase() === email)
    if (matchedUser) {
      const addRes = await fetchBackendJson(
        auth.token,
        auth.userId,
        `/v1/organizations/${encodeURIComponent(orgId)}/members`,
        {
          method: "POST",
          body: { user_id: matchedUser.id, role: backendRole },
        },
      )
      if (addRes.ok) {
        backendMember = addRes.data
      } else if (addRes.status !== 404) {
        warnings.push("Backend membership could not be created automatically.")
      }
    } else {
      warnings.push("User does not exist yet in platform; membership will be created after signup.")
    }
  } catch {
    warnings.push("Backend user lookup failed; membership was not created.")
  }

  return NextResponse.json(
    {
      success: true,
      clerkInvitation,
      backendMember,
      warnings,
    },
    { status: 201 },
  )
}

/**
 * DELETE /api/dashboard/admin/organizations/[id]/members?userId=xxx
 * Removes a member from the organization.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireBackendAuth()
  if (!auth.ok) {
    return auth.response
  }

  const { id: orgId } = await context.params
  const userId = request.nextUrl.searchParams.get("userId")
  if (!userId) {
    return NextResponse.json({ error: "userId query param is required" }, { status: 400 })
  }

  const res = await fetchBackendJson(
    auth.token,
    auth.userId,
    `/v1/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  )

  if (!res.ok && res.status !== 204) {
    return NextResponse.json(
      res.data ?? { error: "Failed to remove member" },
      { status: res.status },
    )
  }

  return new Response(null, { status: 204 })
}
