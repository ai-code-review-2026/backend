"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge" 
import { Button } from "@/components/ui/button"
import { ChevronRight, ChevronDown, Users, GitBranch, Code, FolderOpen, Layers } from "lucide-react"
import { cn } from "@/lib/utils"

interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  github_org_id?: string
  settings: any
}

interface Project {
  id: string
  name: string
  description?: string
  organization_id: string
  project_type: string
  team_count: number
  repo_count: number
  teams: Team[]
  repositories: Repository[]
  settings: any
}

interface Team {
  id: string
  name: string
  description?: string
  organization_id: string
  project_id: string
  team_lead_id?: string
  member_count: number
  project_name?: string
  members?: TeamMember[]
  repositories?: Repository[]
}

interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: string
  permissions: string[]
  joined_at: string
  email?: string
  display_name?: string
}

interface Repository {
  id: string
  name: string
  full_name: string
  description?: string
  organization_id?: string
  project_id?: string
  team_id?: string
  github_repo_id?: number
  github_url?: string
  default_branch: string
  is_private: boolean
  language?: string
  branch_count: number
  team_name?: string
  project_name?: string
  branches?: Branch[]
  recent_commits?: Commit[]
}

interface Branch {
  id: string
  name: string
  repository_id: string
  commit_sha?: string
  is_default: boolean
  is_protected: boolean
  commit_count: number
  protection_rules: any
}

interface Commit {
  id: string
  sha: string
  branch_id: string
  repository_id: string
  author_name?: string
  author_email?: string
  author_id?: string
  message?: string
  additions: number
  deletions: number
  changed_files: number
  committed_at?: string
  branch_name?: string
}

interface OrganizationHierarchyData {
  organization: Organization
  projects: Project[]
}

interface Props {
  organizationId: string
  className?: string
}

