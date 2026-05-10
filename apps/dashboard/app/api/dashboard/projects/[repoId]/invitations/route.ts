import { auth, clerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

export const dynamic = "force-dynamic"

type InviteBody = {
  email?: string
  github_login?: string | null
  role_code?: string
}

/**
 * GET /api/dashboard/projects/[repoId]/invitations
 * Proxy to backend invitation list.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ repoId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { repoId } = await context.params
  return proxyBackendRequest({
    method: "GET",
    path: `/api/v1/projects/${encodeURIComponent(repoId)}/invitations`,
    token: authContext.token,
    userId: authContext.userId,
  })
}

/**
 * POST /api/dashboard/projects/[repoId]/invitations
 * If user already exists in Clerk: assign project role directly.
 * Otherwise: send Clerk invitation + create pending invitation in backend.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ repoId: string }> },
) {
  const authContext = await requireBackendAuth()
  if (!authContext.ok) return authContext.response

  const { repoId } = await context.params

  let body: InviteBody
  try {
    body = (await request.json()) as InviteBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const roleCode = typeof body.role_code === "string" && body.role_code.trim().length > 0
    ? body.role_code.trim()
    : "developer"
  const githubLogin =
    typeof body.github_login === "string" && body.github_login.trim().length > 0
      ? body.github_login.trim()
      : null

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 422 })
  }

  const { userId } = await auth()
  const client = await clerkClient()

  try {
    const existingUsers = await client.users.getUserList({ emailAddress: [email] })
    const existingUser = Array.isArray(existingUsers?.data) && existingUsers.data.length > 0
      ? existingUsers.data[0]
      : null

    if (existingUser) {
      const assignRes = await proxyBackendRequest({
        method: "POST",
        path: `/api/v1/projects/${encodeURIComponent(repoId)}/roles`,
        token: authContext.token,
        userId: authContext.userId,
        body: {
          user_id: existingUser.id,
          role_code: roleCode,
          notes: "Assigned from dashboard invitation flow (existing Clerk user)",
        },
      })
      const assignBody = await assignRes.json().catch(() => ({}))
      return NextResponse.json(
        {
          status: assignRes.status >= 200 && assignRes.status < 300 ? "assigned_existing_user" : "assignment_failed",
          assigned_user_id: existingUser.id,
          assigned_email: email,
          role_code: roleCode,
          details: assignBody,
        },
        { status: assignRes.status },
      )
    }
  } catch {
    // If Clerk lookup fails, continue with pending invitation flow.
  }

  let clerkInvitationId: string | null = null
  try {
    const origin = new URL(request.url).origin
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: `${origin}/sign-up`,
      publicMetadata: {
        invited_project_id: repoId,
        invited_role: roleCode,
        invited_github_login: githubLogin,
        invited_by: userId ?? authContext.userId,
      },
      ignoreExisting: true,
    })
    clerkInvitationId = invitation.id
  } catch {
    // Keep backend pending invitation even if Clerk invitation fails.
    clerkInvitationId = null
  }

  const backendRes = await proxyBackendRequest({
    method: "POST",
    path: `/api/v1/projects/${encodeURIComponent(repoId)}/invitations`,
    token: authContext.token,
    userId: authContext.userId,
    body: {
      email,
      github_login: githubLogin,
      role_code: roleCode,
      clerk_invitation_id: clerkInvitationId,
    },
  })
  const backendBody = await backendRes.json().catch(() => ({}))

  return NextResponse.json(
    {
      ...backendBody,
      clerk_invitation_id: clerkInvitationId,
      clerk_invitation_sent: Boolean(clerkInvitationId),
    },
    { status: backendRes.status },
  )
}
