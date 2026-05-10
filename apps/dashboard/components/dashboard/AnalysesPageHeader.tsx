"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { useUser, useClerk } from "@clerk/nextjs"
import {
  Plus,
  Filter,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Archive,
  Folder,
  RefreshCw,
  Loader2,
  FileCode,
  Zap,
  User,
  Building,
  ExternalLink,
} from "lucide-react"
import { Github } from "@/components/ui/social-icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AnalysisPipeline } from "./AnalysisPipeline"
import {
  fetchGithubRepos,
  type GithubRepoOption,
} from "@/lib/github-repos"

interface AnalysesPageHeaderProps {
  filter?: string | null
  status?: string | null
  view?: string | null
  action?: string | null
  period?: string | null
  /** When true, renders only the "+ Nouvelle analyse" dialog trigger */
  buttonOnly?: boolean
}

const filterLabels: Record<string, { title: string; description: string; icon: React.ElementType }> = {
  today: {
    title: "Today's Analyses",
    description: "Code reviews from the last 24 hours",
    icon: Calendar,
  },
  week: {
    title: "This Week",
    description: "Code reviews from the past 7 days",
    icon: Clock,
  },
  pending: {
    title: "Pending Review",
    description: "Analyses awaiting human review",
    icon: AlertTriangle,
  },
  archived: {
    title: "Archived",
    description: "Completed and archived analyses",
    icon: Archive,
  },
}

const periodLabels: Record<string, { title: string; description: string }> = {
  "24h": {
    title: "Last 24 Hours",
    description: "Recent analyses from the past day",
  },
  "week": {
    title: "This Week",
    description: "Analyses from the past 7 days",
  },
  "month": {
    title: "This Month",
    description: "Analyses from the past 30 days",
  },
}

const statusLabels: Record<string, { title: string; description: string; icon: React.ElementType }> = {
  in_progress: {
    title: "In Progress",
    description: "Analyses currently being processed",
    icon: RefreshCw,
  },
  completed: {
    title: "Completed",
    description: "Successfully completed analyses",
    icon: CheckCircle2,
  },
  attention: {
    title: "Needs Attention",
    description: "Analyses requiring immediate action",
    icon: AlertTriangle,
  },
}

