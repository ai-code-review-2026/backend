import { clerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { proxyBackendRequest, requireBackendAuth } from "@/lib/backend-admin"

type UpdatePayload = {
  role?: string
  isActive?: boolean
  customPermissions?: string[]
  revokedPermissions?: string[]
}

function sanitizeUpdatePayload(payload: UpdatePayload): UpdatePayload {
  const next: UpdatePayload = {}

  if (payload.role !== undefined) {
    next.role = payload.role
  }
  if (payload.isActive !== undefined) {
    next.isActive = payload.isActive
  }
  if (Array.isArray(payload.customPermissions) && payload.customPermissions.length > 0) {
    next.customPermissions = payload.customPermissions
  }
  if (Array.isArray(payload.revokedPermissions) && payload.revokedPermissions.length > 0) {
    next.revokedPermissions = payload.revokedPermissions
  }

  return next
}

function hasLegacyPayloadMismatch(rawPayload: UpdatePayload, sanitizedPayload: UpdatePayload): boolean {
  const rawCustomPermissions = Array.isArray(rawPayload.customPermissions) ? rawPayload.customPermissions.length : 0
  const rawRevokedPermissions = Array.isArray(rawPayload.revokedPermissions) ? rawPayload.revokedPermissions.length : 0
  const sanitizedCustomPermissions = Array.isArray(sanitizedPayload.customPermissions) ? sanitizedPayload.customPermissions.length : 0
  const sanitizedRevokedPermissions = Array.isArray(sanitizedPayload.revokedPermissions) ? sanitizedPayload.revokedPermissions.length : 0

  return rawCustomPermissions !== sanitizedCustomPermissions || rawRevokedPermissions !== sanitizedRevokedPermissions
}

function extractExtraForbiddenFields(payload: Record<string, unknown>): string[] {
  const detail = payload.detail
  if (!Array.isArray(detail)) {
    return []
  }

  const fields: string[] = []
  for (const item of detail) {
    if (!item || typeof item !== "object") {
      continue
    }
    const record = item as { type?: unknown; loc?: unknown }
    if (record.type !== "extra_forbidden" || !Array.isArray(record.loc) || record.loc.length === 0) {
      continue
    }
    const field = record.loc[record.loc.length - 1]
    if (typeof field === "string") {
      fields.push(field)
    }
  }
  return fields
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function extractBackendErrorMessage(payload: Record<string, unknown>, fallback: string): string {
  const nestedError = asRecord(payload.error)
  const candidates = [
    nestedError?.message,
    payload.message,
    typeof payload.error === "string" ? payload.error : undefined,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate
    }
  }

  return fallback
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: userId } = await context.params
  if (!userId || userId.trim().length === 0) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 })
  }

  const authContext = await requireBackendAuth()
  if (!authContext.ok) {
    return authContext.response
  }

  let payload: UpdatePayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const sanitizedPayload = sanitizeUpdatePayload(payload)

  // If role is being updated, try to sync to Clerk publicMetadata
  // But don't fail if the user doesn't exist in Clerk (might be a local-only user)
  if (payload.role) {
    try {
      const client = await clerkClient()
      
      // Check if the userId looks like a Clerk ID (starts with "user_")
      const isClerkUserId = userId.startsWith("user_")
      
      if (isClerkUserId) {
        try {
          // First, get the current user to preserve existing publicMetadata
          const existingUser = await client.users.getUser(userId)
          const existingMetadata = (existingUser.publicMetadata as Record<string, unknown>) || {}
          
          // Merge existing metadata with the new role
          const updatedMetadata = {
            ...existingMetadata,
            role: payload.role,
          }
          
          // Update the user with merged metadata
          await client.users.updateUser(userId, {
            publicMetadata: updatedMetadata,
          })
          
          console.log(`[RBAC] Updated Clerk publicMetadata for user ${userId}: role=${payload.role}`)
        } catch (clerkError: unknown) {
          // Check if it's a "user not found" error (404)
          const isNotFoundError = 
            clerkError && 
            typeof clerkError === "object" && 
            "status" in clerkError && 
            clerkError.status === 404
          
          if (isNotFoundError) {
            // User doesn't exist in Clerk - this is OK, continue with backend update
            console.warn(`[RBAC] User ${userId} not found in Clerk, skipping metadata update`)
          } else {
            // Re-throw other Clerk errors
            throw clerkError
          }
        }
      } else {
        // Not a Clerk user ID - skip Clerk update
        console.log(`[RBAC] User ${userId} is not a Clerk user, skipping Clerk metadata update`)
      }
    } catch (clerkError) {
      console.error("Failed to update Clerk user metadata:", clerkError)
      return NextResponse.json(
        {
          error: "Failed to update role in authentication system",
          details: clerkError instanceof Error ? clerkError.message : "Unknown error",
        },
        { status: 500 },
      )
    }
  }

  // Sync to backend database
  let backendStatus = 200
  let backendBody: Record<string, unknown> = {}
  try {
    const backendResponse = await proxyBackendRequest({
      method: "PATCH",
      path: `/v1/admin/users/${encodeURIComponent(userId)}`,
      token: authContext.token,
      userId: authContext.userId,
      body: sanitizedPayload,
    })
    backendStatus = backendResponse.status
    backendBody = (await backendResponse.json().catch(() => ({}))) as Record<string, unknown>
  } catch (backendError) {
    // Network/timeout error — Clerk was already updated; log and proceed
    console.warn(`[RBAC] Backend network error for user ${userId}:`, backendError)
    backendStatus = 503
  }

  // 4xx from the backend means a real validation problem (e.g. ROLE_NOT_FOUND).
  // Surface the error to the client so the UI doesn't show a false success.
  if (backendStatus >= 400) {
    const rejectedFields = extractExtraForbiddenFields(backendBody)
    const incompatibleOverrideFields = rejectedFields.filter(
      (field) => field === "customPermissions" || field === "revokedPermissions",
    )

    if (backendStatus === 422 && incompatibleOverrideFields.length > 0) {
      if (hasLegacyPayloadMismatch(payload, sanitizedPayload)) {
        console.warn(
          `[RBAC] Backend is using a legacy schema for user PATCH; ignored empty override arrays for ${userId}.`,
        )
      } else {
        return NextResponse.json(
          {
            error:
              "Le backend actif n'accepte pas encore les overrides de permissions. Redemarre l'API ou applique les migrations puis reessaie.",
            details: backendBody,
          },
          { status: 409 },
        )
      }
    }

    console.error(`[RBAC] Backend rejected PATCH for user ${userId} with ${backendStatus}:`, backendBody)
    return NextResponse.json(
      {
        error: extractBackendErrorMessage(backendBody, "Backend rejected the role update"),
        details: backendBody,
      },
      { status: backendStatus },
    )
  }

  // 5xx / network error: Clerk was already updated — return success and log.
  return NextResponse.json(backendBody, { status: backendStatus })
}
