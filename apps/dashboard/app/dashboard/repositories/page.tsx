"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  GitBranch,
  GitPullRequest,
  Star,
  StarOff,
  Eye,
  Code2,
  ExternalLink,
  MoreHorizontal,
  Search,
  Plus,
  RefreshCw,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle2,
  Settings,
  Copy,
  Loader2,
  FolderGit2,
  ChevronLeft,
  Users,
  Mail,
  Filter,
} from "lucide-react"
import { Github } from "@/components/ui/social-icons"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  fetchGithubRepos,
  type GithubRepoOption,
} from "@/lib/github-repos"
import { extractApiErrorMessage } from "@/lib/display"
import { formatCompactRelativeTime } from "@/lib/domain/dates"
import {
  copyTextToClipboard,
  getGitHubCloneUrl,
  getGitHubRepositoryUrl,
  getRepositoryPath,
  getRepositorySettingsPath,
} from "@/lib/repository-links"

// Types for repository data from backend
interface Repository {
  id: string
  name: string
  full_name: string
  description: string | null
  language: string | null
  visibility: "public" | "private" | "internal"
  default_branch: string | null
  indexed_commit: string | null
  ci_status: "passing" | "failing" | "unknown"
  last_analysis_at: string | null
  analysis_count: number
  quality_score: number | null
  security_score: number | null
  total_findings: number
  open_issues: number
  created_at: string
  updated_at: string
}

interface RepositoryListResponse {
  items: Repository[]
  total: number
  page: number
  limit: number
  pages: number
}

const EMPTY_REPOSITORY_RESPONSE: RepositoryListResponse = {
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  pages: 1,
}

const languageColors: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-400",
  Go: "bg-cyan-500",
  Python: "bg-yellow-500",
  Rust: "bg-orange-500",
  Java: "bg-red-500",
  "C#": "bg-purple-500",
  Ruby: "bg-red-400",
  PHP: "bg-indigo-400",
  Dart: "bg-teal-500",
}

const ciStatusConfig = {
  passing: { icon: CheckCircle2, className: "text-green-500" },
  failing: { icon: AlertCircle, className: "text-destructive" },
  unknown: { icon: RefreshCw, className: "text-muted-foreground" },
}

interface RepositoryRowProps {
  repo: Repository
  onViewRepository: (repo: Repository) => void
  onCopyCloneUrl: (repo: Repository) => Promise<void>
  onOpenGitHub: (repo: Repository) => void
  onOpenSettings: (repo: Repository) => void
}

