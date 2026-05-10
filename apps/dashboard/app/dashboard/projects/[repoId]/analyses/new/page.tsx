"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Loader2,
  Play,
  ShieldCheck,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { normalizeRepositoryId } from "@/lib/repository-links"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"

type ProjectBranch = {
  name: string
  is_default: boolean
}

type ProjectDetails = {
  id: string
  name: string
  full_name: string
  default_branch?: string | null
  branches?: ProjectBranch[]
}

type RepositoryItem = {
  id: string
  full_name: string
  default_branch: string | null
}

type BranchItem = {
  branch_name: string
  last_commit_sha: string | null
}

type MemberItem = {
  user_id: string
  user_email?: string | null
  user_display_name?: string | null
  role_code: string
}

type AnalysisCreateResponse = {
  analysis_id?: string
}

const ANALYSIS_TYPES = [
  { value: "static_quality_security", label: "Analyse statique (qualite + securite)" },
  { value: "security_focus", label: "Securite prioritaire" },
  { value: "performance_focus", label: "Performance" },
  { value: "compliance_review", label: "Conformite" },
] as const

const RULESETS = [
  { value: "security_recommended_v2_4_0", label: "Securite - Recommande (v2.4.0)" },
  { value: "quality_strict_v1_8_0", label: "Qualite - Strict (v1.8.0)" },
  { value: "balanced_default_v1_0_0", label: "Equilibre - Defaut (v1.0.0)" },
] as const

function normalizeBranches(
  backendBranches: BranchItem[],
  projectDetails: ProjectDetails,
): Array<{ name: string; commitSha: string | null }> {
  if (backendBranches.length > 0) {
    return backendBranches.map((branch) => ({
      name: branch.branch_name,
      commitSha: branch.last_commit_sha ?? null,
    }))
  }

  const projectBranchList = Array.isArray(projectDetails.branches) ? projectDetails.branches : []
  if (projectBranchList.length > 0) {
    return projectBranchList.map((branch) => ({
      name: branch.name,
      commitSha: null,
    }))
  }

  const fallbackDefault = projectDetails.default_branch?.trim() || "main"
  return [{ name: fallbackDefault, commitSha: null }]
}

