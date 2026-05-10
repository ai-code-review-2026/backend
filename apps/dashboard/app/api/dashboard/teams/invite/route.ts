import { auth, clerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * POST /api/dashboard/teams/invite
 * Body: { team_id: string, email: string, role?: string }
 *
 * Sends a Clerk invitation with team metadata. When the invitee signs up,
 * webhooks/downstream code can pick up team_id + role from publicMetadata
 * and attach them to the proper team.
 */
export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { team_id?: string; email?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const teamId = body.team_id?.trim()
  const email = body.email?.trim().toLowerCase()
  const role = (body.role || "member").trim()

  if (!teamId || !email) {
    return NextResponse.json({ error: "team_id and email are required" }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 })
  }

  const client = await clerkClient()

  // Skip if user already exists.
  try {
    const existing = await client.users.getUserList({ emailAddress: [email] })
    const matched = Array.isArray(existing?.data) ? existing.data : []
    if (matched.length > 0) {
      return NextResponse.json({
        status: "already_exists",
        message: "User already has an account. Add them directly to the team.",
        user_id: matched[0].id,
      })
    }
  } catch {
    // Non-fatal: proceed with invitation attempt.
  }

  const origin = new URL(request.url).origin
  try {
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: `${origin}/dashboard/teams?team=${encodeURIComponent(teamId)}`,
      publicMetadata: {
        invited_team_id: teamId,
        invited_role: role,
        invited_by: userId,
      },
      ignoreExisting: true,
    })
    return NextResponse.json({
      status: "invited",
      invitation_id: invitation.id,
      email,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create invitation"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
