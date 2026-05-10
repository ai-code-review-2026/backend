import { Webhook } from "svix"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET

type ClerkWebhookEvent = {
  type: string
  data: {
    id: string
    name?: string
    slug?: string
    created_at?: number
    members_count?: number
    organization?: {
      id: string
      name?: string
      slug?: string
    }
    public_user_data?: {
      user_id: string
      identifier?: string
      first_name?: string
      last_name?: string
      image_url?: string
    }
    role?: string
    [key: string]: unknown
  }
}

/**
 * Map Clerk organization role to platform role
 * Clerk uses: org:admin, org:member, etc.
 * Platform uses: admin, reviewer, developer
 */
function mapClerkRoleToplatformRole(clerkRole: string | undefined): string {
  if (!clerkRole) return "developer"
  
  const normalizedRole = clerkRole.toLowerCase().replace("org:", "")
  
  switch (normalizedRole) {
    case "admin":
    case "owner":
      return "admin"
    case "moderator":
    case "reviewer":
      return "reviewer"
    default:
      return "developer"
  }
}

export async function POST(req: Request) {
  if (!webhookSecret) {
    console.error("[Clerk Webhook] CLERK_WEBHOOK_SECRET is not configured")
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    )
  }

  // Get the headers
  const headerPayload = await headers()
  const svix_id = headerPayload.get("svix-id")
  const svix_timestamp = headerPayload.get("svix-timestamp")
  const svix_signature = headerPayload.get("svix-signature")

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 400 }
    )
  }

  // Get the body
  const payload = await req.text()

  // Create a new Svix instance with your webhook secret
  const wh = new Webhook(webhookSecret)

  let evt: ClerkWebhookEvent

  // Verify the webhook signature
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as ClerkWebhookEvent
  } catch (err) {
    console.error("[Clerk Webhook] Verification failed:", err)
    return NextResponse.json(
      { error: "Webhook verification failed" },
      { status: 400 }
    )
  }

  console.log(`[Clerk Webhook] Received event: ${evt.type}`)

  // Handle different event types
  try {
    switch (evt.type) {
      case "organization.created":
        await handleOrganizationCreated(evt.data)
        break
      case "organization.updated":
        await handleOrganizationUpdated(evt.data)
        break
      case "organization.deleted":
        await handleOrganizationDeleted(evt.data)
        break
      case "organizationMembership.created":
        await handleMembershipCreated(evt.data)
        break
      case "organizationMembership.deleted":
        await handleMembershipDeleted(evt.data)
        break
      case "organizationMembership.updated":
        await handleMembershipUpdated(evt.data)
        break
      default:
        console.log(`[Clerk Webhook] Unhandled event type: ${evt.type}`)
    }
  } catch (error) {
    console.error(`[Clerk Webhook] Error handling ${evt.type}:`, error)
    // Return 200 anyway to prevent Clerk from retrying
    // Log the error for manual investigation
  }

  return NextResponse.json({ received: true })
}

async function handleOrganizationCreated(data: ClerkWebhookEvent["data"]) {
  console.log("[Clerk Webhook] Organization created:", {
    id: data.id,
    name: data.name,
    slug: data.slug,
  })

  // Step 1: Create organization in platform DB
  try {
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    const response = await fetch(`${backendUrl}/v1/organizations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Use a system token if available, otherwise this might fail auth
        // TODO: Add system token for internal operations
      },
      body: JSON.stringify({
        clerk_organization_id: data.id,
        name: data.name,
        slug: data.slug,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[Clerk Webhook] Failed to create org in backend:", errorData)
      return
    }

    console.log("[Clerk Webhook] Organization created in backend successfully")
  } catch (error) {
    console.error("[Clerk Webhook] Error creating org in backend:", error)
  }

  // Step 2: Create GitHub organization (if configured)
  // Note: Creating GitHub orgs requires GitHub App installation or admin PAT
  // This is typically done manually or via GitHub's org creation flow
  console.log("[Clerk Webhook] GitHub org creation not implemented (typically manual)")
}

async function handleOrganizationUpdated(data: ClerkWebhookEvent["data"]) {
  console.log("[Clerk Webhook] Organization updated:", {
    id: data.id,
    name: data.name,
  })

  try {
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    const response = await fetch(`${backendUrl}/v1/organizations/${encodeURIComponent(data.id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: data.name,
        slug: data.slug,
      }),
    })

    if (!response.ok) {
      console.error("[Clerk Webhook] Failed to update org in backend")
    }
  } catch (error) {
    console.error("[Clerk Webhook] Error updating org in backend:", error)
  }
}

