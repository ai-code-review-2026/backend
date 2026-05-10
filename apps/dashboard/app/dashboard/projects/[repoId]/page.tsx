"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  ExternalLink,
  Folder,
  GitBranch,
  Loader2,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
} from "lucide-react"
import { Github } from "@/components/ui/social-icons"

import { Badge } from "@/components/ui/badge"
import { BADGE_SUCCESS, BADGE_WARNING, BADGE_SECONDARY } from "@/lib/design-tokens"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TeamManagement } from "@/components/dashboard/TeamManagement"
import { extractApiErrorMessage } from "@/lib/display"
import { formatCompactRelativeTime } from "@/lib/domain/dates"
import { normalizeRepositoryId } from "@/lib/repository-links"

type ProjectStatus = "active" | "maintenance" | "archived"

interface ProjectViewModel {
  id: string
  fullName: string
  name: string
  description: string | null
  language: string | null
  teamName: string | null
  status: ProjectStatus
  lastActivity: string
  lastAnalysisAt: string | null
  branchCount: number
  analysisCount: number
  contributorCount: number
  healthScore: number
  autoAnalysisEnabled: boolean
}

interface GithubRepo {
  id: number
  name: string
  fullName: string
  private: boolean
  htmlUrl: string | null
  defaultBranch: string | null
  ownerLogin: string | null
  updatedAt: string | null
  description?: string | null
  language?: string | null
}

interface GithubMember {
  login: string
  avatarUrl: string | null
  htmlUrl: string | null
  role?: string
}

interface GithubOrgInfo {
  name: string | null
  login: string | null
  description: string | null
  avatarUrl: string | null
  htmlUrl: string | null
  publicRepos: number | null
  members: GithubMember[]
}

interface BackendProjectMember {
  user_id: string
  email?: string | null
  display_name?: string | null
  role: string
}

interface BackendProjectBranch {
  name: string
  is_default: boolean
  is_protected: boolean
  require_reviews: number
}

interface BackendProjectDetailsResponse {
  id: string
  name: string
  full_name: string
  description: string | null
  language: string | null
  status: ProjectStatus
  team_name: string | null
  member_count: number
  members: BackendProjectMember[]
  branch_count: number
  branches: BackendProjectBranch[]
  auto_analysis_enabled: boolean
  health_score: number
  analysis_count: number
  last_analysis_at: string | null
  resolved_project_id?: string
  requested_id?: string
}

const statusConfig: Record<ProjectStatus, { label: string; variant: string }> = {
  active: { label: "Actif", variant: BADGE_SUCCESS },
  maintenance: { label: "Maintenance", variant: BADGE_WARNING },
  archived: { label: "Archive", variant: BADGE_SECONDARY },
}

function mapProjectResponse(data: BackendProjectDetailsResponse): ProjectViewModel {
  return {
    id: data.id,
    fullName: data.full_name,
    name: data.name,
    description: data.description,
    language: data.language,
    teamName: data.team_name,
    status: data.status,
    lastActivity: data.last_analysis_at
      ? formatCompactRelativeTime(data.last_analysis_at)
      : "Never",
    lastAnalysisAt: data.last_analysis_at,
    branchCount: typeof data.branch_count === "number" ? data.branch_count : data.branches.length,
    analysisCount: data.analysis_count ?? 0,
    contributorCount:
      typeof data.member_count === "number" ? data.member_count : data.members.length,
    healthScore: data.health_score ?? 0,
    autoAnalysisEnabled: data.auto_analysis_enabled ?? true,
  }
}

async function fetchOwnerRepos(ownerName: string, accountType: "user" | "org"): Promise<GithubRepo[]> {
  const response = await fetch(
    `/api/dashboard/github/repos?account=${encodeURIComponent(ownerName)}&type=${accountType}`,
    { cache: "no-store" },
  )

  if (!response.ok) {
    return []
  }

  const payload = await response.json().catch(() => ({}))
  return Array.isArray(payload.items) ? (payload.items as GithubRepo[]) : []
}

