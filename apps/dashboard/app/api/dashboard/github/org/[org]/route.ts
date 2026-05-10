import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { resolveGithubTokenForUser } from "@/lib/server/github/auth"
import {
  buildGithubHeaders,
  GITHUB_API_BASE_URL,
} from "@/lib/server/github/client"

type GithubOrgApiResponse = {
  login?: string
  name?: string
  description?: string
  avatar_url?: string
  html_url?: string
  public_repos?: number
}

type GithubMemberApiResponse = {
  login?: string
  avatar_url?: string
  html_url?: string
  role?: string
}

type GithubUserApiResponse = {
  login?: string
  name?: string
  bio?: string
  avatar_url?: string
  html_url?: string
  public_repos?: number
}

type GithubOrgInfo = {
  name: string | null
  login: string | null
  description: string | null
  avatarUrl: string | null
  htmlUrl: string | null
  publicRepos: number | null
  isOrganization: boolean
  members: GithubMember[]
}

type GithubMember = {
  login: string
  avatarUrl: string | null
  htmlUrl: string | null
  role?: string
}

export async function GET(_request: Request, context: { params: Promise<{ org: string }> }) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { org: orgName } = await context.params

  const oauthToken = await resolveGithubTokenForUser(userId)

  try {
    // First try the GitHub organization endpoint.
    const orgResponse = await fetch(`${GITHUB_API_BASE_URL}/orgs/${encodeURIComponent(orgName)}`, {
      method: "GET",
      headers: buildGithubHeaders(oauthToken),
      cache: "no-store",
    })

    if (!orgResponse.ok) {
      if (orgResponse.status === 404) {
        // If it's not an org, it may still be a user account.
        const userResponse = await fetch(`${GITHUB_API_BASE_URL}/users/${encodeURIComponent(orgName)}`, {
          method: "GET",
          headers: buildGithubHeaders(oauthToken),
          cache: "no-store",
        })

        if (userResponse.ok) {
          const userData: GithubUserApiResponse = await userResponse.json()
          const userInfo: GithubOrgInfo = {
            name: userData.name || null,
            login: userData.login || null,
            description: userData.bio || null,
            avatarUrl: userData.avatar_url || null,
            htmlUrl: userData.html_url || null,
            publicRepos: userData.public_repos || null,
            isOrganization: false,
            members: [],
          }
          return NextResponse.json(userInfo, { status: 200 })
        }

        if (userResponse.status === 404) {
          return NextResponse.json({ error: "GitHub organization/user not found" }, { status: 404 })
        }

        return NextResponse.json({ error: "Failed to fetch organization/user" }, { status: 500 })
      }
      return NextResponse.json({ error: "Failed to fetch organization" }, { status: 500 })
    }

    const orgData: GithubOrgApiResponse = await orgResponse.json()

    // Fetch organization members
    const membersResponse = await fetch(`${GITHUB_API_BASE_URL}/orgs/${encodeURIComponent(orgName)}/members`, {
      method: "GET",
      headers: buildGithubHeaders(oauthToken),
      cache: "no-store",
    })

    let members: GithubMember[] = []
    if (membersResponse.ok) {
      const membersData: GithubMemberApiResponse[] = await membersResponse.json()
      members = membersData.map(member => ({
        login: member.login || "",
        avatarUrl: member.avatar_url || null,
        htmlUrl: member.html_url || null,
        role: member.role || "member"
      }))
    }

    const orgInfo: GithubOrgInfo = {
      name: orgData.name || null,
      login: orgData.login || null,
      description: orgData.description || null,
      avatarUrl: orgData.avatar_url || null,
      htmlUrl: orgData.html_url || null,
      publicRepos: orgData.public_repos || null,
      isOrganization: true,
      members: members
    }

    return NextResponse.json(orgInfo, { status: 200 })

  } catch (error) {
    console.error("Error fetching GitHub organization info:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