async function handleOrganizationDeleted(data: ClerkWebhookEvent["data"]) {
  console.log("[Clerk Webhook] Organization deleted:", data.id)

  try {
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    const response = await fetch(`${backendUrl}/v1/organizations/${encodeURIComponent(data.id)}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      console.error("[Clerk Webhook] Failed to delete org in backend")
    }
  } catch (error) {
    console.error("[Clerk Webhook] Error deleting org in backend:", error)
  }
}

async function handleMembershipCreated(data: ClerkWebhookEvent["data"]) {
  console.log("[Clerk Webhook] Membership created:", data)
  
  const organizationId = data.organization?.id
  const userId = data.public_user_data?.user_id
  const role = mapClerkRoleToplatformRole(data.role)
  
  if (!organizationId || !userId) {
    console.error("[Clerk Webhook] Missing organization or user ID for membership")
    return
  }
  
  try {
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    
    // First, ensure user exists in the platform
    await ensureUserExists(userId, data.public_user_data)
    
    // Create membership in platform
    const response = await fetch(`${backendUrl}/v1/organizations/${encodeURIComponent(organizationId)}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        role: role,
        status: "active",
      }),
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[Clerk Webhook] Failed to create membership in backend:", errorData)
      return
    }
    
    console.log(`[Clerk Webhook] Membership created: user=${userId} org=${organizationId} role=${role}`)
  } catch (error) {
    console.error("[Clerk Webhook] Error creating membership:", error)
  }
}

async function handleMembershipDeleted(data: ClerkWebhookEvent["data"]) {
  console.log("[Clerk Webhook] Membership deleted:", data)
  
  const organizationId = data.organization?.id
  const userId = data.public_user_data?.user_id
  
  if (!organizationId || !userId) {
    console.error("[Clerk Webhook] Missing organization or user ID for membership deletion")
    return
  }
  
  try {
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    
    const response = await fetch(
      `${backendUrl}/v1/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      }
    )
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[Clerk Webhook] Failed to delete membership in backend:", errorData)
      return
    }
    
    console.log(`[Clerk Webhook] Membership deleted: user=${userId} org=${organizationId}`)
  } catch (error) {
    console.error("[Clerk Webhook] Error deleting membership:", error)
  }
}

async function handleMembershipUpdated(data: ClerkWebhookEvent["data"]) {
  console.log("[Clerk Webhook] Membership updated:", data)
  
  const organizationId = data.organization?.id
  const userId = data.public_user_data?.user_id
  const role = mapClerkRoleToplatformRole(data.role)
  
  if (!organizationId || !userId) {
    console.error("[Clerk Webhook] Missing organization or user ID for membership update")
    return
  }
  
  try {
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    
    const response = await fetch(
      `${backendUrl}/v1/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: role,
        }),
      }
    )
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[Clerk Webhook] Failed to update membership in backend:", errorData)
      return
    }
    
    console.log(`[Clerk Webhook] Membership updated: user=${userId} org=${organizationId} role=${role}`)
  } catch (error) {
    console.error("[Clerk Webhook] Error updating membership:", error)
  }
}

/**
 * Ensure user exists in platform before creating membership
 */
async function ensureUserExists(
  userId: string, 
  userData?: ClerkWebhookEvent["data"]["public_user_data"]
) {
  const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
  
  try {
    // Try to get user first
    const getResponse = await fetch(`${backendUrl}/v1/users/${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
    
    if (getResponse.ok) {
      // User exists
      return
    }
    
    // User doesn't exist, create them
    const email = userData?.identifier || `${userId}@unknown.email`
    const displayName = [userData?.first_name, userData?.last_name].filter(Boolean).join(" ") || "Unknown"
    
    const createResponse = await fetch(`${backendUrl}/v1/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: userId,
        email: email,
        display_name: displayName,
        avatar_url: userData?.image_url,
        role: "developer",
      }),
    })
    
    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({}))
      console.error("[Clerk Webhook] Failed to create user:", errorData)
    } else {
      console.log(`[Clerk Webhook] User created: ${userId}`)
    }
  } catch (error) {
    console.error("[Clerk Webhook] Error ensuring user exists:", error)
  }
}