export default function ProjectDetailPage() {
  const params = useParams() as { repoId?: string | string[] }
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = normalizeRepositoryId(
    Array.isArray(params.repoId) ? params.repoId[0] ?? "" : params.repoId ?? "",
  )
  const initialTab = searchParams.get("tab") || "overview"

  const [project, setProject] = useState<ProjectViewModel | null>(null)
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([])
  const [githubOrgInfo, setGithubOrgInfo] = useState<GithubOrgInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingGithub, setLoadingGithub] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) {
      setProject(null)
      setError("Project identifier is missing")
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchGithubInfo = async (ownerSeed: string) => {
      const ownerName = ownerSeed.includes("/") ? ownerSeed.split("/")[0] : ownerSeed
      if (!ownerName) {
        return
      }

      try {
        setLoadingGithub(true)

        const orgResponse = await fetch(
          `/api/dashboard/github/org/${encodeURIComponent(ownerName)}`,
          { cache: "no-store" },
        )

        let repos: GithubRepo[] = []
        let orgInfo: GithubOrgInfo | null = null

        if (orgResponse.ok) {
          orgInfo = (await orgResponse.json().catch(() => null)) as GithubOrgInfo | null
          repos = await fetchOwnerRepos(ownerName, "org")
        } else {
          repos = await fetchOwnerRepos(ownerName, "user")
        }

        if (!cancelled) {
          setGithubOrgInfo(orgInfo)
          setGithubRepos(repos)
        }
      } catch (err) {
        console.error("Could not fetch GitHub information:", err)
      } finally {
        if (!cancelled) {
          setLoadingGithub(false)
        }
      }
    }

    const fetchProject = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/dashboard/projects/${encodeURIComponent(projectId)}`, {
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        })
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(extractApiErrorMessage(payload, `Failed to load project: ${response.status}`))
        }

        if (!cancelled) {
          const responsePayload = payload as BackendProjectDetailsResponse
          const mapped = mapProjectResponse(responsePayload)
          setProject(mapped)
          void fetchGithubInfo(mapped.fullName)

          const resolvedCandidate = responsePayload.resolved_project_id
          const resolvedProjectId = typeof resolvedCandidate === "string" ? resolvedCandidate.trim() : ""
          if (resolvedProjectId && resolvedProjectId !== projectId) {
            const suffix = initialTab ? `?tab=${encodeURIComponent(initialTab)}` : ""
            router.replace(`/dashboard/projects/${encodeURIComponent(resolvedProjectId)}${suffix}`)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setProject(null)
          setError(err instanceof Error ? err.message : "Failed to load project")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchProject()

    return () => {
      cancelled = true
    }
  }, [initialTab, projectId, router])

  const handleBack = () => {
    router.push("/dashboard/projects")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-3 text-muted-foreground">Loading project...</span>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="space-y-6">
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
              <h3 className="mb-2 text-lg font-semibold text-red-700 dark:text-destructive">
                Project not found
              </h3>
              <p className="mb-4 text-destructive">
                {error || "The requested project could not be found."}
              </p>
              <Button onClick={handleBack} variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Projects
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const status = statusConfig[project.status] ?? statusConfig.active

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button onClick={handleBack} variant="outline" size="icon">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex w-full flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold">
              <Folder className="h-8 w-8 text-blue-500" />
              {project.name}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {project.description || project.fullName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => router.push(`/dashboard/projects/${encodeURIComponent(project.id)}/analyses/new`)}
            >
              <Play className="mr-2 h-4 w-4" />
              Nouvelle analyse
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/projects/${encodeURIComponent(project.id)}/analyses`)}
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Analyses
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/projects/${encodeURIComponent(project.id)}/collaborators`)}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Collaborateurs
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/projects/${encodeURIComponent(project.id)}/settings`)}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Parametres
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList>
          <TabsTrigger value="overview">
            <Folder className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="mr-2 h-4 w-4" />
            Team
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Folder className="h-5 w-5" />
                    Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={status.variant as "success" | "warning" | "secondary"}>
                      {status.label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Language</span>
                    <Badge variant="outline">{project.language || "N/A"}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Team</span>
                    <span className="text-sm font-medium">{project.teamName || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Auto Analysis</span>
                    <Badge variant={project.autoAnalysisEnabled ? "default" : "secondary"}>
                      {project.autoAnalysisEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Health Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div
                      className={`text-4xl font-bold ${
                        project.healthScore >= 90
                          ? "text-[color:var(--green-status)]"
                          : project.healthScore >= 70
                            ? "text-[color:var(--orange)]"
                            : "text-destructive"
                      }`}
                    >
                      {project.healthScore}%
                    </div>
                    <div className="mt-2">
                      <div className="h-2 w-full rounded-full bg-gray-200">
                        <div
                          className={`h-2 rounded-full ${
                            project.healthScore >= 90
                              ? "bg-green-500"
                              : project.healthScore >= 70
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${project.healthScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <GitBranch className="h-4 w-4" />
                      Branches
                    </span>
                    <span className="font-medium">{project.branchCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <ShieldCheck className="h-4 w-4" />
                      Analyses
                    </span>
                    <span className="font-medium">{project.analysisCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      Team Members
                    </span>
                    <span className="font-medium">{project.contributorCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Last Analysis
                    </span>
                    <span className="font-medium">{project.lastActivity}</span>
                  </div>
                </CardContent>
              </Card>

              {githubOrgInfo && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      GitHub Organization
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      {githubOrgInfo.avatarUrl && (
                        <Image
                          src={githubOrgInfo.avatarUrl}
                          alt={githubOrgInfo.name || githubOrgInfo.login || "Organization"}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-full"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold">{githubOrgInfo.name || githubOrgInfo.login}</h3>
                        <p className="text-sm text-muted-foreground">
                          {githubOrgInfo.description || "No description"}
                        </p>
                      </div>
                      {githubOrgInfo.htmlUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={githubOrgInfo.htmlUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Public Repos</span>
                      <span className="font-medium">{githubOrgInfo.publicRepos || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Members</span>
                      <span className="font-medium">{githubOrgInfo.members.length}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Github className="h-5 w-5" />
                  GitHub Repositories
                  {loadingGithub && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {githubRepos.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {githubRepos.map((repo) => (
                      <div key={repo.id} className="rounded-lg border p-4">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold">{repo.name}</h3>
                            <p className="truncate text-xs text-muted-foreground">
                              {repo.fullName}
                            </p>
                          </div>
                          {repo.htmlUrl && (
                            <Button variant="ghost" size="sm" asChild className="h-6 w-6 p-0">
                              <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </div>
                        {repo.description && (
                          <p className="mb-2 text-xs text-muted-foreground line-clamp-2">
                            {repo.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {repo.language && (
                            <div className="flex items-center gap-1">
                              <div className="h-2 w-2 rounded-full bg-blue-500" />
                              {repo.language}
                            </div>
                          )}
                          <Badge variant={repo.private ? "secondary" : "outline"} className="text-xs">
                            {repo.private ? "Private" : "Public"}
                          </Badge>
                          {repo.defaultBranch && <span>default: {repo.defaultBranch}</span>}
                        </div>
                        {repo.updatedAt && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Updated {formatCompactRelativeTime(repo.updatedAt)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <Github className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                    <h3 className="text-lg font-medium">No GitHub repositories loaded</h3>
                    <p className="mt-1 text-muted-foreground">
                      Repository metadata will appear here when the connected GitHub account can access
                      the owner profile.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Knowledge Base</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Index and manage knowledge sources for this project.
                </p>
              </CardHeader>
              <CardContent>
                <div className="py-8 text-center">
                  <Folder className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-medium">Knowledge Base Management</h3>
                  <p className="mb-4 text-muted-foreground">
                    Index repositories, documents, and other sources to build the knowledge base for
                    AI-powered code reviews.
                  </p>
                  <Button variant="outline">Manage Knowledge Base</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamManagement projectId={project.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