export default function ProjectNewAnalysisPage() {
  const params = useParams() as { repoId?: string | string[] }
  const router = useRouter()
  const resourceId = normalizeRepositoryId(
    Array.isArray(params.repoId) ? params.repoId[0] ?? "" : params.repoId ?? "",
  )

  const [project, setProject] = useState<ProjectDetails | null>(null)
  const [repositories, setRepositories] = useState<RepositoryItem[]>([])
  const [members, setMembers] = useState<MemberItem[]>([])
  const [branches, setBranches] = useState<Array<{ name: string; commitSha: string | null }>>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedRepo, setSelectedRepo] = useState("")
  const [selectedBranch, setSelectedBranch] = useState("")
  const [analysisType, setAnalysisType] = useState<string>(ANALYSIS_TYPES[0].value)
  const [analysisName, setAnalysisName] = useState("")
  const [ruleset, setRuleset] = useState<string>(RULESETS[0].value)
  const [notes, setNotes] = useState("")
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([])

  const selectedBranchDetails = useMemo(
    () => branches.find((branch) => branch.name === selectedBranch) ?? null,
    [branches, selectedBranch],
  )

  const selectedReviewerObjects = useMemo(
    () => members.filter((member) => selectedReviewers.includes(member.user_id)),
    [members, selectedReviewers],
  )

  const loadBranches = useCallback(
    async (repoFullName: string, projectDetails: ProjectDetails) => {
      try {
        const branchResponse = await fetch(
          `/api/dashboard/branches?repo_id=${encodeURIComponent(repoFullName)}&limit=100`,
          { cache: "no-store" },
        )
        const branchPayload = await branchResponse.json().catch(() => ({}))
        const backendBranches = Array.isArray(branchPayload?.branches)
          ? (branchPayload.branches as BranchItem[])
          : []
        const normalized = normalizeBranches(backendBranches, projectDetails)
        setBranches(normalized)
        if (normalized.length > 0) {
          setSelectedBranch((current) => {
            if (current && normalized.some((branch) => branch.name === current)) {
              return current
            }
            return normalized[0].name
          })
        }
      } catch {
        const fallback = normalizeBranches([], projectDetails)
        setBranches(fallback)
        setSelectedBranch(fallback[0]?.name ?? "main")
      }
    },
    [],
  )

  const loadInitialData = useCallback(async () => {
    if (!resourceId) {
      setError("Project identifier is missing")
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [projectRes, reposRes, membersRes] = await Promise.all([
        fetch(`/api/dashboard/projects/${encodeURIComponent(resourceId)}`, { cache: "no-store" }),
        fetch("/api/dashboard/repositories?limit=200", { cache: "no-store" }),
        fetch(`/api/dashboard/projects/${encodeURIComponent(resourceId)}/members`, { cache: "no-store" }),
      ])

      if (!projectRes.ok) {
        throw new Error("Failed to load project details")
      }

      const projectPayload = (await projectRes.json()) as ProjectDetails
      setProject(projectPayload)

      const repoPayload = await reposRes.json().catch(() => ({}))
      const repoItems = Array.isArray(repoPayload?.items)
        ? (repoPayload.items as RepositoryItem[])
        : []

      const ownerPrefix = projectPayload.full_name.split("/")[0]
      const ownerRepositories = repoItems.filter((repo) =>
        repo.full_name.toLowerCase().startsWith(`${ownerPrefix.toLowerCase()}/`),
      )
      const defaultRepoItems = ownerRepositories.length > 0 ? ownerRepositories : repoItems

      const hasProjectRepo = defaultRepoItems.some(
        (repo) => repo.full_name.toLowerCase() === projectPayload.full_name.toLowerCase(),
      )
      const normalizedRepos = hasProjectRepo
        ? defaultRepoItems
        : [
            {
              id: projectPayload.id,
              full_name: projectPayload.full_name,
              default_branch: projectPayload.default_branch ?? "main",
            },
            ...defaultRepoItems,
          ]

      setRepositories(normalizedRepos)

      const initialRepo =
        normalizedRepos.find(
          (repo) => repo.full_name.toLowerCase() === projectPayload.full_name.toLowerCase(),
        )?.full_name ??
        normalizedRepos[0]?.full_name ??
        projectPayload.full_name

      setSelectedRepo(initialRepo)
      setAnalysisName(`Analyse ${projectPayload.name}`)

      if (membersRes.ok) {
        const membersPayload = await membersRes.json().catch(() => ({}))
        const memberItems = Array.isArray(membersPayload?.members)
          ? (membersPayload.members as MemberItem[])
          : []
        setMembers(memberItems)
      } else {
        setMembers([])
      }

      await loadBranches(initialRepo, projectPayload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis form")
    } finally {
      setLoading(false)
    }
  }, [loadBranches, resourceId])

  useEffect(() => {
    void loadInitialData()
  }, [loadInitialData])

  useEffect(() => {
    if (!project || !selectedRepo) return
    void loadBranches(selectedRepo, project)
  }, [loadBranches, project, selectedRepo])

  const toggleReviewer = (userId: string, checked: boolean) => {
    setSelectedReviewers((current) => {
      if (checked) {
        if (current.includes(userId)) return current
        return [...current, userId]
      }
      return current.filter((id) => id !== userId)
    })
  }

  const handleLaunchAnalysis = async () => {
    if (!project) {
      toast.error("Project not loaded")
      return
    }
    if (!selectedRepo) {
      toast.error("Selectionnez un depot")
      return
    }
    if (!selectedBranch) {
      toast.error("Selectionnez une branche")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/dashboard/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: selectedRepo,
          project_id: project.id,
          commit_sha: selectedBranchDetails?.commitSha ?? undefined,
          metadata: {
            analysis_input_mode: "github_remote",
            repo_selected_from_github: true,
            analysis_name: analysisName.trim() || null,
            analysis_type: analysisType,
            ruleset,
            branch_name: selectedBranch,
            reviewer_ids: selectedReviewers,
            reviewer_emails: selectedReviewerObjects.map((reviewer) => reviewer.user_email).filter(Boolean),
            notes: notes.trim() || null,
          },
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as AnalysisCreateResponse & {
        error?: string
        message?: string
      }

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Failed to create analysis")
      }

      toast.success("Analyse lancee avec succes")
      if (payload.analysis_id) {
        router.push(`/dashboard/analyses/${encodeURIComponent(payload.analysis_id)}`)
      } else {
        router.push(`/dashboard/projects/${encodeURIComponent(project.id)}/analyses`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Creation failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="text-muted-foreground">Chargement du formulaire...</span>
      </div>
    )
  }

  if (!project || error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-8">
          <p className="text-destructive">{error || "Project not found"}</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => router.push("/dashboard/projects")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour projets
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/dashboard/projects/${encodeURIComponent(project.id)}/analyses`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Analyses du projet
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">Nouvelle analyse</h1>
          <p className="text-sm text-muted-foreground">
            Projet: <span className="font-medium text-foreground">{project.name}</span> ({project.full_name})
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              Configuration
            </CardTitle>
            <CardDescription>
              Cette analyse sera creee dans le contexte du projet selectionne.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Projet</Label>
              <Input value={project.name} disabled />
            </div>

            <div className="space-y-2">
              <Label>Depot</Label>
              <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                <SelectTrigger>
                  <SelectValue placeholder="Selectionnez un depot" />
                </SelectTrigger>
                <SelectContent>
                  {repositories.map((repo) => (
                    <SelectItem key={repo.full_name} value={repo.full_name}>
                      {repo.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Branche</Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger>
                  <SelectValue placeholder="Selectionnez une branche" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type d'analyse</Label>
              <Select value={analysisType} onValueChange={setAnalysisType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANALYSIS_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nom de l'analyse</Label>
              <Input
                value={analysisName}
                onChange={(event) => setAnalysisName(event.target.value)}
                placeholder="Ex: Analyse securite develop"
              />
            </div>

            <div className="space-y-2">
              <Label>Jeu de regles</Label>
              <Select value={ruleset} onValueChange={setRuleset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULESETS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Relecteurs (optionnel)</Label>
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-3">
                {members.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun collaborateur disponible.</p>
                )}
                {members.map((member) => {
                  const checked = selectedReviewers.includes(member.user_id)
                  const label = member.user_display_name || member.user_email || member.user_id
                  return (
                    <label key={member.user_id} className="flex cursor-pointer items-center gap-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleReviewer(member.user_id, value === true)}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{member.role_code}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Contexte supplementaire pour cette analyse"
                rows={4}
                maxLength={500}
              />
              <p className="text-right text-xs text-muted-foreground">{notes.length}/500</p>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={handleLaunchAnalysis} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Lancer l'analyse
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/projects/${encodeURIComponent(project.id)}/analyses`)}
              >
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recapitulatif</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Projet</span>
                <span className="font-medium">{project.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Depot</span>
                <span className="font-medium">{selectedRepo || "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Branche</span>
                <span className="font-medium">{selectedBranch || "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">
                  {ANALYSIS_TYPES.find((item) => item.value === analysisType)?.label || analysisType}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Regles</span>
                <span className="font-medium">
                  {RULESETS.find((item) => item.value === ruleset)?.label || ruleset}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-4 w-4 text-blue-600" />
                Relecteurs selectionnes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedReviewerObjects.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun relecteur selectionne.</p>
              )}
              {selectedReviewerObjects.map((reviewer) => (
                <div key={reviewer.user_id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="truncate text-sm">
                    {reviewer.user_display_name || reviewer.user_email || reviewer.user_id}
                  </span>
                  <Badge variant="secondary">{reviewer.role_code}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <GitBranch className="h-4 w-4 text-blue-600" />
                Contexte branche
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Branche:</span>{" "}
                <span className="font-medium">{selectedBranch || "-"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Commit:</span>{" "}
                <span className="font-mono text-xs">
                  {selectedBranchDetails?.commitSha ? selectedBranchDetails.commitSha.slice(0, 12) : "auto"}
                </span>
              </p>
              <p className="flex items-center gap-2 text-[color:var(--green-status)]">
                <CheckCircle2 className="h-4 w-4" />
                Diff GitHub resolu automatiquement cote backend.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