export function AnalysesPageHeader({ filter, status, view, action, period, buttonOnly }: AnalysesPageHeaderProps) {
  const router = useRouter()
  const { user } = useUser()
  const { openSignIn, openUserProfile } = useClerk()
  
  const [isNewAnalysisOpen, setIsNewAnalysisOpen] = useState(action === "new")
  const [repoInput, setRepoInput] = useState("")
  const [prNumberInput, setPrNumberInput] = useState("")
  const [analysisType, setAnalysisType] = useState<"full" | "quick">("full")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [startedAnalysisId, setStartedAnalysisId] = useState<string | null>(null)
  const [existingAnalysisId, setExistingAnalysisId] = useState<string | null>(null)
  
  // GitHub repos state
  const [githubRepos, setGithubRepos] = useState<GithubRepoOption[]>([])
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null)
  const [githubTokenAvailable, setGithubTokenAvailable] = useState<boolean | null>(null)
  const [githubNote, setGithubNote] = useState<string | null>(null)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [selectedGithubRepo, setSelectedGithubRepo] = useState("")
  const [inputMode, setInputMode] = useState<"github" | "manual">("github")
  const [customGithubAccount, setCustomGithubAccount] = useState("")
  const [accountType, setAccountType] = useState<"user" | "org">("user")
  const [projects, setProjects] = useState<Array<{ id: string; name: string; repo: string }>>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)

  const loadProjects = async () => {
    setIsLoadingProjects(true)
    try {
      // Use the Next.js proxy route so Clerk auth headers are included automatically.
      const res = await fetch("/api/dashboard/projects?page=1&limit=100", {
        headers: { Accept: "application/json" },
      })
      if (!res.ok) {
        setProjects([])
        return
      }
      let data: Record<string, unknown>
      try {
        data = await res.json()
      } catch {
        setProjects([])
        return
      }
      const items = (data.items || data || []) as Array<Record<string, unknown>>
      const normalized = items
        .map((p) => ({
          id: String(p.id ?? p.project_id ?? p.repo_id ?? ""),
          name: String(p.name ?? p.project_name ?? p.repo_id ?? p.id ?? ""),
          repo: String(p.repo ?? p.full_name ?? p.repo_id ?? ""),
        }))
        .filter((p) => p.id.length > 0)
      setProjects(normalized)
      // Clear selectedProjectId if it's no longer in the list, then set default if available
      if (selectedProjectId && !normalized.find(p => p.id === selectedProjectId)) {
        setSelectedProjectId("")
      }
      if (normalized.length > 0 && !selectedProjectId) {
        setSelectedProjectId(normalized[0].id)
      }
    } catch {
      setProjects([])
    } finally {
      setIsLoadingProjects(false)
    }
  }

  const loadGithubRepos = async (account?: string) => {
    setIsLoadingRepos(true)
    setGithubError(null)
    try {
      const data = await fetchGithubRepos({
        account,
        accountType,
      })
      setGithubConnected(data.connected)
      setGithubTokenAvailable(data.tokenAvailable ?? null)
      setGithubNote(data.note ?? null)
      setGithubRepos(data.items)
      setGithubError(data.error && data.error.trim().length > 0 ? data.error : null)
    } catch {
      setGithubConnected(false)
      setGithubTokenAvailable(null)
      setGithubNote(null)
      setGithubError("Network error while fetching repositories")
    } finally {
      setIsLoadingRepos(false)
    }
  }

  // Load GitHub repos when dialog opens
  useEffect(() => {
    if (!isNewAnalysisOpen) return
    loadGithubRepos()
    loadProjects()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewAnalysisOpen])

  let title = "All Analyses"
  let description = "View and manage all code review analyses"
  let Icon: React.ElementType = Filter

  if (period && periodLabels[period]) {
    title = periodLabels[period].title
    description = periodLabels[period].description
    Icon = Calendar
  } else if (filter && filterLabels[filter]) {
    title = filterLabels[filter].title
    description = filterLabels[filter].description
    Icon = filterLabels[filter].icon
  } else if (status && statusLabels[status]) {
    title = statusLabels[status].title
    description = statusLabels[status].description
    Icon = statusLabels[status].icon
  } else if (view === "projects") {
    title = "By Project"
    description = "Analyses organized by project"
    Icon = Folder
  }

  const parseGitHubUrl = (url: string): { owner: string; repo: string; prNumber?: number } | null => {
    // Handle PR URL: https://github.com/owner/repo/pull/123
    const prMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
    if (prMatch) {
      return { owner: prMatch[1], repo: prMatch[2], prNumber: parseInt(prMatch[3]) }
    }
    
    // Handle repo URL: https://github.com/owner/repo
    const repoMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/)
    if (repoMatch) {
      return { owner: repoMatch[1], repo: repoMatch[2] }
    }
    
    // Handle owner/repo format
    const simpleMatch = url.match(/^([^/]+)\/([^/]+)$/)
    if (simpleMatch) {
      return { owner: simpleMatch[1], repo: simpleMatch[2] }
    }
    
    return null
  }

  const asObject = (value: unknown): Record<string, unknown> | null => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null
    }
    return value as Record<string, unknown>
  }

  const asString = (value: unknown): string | null => {
    if (typeof value !== "string") {
      return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  const extractApiErrorInfo = (payload: Record<string, unknown>): { message: string | null; existingId: string | null } => {
    const payloadDetails = asObject(payload.details)
    const backendResponse = asObject(payload.backend_response)
    const nestedError = backendResponse ? asObject(backendResponse.error) : null
    const nestedDetails =
      payloadDetails ?? asObject(backendResponse?.details) ?? (nestedError ? asObject(nestedError.details) : null)

    const existingIdRaw = nestedDetails?.existing_id ?? payload.existing_id
    const existingId = asString(existingIdRaw)

    const message =
      asString(payload.message) ??
      asString(payload.error) ??
      asString(payload.detail) ??
      (nestedError ? asString(nestedError.message) : null) ??
      (nestedError ? asString(nestedError.detail) : null) ??
      (backendResponse ? asString(backendResponse.message) : null) ??
      (backendResponse ? asString(backendResponse.detail) : null)

    return { message, existingId }
  }

  const handleStartAnalysis = async () => {
    setSubmitError(null)
    setSubmitSuccess(null)
    setExistingAnalysisId(null)

    if (!selectedProjectId) {
      setSubmitError("Sélectionnez un projet: une analyse doit être liée à un projet existant.")
      return
    }

    // Additional validation: ensure selectedProjectId exists in current projects list
    const selectedProject = projects.find(p => p.id === selectedProjectId)
    if (!selectedProject) {
      setSubmitError("Projet sélectionné invalide. Rechargez la page et sélectionnez un projet valide.")
      return
    }

    let repoFullName = ""
    let prNumber: number | null = null
    
    if (inputMode === "github") {
      if (!selectedGithubRepo) {
        setSubmitError("Please select a repository")
        return
      }
      repoFullName = selectedGithubRepo
      if (prNumberInput.trim()) {
        const num = parseInt(prNumberInput.trim())
        if (isNaN(num) || num < 1) {
          setSubmitError("PR number must be a positive integer")
          return
        }
        prNumber = num
      }
    } else {
      if (!repoInput.trim()) {
        setSubmitError("Please enter a repository URL or owner/repo")
        return
      }
      
      const parsed = parseGitHubUrl(repoInput.trim())
      if (!parsed) {
        setSubmitError("Invalid format. Use owner/repo or a GitHub URL")
        return
      }
      
      repoFullName = `${parsed.owner}/${parsed.repo}`
      prNumber = parsed.prNumber ?? null
      
      if (!prNumber && prNumberInput.trim()) {
        const num = parseInt(prNumberInput.trim())
        if (isNaN(num) || num < 1) {
          setSubmitError("PR number must be a positive integer")
          return
        }
        prNumber = num
      }
    }

    setIsSubmitting(true)
    
    try {
      const response = await fetch("/api/dashboard/analyses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          repo: repoFullName,
          project_id: selectedProjectId,
          pr_number: prNumber,
          commit_sha: null,
          diff_text: null,
          metadata: {
            triggered_from: "analyses_page",
            analysis_type: analysisType,
            repo_selected_from_github: inputMode === "github",
          },
        }),
      })

      let data: Record<string, unknown> = {}
      try {
        const parsed = await response.json()
        data = asObject(parsed) ?? {}
      } catch {
        // Response was not JSON (e.g. HTML error page)
        throw new Error(`Server error (HTTP ${response.status})`)
      }

      if (!response.ok) {
        const errorInfo = extractApiErrorInfo(data)

        // Handle 409 Conflict (duplicate analysis) specially
        if (response.status === 409) {
          if (errorInfo.existingId) {
            setExistingAnalysisId(errorInfo.existingId)
          }
          setSubmitError(errorInfo.message ?? "An identical analysis already exists for this repository and context.")
          return
        }

        throw new Error(errorInfo.message ?? "Failed to start analysis")
      }

      const analysisId =
        typeof data.analysis_id === "string"
          ? data.analysis_id
          : typeof data.id === "string"
            ? data.id
            : null
      setStartedAnalysisId(analysisId)
      setSubmitSuccess(`Analysis started! ID: ${analysisId || "pending"}`)
      
      // Close dialog and refresh after longer delay to show pipeline progress
      setTimeout(() => {
        setIsNewAnalysisOpen(false)
        resetForm()
        router.refresh()
      }, 5000)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to start analysis")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGithubConnect = () => {
    // Ouvrir le profil utilisateur pour connecter GitHub
    openUserProfile()
  }

  const handleLoadCustomAccount = () => {
    if (customGithubAccount.trim()) {
      loadGithubRepos(customGithubAccount.trim())
    }
  }

  const handleOpenExistingAnalysis = () => {
    if (existingAnalysisId) {
      router.push(`/dashboard/report/${existingAnalysisId}`)
      setIsNewAnalysisOpen(false)
      resetForm()
    }
  }

  const resetForm = () => {
    setRepoInput("")
    setPrNumberInput("")
    setSelectedGithubRepo("")
    setCustomGithubAccount("")
    setAccountType("user")
    setAnalysisType("full")
    setSubmitError(null)
    setSubmitSuccess(null)
    setStartedAnalysisId(null)
    setExistingAnalysisId(null)
    setInputMode("github")
    setGithubError(null)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={buttonOnly ? "" : "flex flex-col gap-4 md:flex-row md:items-center md:justify-between"}
    >
      {!buttonOnly && (
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="card-heading text-foreground">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {!buttonOnly && (filter || status || view || period) && (
          <Badge variant="secondary" className="text-sm">
            {period || filter || status || view}
          </Badge>
        )}

        <Dialog open={isNewAnalysisOpen} onOpenChange={(open) => {
          setIsNewAnalysisOpen(open)
          if (!open) resetForm()
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-[#E8713A] hover:bg-[#E8713A]/90 text-white">
              <Plus className="h-4 w-4" />
              + Nouvelle analyse
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                Start New Analysis
              </DialogTitle>
              <DialogDescription>
                Enter the repository URL or PR link to begin a new code review analysis.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Project Selection (required) */}
              <div className="space-y-2">
                <Label htmlFor="analysis-project">Projet *</Label>
                <Select
                  value={selectedProjectId}
                  onValueChange={setSelectedProjectId}
                  disabled={isLoadingProjects || projects.length === 0}
                >
                  <SelectTrigger id="analysis-project">
                    <SelectValue
                      placeholder={
                        isLoadingProjects
                          ? "Chargement des projets..."
                          : projects.length === 0
                            ? "Aucun projet - importez d'abord un repo"
                            : "Selectionnez un projet..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.repo && p.repo !== p.name ? ` (${p.repo})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isLoadingProjects && projects.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Une analyse doit être liée à un projet. Importez un repository depuis GitHub pour créer un projet.
                    </p>
                )}
              </div>

              {/* Input Mode Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={inputMode === "github" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInputMode("github")}
                  className="flex-1"
                >
                  <Github className="h-4 w-4 mr-2" />
                  From GitHub
                </Button>
                <Button
                  variant={inputMode === "manual" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInputMode("manual")}
                  className="flex-1"
                >
                  <FileCode className="h-4 w-4 mr-2" />
                  Manual Entry
                </Button>
              </div>

              {inputMode === "github" ? (
                <div className="space-y-3">
                  {isLoadingRepos ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Loading repositories...</span>
                    </div>
                  ) : githubConnected === false ? (
                    <div className="text-center py-6 space-y-3">
                      <Github className="h-12 w-12 mx-auto text-muted-foreground" />
                      <p className="text-muted-foreground">
                        Connect your GitHub account to select repositories
                      </p>
                      <Button variant="outline" onClick={handleGithubConnect}>
                        Connect GitHub Account
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Custom Account Selector */}
                      <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={accountType === "user" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setAccountType("user")}
                            className="flex-1"
                          >
                            <User className="h-4 w-4 mr-2" />
                            User
                          </Button>
                          <Button
                            type="button"
                            variant={accountType === "org" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setAccountType("org")}
                            className="flex-1"
                          >
                            <Building className="h-4 w-4 mr-2" />
                            Organization
                          </Button>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="custom-account">GitHub Account</Label>
                          <div className="flex gap-2">
                            <Input
                              id="custom-account"
                              placeholder={accountType === "user" ? "e.g., octocat" : "e.g., github"}
                              value={customGithubAccount}
                              onChange={(e) => setCustomGithubAccount(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleLoadCustomAccount()}
                            />
                            <Button 
                              type="button" 
                              variant="outline" 
                              onClick={handleLoadCustomAccount}
                              disabled={!customGithubAccount.trim() || isLoadingRepos}
                            >
                              Load
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Enter a GitHub {accountType === "user" ? "username" : "organization name"} to load their repositories
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Select Repository</Label>
                        <Select value={selectedGithubRepo} onValueChange={setSelectedGithubRepo}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a repository..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {githubRepos.map((repo) => (
                              <SelectItem key={repo.id} value={repo.fullName}>
                                {repo.fullName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {githubRepos.length === 0 && customGithubAccount && !githubError && (
                          <p className="text-xs text-muted-foreground">
                            No repositories found for {customGithubAccount}
                          </p>
                        )}
                      </div>
                      
                      {/* GitHub API Error Display */}
                      {githubError && (
                        <div className="flex items-start gap-2 p-3 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-md text-sm border border-amber-500/20">
                          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <div className="space-y-1">
                            <p>{githubError}</p>
                            {githubError.toLowerCase().includes("rate limit") && (
                              <Button 
                                variant="link" 
                                size="sm" 
                                className="h-auto p-0 text-amber-700 dark:text-amber-400 underline"
                                onClick={handleGithubConnect}
                              >
                                Connect GitHub to increase rate limit
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                      {githubConnected === true && githubTokenAvailable === false && !githubError && (
                        <div className="flex items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-100">
                          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-400" />
                          <div className="space-y-1">
                            <p className="font-medium text-orange-200">GitHub OAuth manquant</p>
                            <p className="text-orange-100/80">
                              {githubNote ||
                                "Connexion détectée, mais aucun token OAuth n'est disponible. Seuls les repos publics sont chargés et GitHub peut limiter les requêtes."}
                            </p>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-orange-200 underline"
                              onClick={handleGithubConnect}
                            >
                              Connect GitHub OAuth
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <Label htmlFor="pr-number">PR Number (Optional)</Label>
                        <Input
                          id="pr-number"
                          type="number"
                          min="1"
                          placeholder="e.g., 123"
                          value={prNumberInput}
                          onChange={(e) => setPrNumberInput(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Leave empty to analyze the latest commit on default branch
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="repo-url">Repository / PR URL</Label>
                    <Input
                      id="repo-url"
                      placeholder="https://github.com/org/repo/pull/123 or owner/repo"
                      value={repoInput}
                      onChange={(e) => setRepoInput(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter a GitHub URL or &quot;owner/repo&quot; format
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pr-number-manual">PR Number (Optional)</Label>
                    <Input
                      id="pr-number-manual"
                      type="number"
                      min="1"
                      placeholder="e.g., 123"
                      value={prNumberInput}
                      onChange={(e) => setPrNumberInput(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Analysis Type */}
              <div className="space-y-2">
                <Label>Analysis Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    type="button"
                    variant={analysisType === "full" ? "default" : "outline"} 
                    className="justify-start"
                    onClick={() => setAnalysisType("full")}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                    Full Review
                  </Button>
                  <Button 
                    type="button"
                    variant={analysisType === "quick" ? "default" : "outline"} 
                    className="justify-start"
                    onClick={() => setAnalysisType("quick")}
                  >
                    <Zap className="h-4 w-4 mr-2 text-yellow-500" />
                    Quick Scan
                  </Button>
                </div>
              </div>

              {/* Error/Success Messages */}
              {submitError && (
                <div className="flex items-start gap-3 p-3 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-md text-sm border border-amber-500/20">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <p>{submitError}</p>
                    {existingAnalysisId && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleOpenExistingAnalysis}
                        className="bg-white hover:bg-gray-50 text-amber-700 border-amber-500"
                      >
                        <ExternalLink className="h-3 w-3 mr-2" />
                        Open existing analysis
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {submitSuccess && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-green-500/10 text-[color:var(--green-status)] rounded-md text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    {submitSuccess}
                  </div>
                  {/* Analysis Pipeline Progress */}
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-3 text-center">
                      Pipeline Progress - Real-time status
                    </p>
                    <AnalysisPipeline 
                      analysisId={startedAnalysisId || undefined}
                      analysisStatus="queued"
                      compact
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              {startedAnalysisId ? (
                <Button onClick={() => { setIsNewAnalysisOpen(false); resetForm(); router.refresh(); }}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  View in Timeline
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setIsNewAnalysisOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleStartAnalysis} 
                    disabled={isSubmitting || (inputMode === "github" ? !selectedGithubRepo : !repoInput.trim())}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Start Analysis
                      </>
                    )}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  )
}
