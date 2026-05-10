"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Code2, Loader2, Users, Building2, GitFork, Star } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { formatDate } from "@/lib/domain/dates"
import { extractApiErrorMessage } from "@/lib/display"

interface GitHubOrg {
  login: string
  name: string
  description: string | null
  avatarUrl: string | null
  htmlUrl: string | null
  publicRepos: number
  followers: number
  location: string | null
  blog: string | null
}

interface GitHubRepo {
  id: number
  name: string
  fullName: string
  description: string | null
  private: boolean
  htmlUrl: string
  language: string | null
  stars: number
  forks: number
  updatedAt: string | null
  defaultBranch: string | null
}

interface GitHubMember {
  login: string
  id: number
  avatarUrl: string | null
  htmlUrl: string | null
  type: string
  siteAdmin: boolean
}

interface OrganizationResponse {
  connected: boolean
  organizations?: Array<{ login: string; name?: string; description?: string; avatarUrl?: string | null }>
  error?: string
}

interface OrgDetailsResponse {
  connected: boolean
  organization?: GitHubOrg
  repos?: GitHubRepo[]
  members?: GitHubMember[]
  error?: string
}

export function GitHubOrganizationData() {
  const [orgs, setOrgs] = useState<Array<{ login: string; name?: string; description?: string; avatarUrl?: string | null }>>([])
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null)
  const [orgDetails, setOrgDetails] = useState<OrgDetailsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load initial list of orgs
  useEffect(() => {
    const loadOrgs = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch("/api/dashboard/github/organizations")
        const data: OrganizationResponse = await res.json()

        if (!data.connected) {
          setError(extractApiErrorMessage(data, "GitHub not connected"))
          setOrgs([])
          return
        }

        if (data.organizations && data.organizations.length > 0) {
          setOrgs(data.organizations)
          setSelectedOrg(data.organizations[0].login)
        } else {
          setError("No GitHub organizations found")
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load organizations")
      } finally {
        setLoading(false)
      }
    }

    loadOrgs()
  }, [])

  // Load org details when selection changes
  useEffect(() => {
    if (!selectedOrg) return

    const loadOrgDetails = async () => {
      try {
        setError(null)
        const res = await fetch(`/api/dashboard/github/organizations?org=${encodeURIComponent(selectedOrg)}`)
        const data: OrgDetailsResponse = await res.json()

        if (!data.connected) {
          setError(extractApiErrorMessage(data, "Failed to fetch organization details"))
          setOrgDetails(null)
          return
        }

        setOrgDetails(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load organization details")
        setOrgDetails(null)
      }
    }

    loadOrgDetails()
  }, [selectedOrg])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 mr-2 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Loading GitHub organizations...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (orgs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No GitHub organizations</p>
          <p className="text-sm text-muted-foreground">
            Connect your GitHub account to see your organizations and repositories.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Organization Selector */}
      {orgs.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              GitHub Organizations
            </CardTitle>
            <CardDescription>Select an organization to view repositories and members</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {orgs.map((org) => (
                <button
                  key={org.login}
                  onClick={() => setSelectedOrg(org.login)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    selectedOrg === org.login
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {org.avatarUrl && (
                      <img src={org.avatarUrl} alt={org.login} className="h-8 w-8 rounded-full" />
                    )}
                    <div>
                      <p className="font-medium">{org.name || org.login}</p>
                      <p className="text-xs text-muted-foreground">{org.login}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Organization Details */}
      {orgDetails?.organization && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {orgDetails.organization.avatarUrl && (
                    <img
                      src={orgDetails.organization.avatarUrl}
                      alt={orgDetails.organization.login}
                      className="h-16 w-16 rounded-lg"
                    />
                  )}
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {orgDetails.organization.name || orgDetails.organization.login}
                    </CardTitle>
                    <CardDescription>
                      {orgDetails.organization.login}
                    </CardDescription>
                    {orgDetails.organization.description && (
                      <p className="text-sm text-muted-foreground mt-2">{orgDetails.organization.description}</p>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-2xl font-bold">{orgDetails.organization.publicRepos}</p>
                  <p className="text-sm text-muted-foreground">Public Repositories</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{orgDetails.organization.followers}</p>
                  <p className="text-sm text-muted-foreground">Followers</p>
                </div>
                {orgDetails.organization.location && (
                  <div>
                    <p className="font-medium text-sm">{orgDetails.organization.location}</p>
                    <p className="text-sm text-muted-foreground">Location</p>
                  </div>
                )}
                {orgDetails.organization.blog && (
                  <div>
                    <a
                      href={orgDetails.organization.blog}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline truncate"
                    >
                      {orgDetails.organization.blog}
                    </a>
                    <p className="text-sm text-muted-foreground">Website</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Repositories */}
          {orgDetails.repos && orgDetails.repos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-5 w-5" />
                  Repositories ({orgDetails.repos.length})
                </CardTitle>
                <CardDescription>Latest repositories from this organization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {orgDetails.repos.slice(0, 10).map((repo) => (
                    <a
                      key={repo.id}
                      href={repo.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate">{repo.name}</h4>
                          {repo.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {repo.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-2">
                            {repo.language && (
                              <Badge variant="secondary" className="text-xs">
                                {repo.language}
                              </Badge>
                            )}
                            {repo.private && (
                              <Badge variant="outline" className="text-xs">
                                Private
                              </Badge>
                            )}
                            {repo.defaultBranch && (
                              <span className="text-xs text-muted-foreground">
                                default: {repo.defaultBranch}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {repo.stars > 0 && (
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {repo.stars}
                            </div>
                          )}
                          {repo.forks > 0 && (
                            <div className="flex items-center gap-1">
                              <GitFork className="h-3 w-3" />
                              {repo.forks}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Updated {formatDate(repo.updatedAt, "en-US")}
                      </p>
                    </a>
                  ))}
                  {orgDetails.repos.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      and {orgDetails.repos.length - 10} more repositories...
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Members */}
          {orgDetails.members && orgDetails.members.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Members ({orgDetails.members.length})
                </CardTitle>
                <CardDescription>Public members of this organization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {orgDetails.members.slice(0, 12).map((member) => (
                    <a
                      key={member.id}
                      href={member.htmlUrl ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.login} />}
                        <AvatarFallback>{member.login.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{member.login}</p>
                        {member.siteAdmin && (
                          <Badge variant="secondary" className="text-xs mt-1">
                            Site Admin
                          </Badge>
                        )}
                      </div>
                    </a>
                  ))}
                  {orgDetails.members.length > 12 && (
                    <p className="text-xs text-muted-foreground text-center col-span-full py-2">
                      and {orgDetails.members.length - 12} more members...
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