export function OrganizationHierarchyNav({ organizationId, className }: Props) {
  const [data, setData] = useState<OrganizationHierarchyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set())
  const [selectedItem, setSelectedItem] = useState<{type: string, id: string} | null>(null)

  useEffect(() => {
    fetchHierarchy()
  }, [organizationId])

  const fetchHierarchy = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/dashboard/structure/organizations/${organizationId}/hierarchy`)
      if (!response.ok) throw new Error("Failed to fetch hierarchy")
      const result = await response.json()
      setData(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpanded = (type: string, id: string) => {
    const setters = {
      project: setExpandedProjects,
      team: setExpandedTeams,
      repository: setExpandedRepos
    }
    
    const setter = setters[type as keyof typeof setters]
    if (setter) {
      setter(prev => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
    }
  }

  const isExpanded = (type: string, id: string) => {
    const maps = {
      project: expandedProjects,
      team: expandedTeams, 
      repository: expandedRepos
    }
    return maps[type as keyof typeof maps]?.has(id) || false
  }

  const selectItem = (type: string, id: string) => {
    setSelectedItem({ type, id })
  }

  const isSelected = (type: string, id: string) => {
    return selectedItem?.type === type && selectedItem?.id === id
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Organization Structure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{error || "Failed to load organization structure"}</p>
          <Button onClick={fetchHierarchy} className="mt-2">Retry</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          {data.organization.name}
        </CardTitle>
        <CardDescription>
          {data.organization.description || "Organization structure and navigation"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="space-y-1">
          {/* Organization Level */}
          <div 
            className={cn(
              "p-3 hover:bg-muted/50 cursor-pointer border-l-4 transition-colors",
              isSelected("organization", data.organization.id) ? "border-l-primary bg-muted" : "border-l-transparent"
            )}
            onClick={() => selectItem("organization", data.organization.id)}
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{data.organization.name}</span>
              <Badge variant="outline">{data.projects.length} projects</Badge>
            </div>
          </div>

          {/* Projects Level */}
          {data.projects.map((project) => (
            <div key={project.id} className="ml-4">
              <div 
                className={cn(
                  "p-2 hover:bg-muted/50 cursor-pointer rounded border-l-2 transition-colors",
                  isSelected("project", project.id) ? "border-l-primary bg-muted" : "border-l-transparent"
                )}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleExpanded("project", project.id)
                    }}
                    className="p-0.5 hover:bg-muted rounded"
                  >
                    {isExpanded("project", project.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <Code className="h-4 w-4 text-blue-600" />
                  <span 
                    className="font-medium flex-1"
                    onClick={() => selectItem("project", project.id)}
                  >
                    {project.name}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {project.team_count} teams
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {project.repo_count} repos
                  </Badge>
                </div>
              </div>

              {/* Teams Level */}
              {isExpanded("project", project.id) && (
                <div className="ml-6 space-y-1 mt-1">
                  {project.teams?.map((team) => (
                    <div key={team.id}>
                      <div 
                        className={cn(
                          "p-2 hover:bg-muted/50 cursor-pointer rounded border-l-2 transition-colors",
                          isSelected("team", team.id) ? "border-l-primary bg-muted" : "border-l-transparent"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpanded("team", team.id)
                            }}
                            className="p-0.5 hover:bg-muted rounded"
                          >
                            {isExpanded("team", team.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <Users className="h-4 w-4 text-green-600" />
                          <span 
                            className="font-medium flex-1"
                            onClick={() => selectItem("team", team.id)}
                          >
                            {team.name}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {team.member_count} members
                          </Badge>
                        </div>
                      </div>

                      {/* Team Members & Repositories */}
                      {isExpanded("team", team.id) && (
                        <div className="ml-6 space-y-1 mt-1">
                          {team.repositories?.map((repo) => (
                            <div key={repo.id}>
                              <div 
                                className={cn(
                                  "p-2 hover:bg-muted/50 cursor-pointer rounded border-l-2 transition-colors",
                                  isSelected("repository", repo.id) ? "border-l-primary bg-muted" : "border-l-transparent"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleExpanded("repository", repo.id)
                                    }}
                                    className="p-0.5 hover:bg-muted rounded"
                                  >
                                    {isExpanded("repository", repo.id) ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </button>
                                  <GitBranch className="h-4 w-4 text-orange-600" />
                                  <span 
                                    className="font-medium flex-1"
                                    onClick={() => selectItem("repository", repo.id)}
                                  >
                                    {repo.name}
                                  </span>
                                  {repo.is_private && (
                                    <Badge variant="outline" className="text-xs">Private</Badge>
                                  )}
                                  <Badge variant="secondary" className="text-xs">
                                    {repo.branch_count} branches
                                  </Badge>
                                </div>
                              </div>

                              {/* Branches Level */}
                              {isExpanded("repository", repo.id) && (
                                <div className="ml-6 space-y-1 mt-1">
                                  {repo.branches?.map((branch) => (
                                    <div 
                                      key={branch.id}
                                      className={cn(
                                        "p-1.5 hover:bg-muted/50 cursor-pointer rounded text-sm border-l-2 transition-colors",
                                        isSelected("branch", branch.id) ? "border-l-primary bg-muted" : "border-l-transparent"
                                      )}
                                      onClick={() => selectItem("branch", branch.id)}
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 flex items-center justify-center">
                                          <div className={cn(
                                            "w-2 h-2 rounded-full",
                                            branch.is_default ? "bg-green-500" : "bg-muted-foreground"
                                          )} />
                                        </div>
                                        <span className="flex-1">{branch.name}</span>
                                        {branch.is_protected && (
                                          <Badge variant="destructive" className="text-xs">Protected</Badge>
                                        )}
                                        <Badge variant="outline" className="text-xs">
                                          {branch.commit_count} commits
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Direct Project Repositories (not assigned to teams) */}
                  {project.repositories?.filter(repo => !repo.team_id).map((repo) => (
                    <div key={repo.id}>
                      <div 
                        className={cn(
                          "p-2 hover:bg-muted/50 cursor-pointer rounded border-l-2 transition-colors",
                          isSelected("repository", repo.id) ? "border-l-primary bg-muted" : "border-l-transparent"
                        )}
                        onClick={() => selectItem("repository", repo.id)}
                      >
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-purple-600" />
                          <span className="font-medium flex-1">{repo.name}</span>
                          <Badge variant="outline" className="text-xs">Unassigned</Badge>
                          <Badge variant="secondary" className="text-xs">
                            {repo.branch_count} branches
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default OrganizationHierarchyNav