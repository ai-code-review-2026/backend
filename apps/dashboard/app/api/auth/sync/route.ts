import { auth, currentUser } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { extractRoleFromClaims, getDefaultPermissionsForRole, normalizeRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const BACKEND_SYNC_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DASHBOARD_BACKEND_SYNC_TIMEOUT_MS ?? "15000") || 15_000,
)

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

function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function buildDegradedSyncResponse(args: {
  userId: string
  email: string | undefined
  displayName: string | undefined
  roleCandidate: ReturnType<typeof normalizeRole>
  reason: string
  backendStatus?: number
  backendResponse?: unknown
}) {
  const { userId, email, displayName, roleCandidate, reason, backendStatus, backendResponse } = args
  return NextResponse.json(
    {
      user_id: userId,
      email: email ?? `${userId}@clerk.local`,
      display_name: displayName ?? null,
      canonical_role: roleCandidate,
      roles: [roleCandidate],
      permissions: getDefaultPermissionsForRole(roleCandidate),
      sync_degraded: true,
      sync_reason: reason,
      backend_status: backendStatus ?? null,
      backend_response: backendResponse ?? null,
    },
    { status: 200 },
  )
}

export async function POST() {
  const { userId, getToken, orgId, orgRole, orgSlug, sessionClaims } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [token, user] = await Promise.all([getToken(), currentUser()])
  if (!token) {
    return NextResponse.json({ error: "Missing Clerk token" }, { status: 401 })
  }

  const primaryEmail =
    user?.emailAddresses?.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress
  const displayName = firstNonEmpty(
    [user?.firstName, user?.lastName].filter(Boolean).join(" "),
    user?.fullName ?? undefined,
    user?.username ?? undefined,
  )
  
  // IMPORTANT: Prioritize publicMetadata.role over sessionClaims
  // sessionClaims are cached in JWT and may be stale after role updates
  // publicMetadata is fetched fresh from Clerk and reflects the latest role
  const userRoleCandidate = user?.publicMetadata?.role
  const metadataRole = typeof userRoleCandidate === "string" ? normalizeRole(userRoleCandidate) : "developer"
  
  // Only fall back to sessionClaims if publicMetadata doesn't have a valid role
  const claimsRole = metadataRole === "developer" ? extractRoleFromClaims(sessionClaims) : "developer"
  const baseRole = metadataRole !== "developer" ? metadataRole : claimsRole
  
  // Check for admin email overrides
  const roleCandidate =
    primaryEmail && ADMIN_EMAIL_OVERRIDES.has(primaryEmail.trim().toLowerCase()) ? "admin" : baseRole
    
  const claims = (sessionClaims as Record<string, unknown> | null | undefined) ?? {}
  const orgNameCandidate = firstNonEmpty(
    typeof claims.org_name === "string" ? claims.org_name : undefined,
    typeof claims.organization_name === "string" ? claims.organization_name : undefined,
  )

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKEND_SYNC_TIMEOUT_MS)
  let backendResponse: Response
  try {
    backendResponse = await fetch(`${BACKEND_API_BASE_URL}/v1/auth/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: primaryEmail,
        display_name: displayName,
        role: roleCandidate,
        org_id: orgId,
        org_slug: orgSlug,
        org_name: orgNameCandidate,
        org_role: orgRole,
      }),
      signal: controller.signal,
      cache: "no-store",
    })
  } catch {
    return buildDegradedSyncResponse({
      userId,
      email: primaryEmail,
      displayName,
      roleCandidate,
      reason: "backend_unreachable",
      backendResponse: { backend_timeout_ms: BACKEND_SYNC_TIMEOUT_MS },
    })
  } finally {
    clearTimeout(timeout)
  }

  const rawBody = await backendResponse.text()
  let parsedBody: unknown = {}

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      parsedBody = { detail: rawBody }
    }
  }

  if (!backendResponse.ok) {
    return buildDegradedSyncResponse({
      userId,
      email: primaryEmail,
      displayName,
      roleCandidate,
      reason: "backend_sync_failed",
      backendStatus: backendResponse.status,
      backendResponse: parsedBody,
    })
  }

  const normalizedBody =
    typeof parsedBody === "object" && parsedBody !== null
      ? {
          ...parsedBody,
          canonical_role:
            typeof (parsedBody as { canonical_role?: unknown }).canonical_role === "string"
              ? (parsedBody as { canonical_role: string }).canonical_role
              : roleCandidate,
          permissions: Array.isArray((parsedBody as { permissions?: unknown }).permissions)
            ? (parsedBody as { permissions: unknown[] }).permissions
            : getDefaultPermissionsForRole(roleCandidate),
        }
      : parsedBody

  return NextResponse.json(normalizedBody, { status: 200 })
}