function RepositoryRow({
  repo,
  onViewRepository,
  onCopyCloneUrl,
  onOpenGitHub,
  onOpenSettings,
}: RepositoryRowProps) {
  const [isStarred, setIsStarred] = useState(false)
  const CiIcon = ciStatusConfig[repo.ci_status]?.icon || ciStatusConfig.unknown.icon
  const ciClassName = ciStatusConfig[repo.ci_status]?.className || ciStatusConfig.unknown.className

  return (
    <TableRow className="group hover:bg-muted/50">
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Code2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{repo.name}</span>
              {repo.visibility === "private" ? (
                <Lock className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Unlock className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {repo.description || repo.full_name}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {repo.language ? (
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${languageColors[repo.language] || "bg-gray-400"}`} />
            <span className="text-sm">{repo.language}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Unknown</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <CiIcon className={`h-4 w-4 ${ciClassName}`} />
          <span className="text-sm capitalize">{repo.ci_status}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1" title="Analyses">
            <GitBranch className="h-4 w-4" />
            {repo.analysis_count}
          </span>
          <span className="flex items-center gap-1" title="Total Findings">
            <GitPullRequest className="h-4 w-4" />
            {repo.total_findings}
          </span>
          <span className="flex items-center gap-1" title="Open Issues">
            <AlertCircle className="h-4 w-4" />
            {repo.open_issues}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          <p className="truncate max-w-[200px]">
            {repo.default_branch || "main"}
          </p>
          <p className="text-xs text-muted-foreground">
            Last analysis: {repo.last_analysis_at ? formatCompactRelativeTime(repo.last_analysis_at) : "Never"}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsStarred(!isStarred)}
          >
            {isStarred ? (
              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            ) : (
              <StarOff className="h-4 w-4" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onViewRepository(repo)}>
                <Eye className="h-4 w-4 mr-2" />
                View Repository
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { void onCopyCloneUrl(repo) }}>
                <Copy className="h-4 w-4 mr-2" />
                Clone URL
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenGitHub(repo)}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in GitHub
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onOpenSettings(repo)}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

function RepositoryRowSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
    </TableRow>
  )
}

// Role options for project members (simplified)
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "tech_lead", label: "Tech Lead" },
  { value: "developer", label: "Developer" },
]

type DetectedMember = {
  github_login: string
  email: string | null
  display_name: string | null
  source: string[]
  role: string
  hasAccount: boolean  // we don't know at step-2 time, always false until BFF resolves
}

type GithubDetectedMemberItem = {
  login?: string
  email?: string | null
  name?: string | null
  source?: string[]
}

export default function RepositoriesPage() {
  const router = useRouter()
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [languageFilter, setLanguageFilter] = useState("all")
  const [visibilityFilter, setVisibilityFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2>(1)

  // Step 1
  const [githubRepos, setGithubRepos] = useState<GithubRepoOption[]>([])
  const [isLoadingGithubRepos, setIsLoadingGithubRepos] = useState(false)
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null)
  const [selectedRepo, setSelectedRepo] = useState<string>("")
  const [manualRepoUrl, setManualRepoUrl] = useState("")
  const [importMode, setImportMode] = useState<"github" | "manual">("github")

  // Step 2 (GitHub only)
  const [projectName, setProjectName] = useState("")
  const [detectedMembers, setDetectedMembers] = useState<DetectedMember[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)

  // Shared
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)

  const fetchRepositories = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...(searchQuery && { search: searchQuery }),
        ...(languageFilter !== "all" && { language: languageFilter }),
        ...(visibilityFilter !== "all" && { visibility: visibilityFilter }),
      })
      const response = await fetch(`/api/dashboard/repositories?${params}`)
      const data = (await response.json().catch(() => null)) as Partial<RepositoryListResponse> | null

      if (!response.ok) {
        const fallback = data ?? EMPTY_REPOSITORY_RESPONSE
        setRepositories(Array.isArray(fallback.items) ? fallback.items : [])
        setTotalPages(typeof fallback.pages === "number" ? fallback.pages : 1)
        setTotal(typeof fallback.total === "number" ? fallback.total : 0)
        throw new Error(`Failed to fetch repositories: ${response.statusText}`)
      }

      const normalized: RepositoryListResponse = {
        items: Array.isArray(data?.items) ? (data.items as Repository[]) : [],
        total: typeof data?.total === "number" ? data.total : 0,
        page: typeof data?.page === "number" ? data.page : 1,
        limit: typeof data?.limit === "number" ? data.limit : 20,
        pages: typeof data?.pages === "number" ? data.pages : 1,
      }
      setRepositories(normalized.items)
      setTotalPages(normalized.pages)
      setTotal(normalized.total)
    } catch (err) {
      console.error("Error fetching repositories:", err)
      setError(err instanceof Error ? err.message : "Failed to load repositories")
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery, languageFilter, visibilityFilter])

  useEffect(() => {
    void fetchRepositories()
  }, [fetchRepositories])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load GitHub repos when dialog opens at step 1
  useEffect(() => {
    if (!importDialogOpen || wizardStep !== 1) return
    void loadGithubRepos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importDialogOpen, wizardStep])

  const loadGithubRepos = async () => {
    setIsLoadingGithubRepos(true)
    try {
      const data = await fetchGithubRepos()
      setGithubConnected(data.connected)
      setGithubRepos(data.items)
    } catch (err) {
      console.error("Error loading GitHub repos:", err)
      setGithubConnected(false)
    } finally {
      setIsLoadingGithubRepos(false)
    }
  }

  // Fetch collaborators when advancing to step 2 in GitHub mode
  const loadRepoMembers = async (fullName: string) => {
    setIsLoadingMembers(true)
    setDetectedMembers([])
    try {
      const res = await fetch(
        `/api/dashboard/github/repos/collaborators?repo=${encodeURIComponent(fullName)}`,
      )
      if (res.ok) {
        const data = (await res.json()) as { items?: GithubDetectedMemberItem[] }
        const memberMap = new Map<string, DetectedMember>()
        for (const item of Array.isArray(data.items) ? data.items : []) {
          const login = typeof item?.login === "string" ? item.login.trim() : ""
          if (!login) continue
          const key = login.toLowerCase()
          const existing = memberMap.get(key)
          const sources = new Set<string>(existing?.source ?? [])
          for (const source of Array.isArray(item?.source) ? item.source : []) {
            if (typeof source === "string" && source.trim()) sources.add(source.trim())
          }
          memberMap.set(key, {
            github_login: login,
            email:
              typeof item?.email === "string" && item.email.trim().length > 0
                ? item.email.trim()
                : existing?.email ?? null,
            display_name:
              typeof item?.name === "string" && item.name.trim().length > 0
                ? item.name.trim()
                : existing?.display_name ?? null,
            source: Array.from(sources),
            role: "developer",
            hasAccount: false,
          })
        }
        setDetectedMembers(Array.from(memberMap.values()).sort((a, b) => a.github_login.localeCompare(b.github_login)))
      }
    } catch {
      // non-critical — user can still import without member list
    } finally {
      setIsLoadingMembers(false)
    }
  }

  const handleStep1Next = async () => {
    setImportError(null)
    if (importMode === "manual") {
      // Manual mode: import directly (no step 2)
      await handleManualImport()
      return
    }
    if (!selectedRepo) {
      setImportError("Please select a repository")
      return
    }
    // Pre-fill project name from repo
    const repoShortName = selectedRepo.split("/").pop() ?? selectedRepo
    setProjectName(repoShortName)
    // Load members in background (don't block step transition)
    loadRepoMembers(selectedRepo)
    setWizardStep(2)
  }

  const handleManualImport = async () => {
    if (!manualRepoUrl.trim()) {
      setImportError("Please enter a repository URL or owner/repo format")
      return
    }
    let repoFullName = ""
    let repoName = ""
    let repoVisibility: "public" | "private" = "private"
    let repoDefaultBranch = "main"

    if (importMode === "github") {
      if (!selectedRepo) {
        setImportError("Please select a repository from the list")
        return
      }
      repoFullName = selectedRepo
      const ghRepo = githubRepos.find((r) => r.fullName === selectedRepo)
      repoName = ghRepo?.name ?? selectedRepo.split("/").pop() ?? selectedRepo
      repoVisibility = ghRepo?.private ? "private" : "public"
      repoDefaultBranch = ghRepo?.defaultBranch ?? "main"
    } else {
      if (!manualRepoUrl.trim()) {
        setImportError("Please enter a repository URL or owner/repo format")
        return
      }
      // Parse GitHub URL or owner/repo format
      const urlMatch = manualRepoUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?(?:\/|$)/)
      if (urlMatch) {
        repoFullName = urlMatch[1]
      } else if (manualRepoUrl.match(/^[^/]+\/[^/]+$/)) {
        repoFullName = manualRepoUrl.trim()
      } else {
        setImportError("Invalid format. Use 'owner/repo' or a GitHub URL")
        return
      }
      repoName = repoFullName.split("/").pop() ?? repoFullName
    }

    setIsImporting(true)
    try {
      const response = await fetch("/api/dashboard/repositories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: repoName,
          full_name: repoFullName,
          visibility: repoVisibility,
          default_branch: repoDefaultBranch,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const detail = errorData.detail
        const msg =
          typeof detail === "string"
            ? detail
            : extractApiErrorMessage(errorData, "Failed to import repository")
        throw new Error(msg)
      }
      setImportSuccess(`Repository "${repoFullName}" imported successfully!`)
      setTimeout(() => {
        fetchRepositories()
        closeAndReset()
      }, 1500)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import repository")
    } finally {
      setIsImporting(false)
    }
  }

  const handleGithubImport = async () => {
    setImportError(null)
    setIsImporting(true)
    try {
      const memberRoleOverrides = detectedMembers.map((m) => ({
        github_login: m.github_login,
        role: m.role,
      }))
      const response = await fetch("/api/dashboard/github/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: selectedRepo,
          project_name: projectName.trim() || undefined,
          member_role_overrides: memberRoleOverrides,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(errorData, "Import failed"))
      }
      const data = await response.json()
      const invitedCount: number = data.invited_count ?? 0
      setImportSuccess(
        `Repository "${selectedRepo}" imported! ${invitedCount > 0 ? `${invitedCount} invitation(s) sent.` : ""}`,
      )
      setTimeout(() => {
        fetchRepositories()
        closeAndReset()
      }, 2000)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setIsImporting(false)
    }
  }

  const closeAndReset = () => {
    setImportDialogOpen(false)
    setWizardStep(1)
    setSelectedRepo("")
    setManualRepoUrl("")
    setProjectName("")
    setDetectedMembers([])
    setImportError(null)
    setImportSuccess(null)
  }

  const openImportDialog = () => {
    closeAndReset()
    setImportDialogOpen(true)
  }

  const updateMemberRole = (login: string, role: string) => {
    setDetectedMembers((prev) =>
      prev.map((m) => (m.github_login === login ? { ...m, role } : m)),
    )
  }

  const filteredRepos = repositories

  const handleViewRepository = (repo: Repository) => {
    router.push(getRepositoryPath(repo.id))
  }

  const handleCopyCloneUrl = async (repo: Repository) => {
    const cloneUrl = getGitHubCloneUrl(repo.full_name)

    try {
      await copyTextToClipboard(cloneUrl)
      toast.success("Clone URL copied to clipboard")
    } catch (error) {
      console.error("Failed to copy clone URL:", error)
      toast.error("Unable to copy clone URL")
    }
  }

  const handleOpenGitHub = (repo: Repository) => {
    const githubUrl = getGitHubRepositoryUrl(repo.full_name)
    const popup = window.open(githubUrl, "_blank", "noopener,noreferrer")
    if (!popup) {
      toast.error("Unable to open GitHub in a new tab")
    }
  }

  const handleOpenSettings = (repo: Repository) => {
    router.push(getRepositorySettingsPath(repo.id))
  }

  const stats = {
    total: total,
    private: repositories.filter((r) => r.visibility === "private").length,
    public: repositories.filter((r) => r.visibility === "public").length,
    totalFindings: repositories.reduce((acc, r) => acc + r.total_findings, 0),
  }

  // Get unique languages from repositories
  const languages = Array.from(new Set(repositories.map(r => r.language).filter(Boolean))) as string[]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="card-heading text-foreground">Repositories</h1>
          <p className="text-muted-foreground mt-1">
            Browse and manage code repositories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={() => fetchRepositories()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync
          </Button>
          <Button className="gap-2" onClick={openImportDialog}>
            <Plus className="h-4 w-4" />
            Import Repository
          </Button>
        </div>
      </div>

      {/* Import Repository Dialog — 2-step wizard */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) closeAndReset(); else setImportDialogOpen(true) }}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderGit2 className="h-5 w-5" />
              {wizardStep === 1 ? "Import Repository" : "Configure Project"}
            </DialogTitle>
            <DialogDescription>
              {wizardStep === 1
                ? "Select a repository from GitHub or enter manually."
                : `Set up the project for ${selectedRepo}`}
            </DialogDescription>
          </DialogHeader>

          {/* ── Step 1: Select repo ── */}
          {wizardStep === 1 && (
            <div className="space-y-4 py-4">
              {/* Mode toggle */}
              <div className="flex gap-2">
                <Button
                  variant={importMode === "github" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setImportMode("github"); setImportError(null) }}
                  className="flex-1"
                >
                  <Github className="h-4 w-4 mr-2" />
                  From GitHub
                </Button>
                <Button
                  variant={importMode === "manual" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setImportMode("manual"); setImportError(null) }}
                  className="flex-1"
                >
                  <Code2 className="h-4 w-4 mr-2" />
                  Manual Entry
                </Button>
              </div>

              {importMode === "github" ? (
                <div className="space-y-3">
                  {isLoadingGithubRepos ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Loading repositories…</span>
                    </div>
                  ) : !githubConnected ? (
                    <div className="text-center py-6 space-y-3">
                      <Github className="h-12 w-12 mx-auto text-muted-foreground" />
                      <p className="text-muted-foreground">Connect your GitHub account to import repositories</p>
                    </div>
                  ) : githubRepos.length === 0 ? (
                    <div className="text-center py-6">
                      <Code2 className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No repositories found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Select a repository</Label>
                      <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a repository…" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {githubRepos.map((repo) => (
                            <SelectItem key={repo.id} value={repo.fullName}>
                              <div className="flex items-center gap-2">
                                {repo.private ? (
                                  <Lock className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <Unlock className="h-3 w-3 text-muted-foreground" />
                                )}
                                <span>{repo.fullName}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Label htmlFor="manual-repo">Repository URL or owner/repo</Label>
                  <Input
                    id="manual-repo"
                    placeholder="octocat/hello-world or https://github.com/…"
                    value={manualRepoUrl}
                    onChange={(e) => setManualRepoUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter a GitHub repository in &quot;owner/repo&quot; format or paste a URL
                  </p>
                </div>
              )}

              {importError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {importError}
                </div>
              )}
              {importSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 text-[color:var(--green-status)] rounded-md text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  {importSuccess}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Configure project (GitHub mode only) ── */}
          {wizardStep === 2 && (
            <div className="space-y-4 py-4">
              {/* Project name */}
              <div className="space-y-2">
                <Label htmlFor="project-name">Project name</Label>
                <Input
                  id="project-name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Project"
                />
              </div>

              {/* Members */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <Label>Detected members</Label>
                  {isLoadingMembers && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>

                {!isLoadingMembers && detectedMembers.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">
                    No collaborators, org members, or contributors detected — you will be the sole admin.
                  </p>
                )}

                {detectedMembers.length > 0 && (
                  <div className="max-h-[220px] overflow-y-auto space-y-2 rounded-md border p-2">
                    {detectedMembers.map((m) => (
                      <div key={m.github_login} className="flex items-center gap-3 py-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.display_name ?? m.github_login}</p>
                          {m.source.length > 0 && (
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5 truncate">
                              {m.source.join(" / ")}
                            </p>
                          )}
                          {m.email ? (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                              <Mail className="h-3 w-3 shrink-0" />
                              {m.email}
                            </p>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 mt-0.5">
                              Will be invited
                            </Badge>
                          )}
                        </div>
                        <Select
                          value={m.role}
                          onValueChange={(role) => updateMemberRole(m.github_login, role)}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {importError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {importError}
                </div>
              )}
              {importSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 text-[color:var(--green-status)] rounded-md text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  {importSuccess}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {wizardStep === 2 && (
              <Button
                variant="ghost"
                onClick={() => { setWizardStep(1); setImportError(null) }}
                disabled={isImporting}
                className="mr-auto"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button variant="outline" onClick={closeAndReset} disabled={isImporting}>
              Cancel
            </Button>
            {wizardStep === 1 ? (
              <Button
                onClick={handleStep1Next}
                disabled={
                  isImporting ||
                  (importMode === "github" && !selectedRepo) ||
                  (importMode === "manual" && !manualRepoUrl.trim())
                }
              >
                {isImporting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</>
                ) : importMode === "github" ? (
                  "Next"
                ) : (
                  <><Plus className="h-4 w-4 mr-2" />Import</>
                )}
              </Button>
            ) : (
              <Button onClick={handleGithubImport} disabled={isImporting}>
                {isImporting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</>
                ) : (
                  <><Plus className="h-4 w-4 mr-2" />Import Repository</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Repositories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <Skeleton className="h-8 w-12" /> : stats.total}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Private
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <Skeleton className="h-8 w-12" /> : stats.private}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Unlock className="h-3 w-3" />
              Public
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <Skeleton className="h-8 w-12" /> : stats.public}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Total Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <Skeleton className="h-8 w-12" /> : stats.totalFindings}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => fetchRepositories()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sidebar + Table layout */}
      <div className="flex gap-4">
        {/* ── Sidebar ── */}
        <aside className="w-52 flex-shrink-0 rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Filter className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtres</span>
            {(searchQuery || languageFilter !== "all" || visibilityFilter !== "all") && (
              <button
                onClick={() => { setSearchQuery(""); setLanguageFilter("all"); setVisibilityFilter("all"); setPage(1); }}
                className="ml-auto text-[10px] text-muted-foreground hover:text-primary transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {/* Search */}
          <div className="px-3 py-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {/* Code reviews section */}
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
              Code Reviews
            </p>
            {[
              { label: "All Analyses", value: "all", icon: GitBranch },
              { label: "Recent", value: "recent", icon: RefreshCw },
              { label: "Pending Review", value: "pending", icon: AlertCircle },
            ].map((item) => (
              <button
                key={item.value}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              >
                <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                {item.label}
              </button>
            ))}
          </div>

          {/* Visibility */}
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
              Visibilité
            </p>
            {[
              { label: "Tous", value: "all" },
              { label: "Privés", value: "private" },
              { label: "Publics", value: "public" },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => { setVisibilityFilter(item.value); setPage(1); }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-all ${
                  visibilityFilter === item.value
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                  visibilityFilter === item.value ? "bg-primary" : "bg-muted-foreground/30"
                }`} />
                {item.label}
              </button>
            ))}
          </div>

          {/* Language */}
          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
              Langage
            </p>
            <button
              onClick={() => { setLanguageFilter("all"); setPage(1); }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-all ${
                languageFilter === "all"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${languageFilter === "all" ? "bg-primary" : "bg-muted-foreground/30"}`} />
              Tous
            </button>
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => { setLanguageFilter(lang); setPage(1); }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-all ${
                  languageFilter === lang
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                  languageColors[lang] ? languageColors[lang].replace("bg-", "bg-") : "bg-muted-foreground/30"
                }`} />
                {lang}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Main table ── */}
        <div className="flex-1 min-w-0">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Repository</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>CI Status</TableHead>
                    <TableHead>Stats</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <RepositoryRowSkeleton key={i} />
                    ))
                  ) : (
                    filteredRepos.map((repo) => (
                      <RepositoryRow
                        key={repo.id}
                        repo={repo}
                        onViewRepository={handleViewRepository}
                        onCopyCloneUrl={handleCopyCloneUrl}
                        onOpenGitHub={handleOpenGitHub}
                        onOpenSettings={handleOpenSettings}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
              >
                Next
              </Button>
            </div>
          )}

          {!loading && filteredRepos.length === 0 && !error && (
            <Card className="mt-4 py-12">
              <CardContent className="text-center">
                <Code2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No repositories found</h3>
                <p className="text-muted-foreground mt-1">
                  {searchQuery || languageFilter !== "all" || visibilityFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Run an analysis to see repositories here"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>{/* end main table div */}
      </div>{/* end sidebar+table flex */}
    </div>
  )
}
