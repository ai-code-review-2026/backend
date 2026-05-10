import { useState, useCallback } from "react"

export interface GitHubMember {
  login: string
  email?: string
  name?: string
  avatar_url: string
  type: "User" | "Bot"
  site_admin: boolean
  permissions?: {
    admin: boolean
    maintain: boolean
    push: boolean
    triage: boolean
    pull: boolean
  }
  role_in_organization?: "member" | "admin" | "billing_manager"
}

export interface GitHubOrganization {
  login: string
  id: number
  name?: string
  description?: string
  avatar_url: string
  members_count?: number
}

export interface RepoMembersPreview {
  repository: {
    full_name: string
    name: string
    owner: {
      login: string
      type: "User" | "Organization"
    }
    private: boolean
    permissions: {
      admin: boolean
      maintain: boolean
      push: boolean
    }
  }
  collaborators: GitHubMember[]
  organization?: GitHubOrganization
  organization_members: GitHubMember[]
  all_members: GitHubMember[] // Deduplicated list
  suggested_roles: {
    [key: string]: string // github_login -> suggested_role
  }
}

export function useGitHubMembersPreview() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<RepoMembersPreview | null>(null)

  const fetchMembersPreview = useCallback(async (repoFullName: string) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/dashboard/github/members/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: repoFullName })
      })

      if (!response.ok) {
        const raw = await response.text()
        let errorMessage = `HTTP ${response.status}`
        try {
          const parsed = JSON.parse(raw) as { error?: string }
          errorMessage = parsed.error || errorMessage
        } catch {
          errorMessage = raw || errorMessage
        }
        throw new Error(errorMessage)
      }

      const data: RepoMembersPreview = await response.json()
      setPreview(data)
      
      return data

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      setError(errorMessage)
      console.error("Failed to fetch members preview:", errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const clearPreview = useCallback(() => {
    setPreview(null)
    setError(null)
  }, [])

  return {
    loading,
    error,
    preview,
    fetchMembersPreview,
    clearPreview
  }
}
