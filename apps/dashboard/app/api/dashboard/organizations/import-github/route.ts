import { auth, clerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

type GitHubOrg = {
  login: string
  id: number
  avatar_url: string
  description: string | null
}

type GitHubMember = {
  login: string
  id: number
  avatar_url: string
  role: "admin" | "member"
}

export async function POST(req: Request) {
  const { userId } = await auth()
  
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { githubOrgName } = body

    if (!githubOrgName || typeof githubOrgName !== "string") {
      return NextResponse.json(
        { error: "GitHub organization name is required" },
        { status: 400 }
      )
    }

    console.log(`[GitHub Org Import] Importing organization: ${githubOrgName}`)

    // Step 1: Fetch GitHub org details
    const githubOrg = await fetchGitHubOrg(githubOrgName, userId)
    if (!githubOrg) {
      return NextResponse.json(
        { error: "GitHub organization not found or inaccessible" },
        { status: 404 }
      )
    }

    // Step 2: Fetch GitHub org members
    const githubMembers = await fetchGitHubOrgMembers(githubOrgName, userId)

    console.log(`[GitHub Org Import] Found ${githubMembers.length} members`)

    // Step 3: Create organization in Clerk
    const client = await clerkClient()
    const clerkOrg = await client.organizations.createOrganization({
      name: githubOrg.login,
      slug: githubOrg.login.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      createdBy: userId,
    })

    console.log(`[GitHub Org Import] Clerk org created: ${clerkOrg.id}`)

    // Step 4: Create organization in backend
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    
    const backendResponse = await fetch(`${backendUrl}/v1/organizations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": userId,
      },
      body: JSON.stringify({
        clerk_organization_id: clerkOrg.id,
        name: githubOrg.login,
        slug: clerkOrg.slug,
        github_org_id: githubOrg.id,
        github_org_name: githubOrg.login,
      }),
    })

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}))
      console.error("[GitHub Org Import] Backend creation failed:", errorData)
    }

    // Step 5: Import members
    const importedMembers = await importMembers(
      clerkOrg.id,
      githubMembers,
      userId
    )

    console.log(`[GitHub Org Import] Imported ${importedMembers.length} members`)

    return NextResponse.json({
      success: true,
      organization: {
        id: clerkOrg.id,
        name: clerkOrg.name,
        slug: clerkOrg.slug,
      },
      membersImported: importedMembers.length,
    })
  } catch (error) {
    console.error("[GitHub Org Import] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to import GitHub organization",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

async function fetchGitHubOrg(orgName: string, userId: string): Promise<GitHubOrg | null> {
  try {
    // Use the GitHub API proxy
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/dashboard/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "get_org",
        payload: {
          org: orgName,
        },
      }),
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data as GitHubOrg
  } catch (error) {
    console.error("[GitHub Org Import] Error fetching org:", error)
    return null
  }
}

async function fetchGitHubOrgMembers(orgName: string, userId: string): Promise<GitHubMember[]> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/dashboard/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "list_org_members",
        payload: {
          org: orgName,
        },
      }),
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    return data as GitHubMember[]
  } catch (error) {
    console.error("[GitHub Org Import] Error fetching members:", error)
    return []
  }
}

async function importMembers(
  clerkOrgId: string,
  githubMembers: GitHubMember[],
  importedBy: string
): Promise<Array<{ login: string; role: string }>> {
  const client = await clerkClient()
  const imported: Array<{ login: string; role: string }> = []

  for (const member of githubMembers) {
    try {
      // Map GitHub role to platform role
      const role = member.role === "admin" ? "admin" : "developer"

      // Try to find existing Clerk user by GitHub username
      // This is simplified - in production, you'd want a more robust matching system
      const users = await client.users.getUserList({
        query: member.login,
      })

      let clerkUserId: string | null = null

      if (users.data.length > 0) {
        // Found existing user
        clerkUserId = users.data[0].id
      } else {
        // Create invitation for this user
        // They'll need to sign up and connect their GitHub account
        console.log(`[GitHub Org Import] User ${member.login} not found, creating invitation`)
        // Note: Clerk doesn't support direct user creation without authentication
        // You'll need to send them an invitation email
        continue
      }

      // Add user to organization
      if (clerkUserId) {
        await client.organizations.createOrganizationMembership({
          organizationId: clerkOrgId,
          userId: clerkUserId,
          role: role as "org:admin" | "org:member",
        })

        imported.push({ login: member.login, role })
        console.log(`[GitHub Org Import] Added ${member.login} to organization with role ${role}`)
      }
    } catch (error) {
      console.error(`[GitHub Org Import] Error importing member ${member.login}:`, error)
    }
  }

  return imported
}
