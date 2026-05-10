import { auth, clerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const { userId } = await auth()
  
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, slug } = body

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      )
    }

    console.log(`[Organization Create] Creating organization:`, { name, slug, userId })

    // Step 1: Create organization in Clerk
    const client = await clerkClient()
    const clerkOrg = await client.organizations.createOrganization({
      name,
      slug: slug || undefined,
      createdBy: userId,
    })

    console.log(`[Organization Create] Clerk org created: ${clerkOrg.id}`)

    // Step 2: Create organization in backend
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    
    try {
      const backendResponse = await fetch(`${backendUrl}/v1/organizations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": userId,
        },
        body: JSON.stringify({
          clerk_organization_id: clerkOrg.id,
          name: clerkOrg.name,
          slug: clerkOrg.slug,
        }),
      })

      if (!backendResponse.ok) {
        const errorData = await backendResponse.json().catch(() => ({}))
        console.error("[Organization Create] Backend creation failed:", errorData)
        // Don't fail the whole operation - the webhook will sync it later
      } else {
        console.log("[Organization Create] Backend org created successfully")
      }
    } catch (backendError) {
      console.error("[Organization Create] Backend request error:", backendError)
      // Don't fail - webhook will handle sync
    }

    // Step 3: GitHub org creation (optional, typically manual)
    // Creating GitHub organizations requires special permissions and is typically done manually
    // or through GitHub's organization creation flow
    console.log("[Organization Create] GitHub org creation should be done manually")

    return NextResponse.json({
      success: true,
      organization: {
        id: clerkOrg.id,
        name: clerkOrg.name,
        slug: clerkOrg.slug,
        createdAt: clerkOrg.createdAt,
      },
    })
  } catch (error) {
    console.error("[Organization Create] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to create organization",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
