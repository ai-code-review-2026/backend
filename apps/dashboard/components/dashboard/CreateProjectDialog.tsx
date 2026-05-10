"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, GitBranch, Users, Settings, FolderGit, Building2, User } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MembersPreviewDialog, type ImportMemberConfig } from "./MembersPreviewDialog"
import { PermissionValidationDialog } from "./PermissionValidationDialog"
import { auditService } from "@/lib/audit-service"
import { type PermissionValidationResult } from "@/lib/github-permissions"
import { fetchGithubRepos } from "@/lib/github-repos"
import { toast } from "sonner"

// Types
interface Team {
  id: string
  name: string
  slug: string | null
}

interface GithubRepo {
  id: string
  fullName: string
  name: string
  description: string | null
  language: string | null
  defaultBranch: string
  isPrivate: boolean
}

interface GithubOrganization {
  id: number
  login: string
  avatarUrl: string | null
  description: string | null
}

interface GithubUserInfo {
  login: string
  avatarUrl: string | null
}

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (projectId: string) => void
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateProjectDialogProps) {
  const router = useRouter()
  
  // Form state
  const [name, setName] = useState("")
  const [fullName, setFullName] = useState("")
  const [description, setDescription] = useState("")
  const [language, setLanguage] = useState("")
  const [visibility, setVisibility] = useState<"public" | "private" | "internal">("private")
  const [defaultBranch, setDefaultBranch] = useState("main")
  const [teamId, setTeamId] = useState<string>("")
  const [autoAnalysis, setAutoAnalysis] = useState(true)
  
  // GitHub repos
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([])
  const [selectedGithubRepo, setSelectedGithubRepo] = useState<string>("")
  const [loadingGithubRepos, setLoadingGithubRepos] = useState(false)
  
  // GitHub organizations
  const [organizations, setOrganizations] = useState<GithubOrganization[]>([])
  const [githubUser, setGithubUser] = useState<GithubUserInfo | null>(null)
  const [selectedOrg, setSelectedOrg] = useState<string>("") // "" means not selected, "personal" for user's repos
  const [loadingOrgs, setLoadingOrgs] = useState(false)
  
  // Teams
  const [teams, setTeams] = useState<Team[]>([])
  const [loadingTeams, setLoadingTeams] = useState(false)
  
  // Members preview
  const [showMembersPreview, setShowMembersPreview] = useState(false)
  const [pendingImportData, setPendingImportData] = useState<any>(null)
  
  // Permission validation
  const [showPermissionValidation, setShowPermissionValidation] = useState(false)
  const [validationResult, setValidationResult] = useState<PermissionValidationResult | null>(null)
  
  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Active tab
  const [activeTab, setActiveTab] = useState("basic")

  // Load GitHub organizations when dialog opens
  useEffect(() => {
    if (open) {
      loadOrganizations()
      loadTeams()
    }
  }, [open])

  // Load repos when organization is selected
  useEffect(() => {
    if (selectedOrg) {
      loadGithubRepos(selectedOrg)
      setSelectedGithubRepo("") // Reset repo selection when org changes
    } else {
      setGithubRepos([])
    }
  }, [selectedOrg])

  // Update form when GitHub repo is selected
  useEffect(() => {
    if (selectedGithubRepo && selectedGithubRepo !== "") {
      const repo = githubRepos.find((r) => r.fullName === selectedGithubRepo)
      if (repo) {
        setName(repo.name)
        setFullName(repo.fullName)
        setDescription(repo.description || "")
        setLanguage(repo.language || "")
        setDefaultBranch(repo.defaultBranch)
        setVisibility(repo.isPrivate ? "private" : "public")
      }
    }
  }, [selectedGithubRepo, githubRepos])

  const loadOrganizations = async () => {
    setLoadingOrgs(true)
    try {
      const response = await fetch("/api/dashboard/github/organizations", {
        headers: { "Content-Type": "application/json" },
      })
      if (response.ok) {
        const data = await response.json()
        setOrganizations(data.organizations || [])
        setGithubUser(data.user || null)
      } else {
        console.warn("Failed to load GitHub organizations:", response.status, response.statusText)
        setOrganizations([])
        setGithubUser(null)
      }
    } catch (err) {
      console.warn("Failed to load GitHub organizations:", err)
      setOrganizations([])
      setGithubUser(null)
    } finally {
      setLoadingOrgs(false)
    }
  }

  const loadGithubRepos = async (orgLogin: string) => {
    setLoadingGithubRepos(true)
    try {
      const data = await fetchGithubRepos({
        account: orgLogin === "personal" ? githubUser?.login : orgLogin,
        accountType: orgLogin === "personal" ? "user" : "org",
      })
      const items: GithubRepo[] = data.items.map((r) => ({
        id: String(r.id ?? ""),
        fullName: r.fullName ?? "",
        name: r.name ?? "",
        description: r.description ?? null,
        language: r.language ?? null,
        defaultBranch: r.defaultBranch ?? "main",
        isPrivate: r.private === true,
      }))
      setGithubRepos(items)
      if (data.error) {
        console.warn("Failed to load GitHub repos:", data.error)
      }
    } catch (err) {
      console.warn("Failed to load GitHub repos:", err)
      setGithubRepos([]) // Set empty array on error
    } finally {
      setLoadingGithubRepos(false)
    }
  }

  const loadTeams = async () => {
    setLoadingTeams(true)
    try {
      const response = await fetch("/api/dashboard/teams", {
        headers: { "Content-Type": "application/json" },
      })
      if (response.ok) {
        const data = await response.json()
        setTeams(data.items || [])
      } else {
        console.warn("Failed to load teams:", response.status, response.statusText)
        setTeams([]) // Set empty array on error
      }
    } catch (err) {
      console.warn("Failed to load teams:", err)
      setTeams([]) // Set empty array on error
    } finally {
      setLoadingTeams(false)
    }
  }

  const handleSubmit = async () => {
    // Validation - GitHub repository selection is now required
    if (!selectedGithubRepo || selectedGithubRepo === "") {
      setError("Veuillez selectionner un repository GitHub")
      return
    }
    if (!name.trim()) {
      setError("Le nom du projet est requis")
      return
    }
    if (!fullName.trim()) {
      setError("Le nom complet (owner/repo) est requis")
      return
    }

    // Store the import data and show permission validation first
    setPendingImportData({
      name: name.trim(),
      full_name: fullName.trim(),
      description: description.trim() || null,
      language: language.trim() || null,
      visibility,
      default_branch: defaultBranch,
      team_id: teamId || null,
      auto_analysis_enabled: autoAnalysis,
      repo_full_name: selectedGithubRepo
    })
    
    setShowPermissionValidation(true)
    setIsSubmitting(false)
  }

  const handlePermissionValidated = async (result: PermissionValidationResult) => {
    setValidationResult(result)
    
    // Record audit action for permission validation
    try {
      await auditService.recordAction(
        "github.permissions_validated",
        "github_repository", 
        pendingImportData?.repo_full_name || "",
        {
          source: "github_import",
          after: {
            valid: result.valid,
            can_import: result.permissions.can_import,
            missing_permissions: result.permissions.missing_permissions,
            warnings: result.permissions.warnings,
          },
        },
        { 
          github_repository: pendingImportData?.repo_full_name,
          project_name: pendingImportData?.name
        }
      )
    } catch (auditError) {
      console.warn("Failed to record permission validation audit:", auditError)
    }
    
    // Only proceed to members preview if user has import permissions
    if (result.permissions.can_import) {
      setShowPermissionValidation(false)
      setShowMembersPreview(true)
    } else {
      // Show error for insufficient permissions
      const msg = "Permissions insuffisantes pour importer ce repository. Contactez le propriétaire du repository."
      toast.error("Permissions insuffisantes", { description: msg, duration: 6000 })
      setError(msg)
      setShowPermissionValidation(false)
      setIsSubmitting(false)
    }
  }

  const handleConfirmImport = async (members: ImportMemberConfig[]) => {
    if (!pendingImportData) return

    setIsSubmitting(true)
    setError(null)

    const toastId = toast.loading("Import du projet GitHub en cours...")

    try {
      // Import repository with selected members
      const response = await fetch("/api/dashboard/github/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoFullName: pendingImportData.repo_full_name,
          projectName: pendingImportData.name,
          description: pendingImportData.description,
          visibility: pendingImportData.visibility,
          defaultBranch: pendingImportData.default_branch,
          teamId: pendingImportData.team_id,
          autoAnalysisEnabled: pendingImportData.auto_analysis_enabled,
          members: members.map(m => ({
            github_login: m.github_login,
            email: m.email,
            role: m.role
          })),
          validationResult: validationResult // Include validation result for audit
        })
      })

      if (!response.ok) {
        const errorData = await response.text()
        let errorMessage = "Erreur lors de l'import du projet GitHub"
        try {
          const parsed = JSON.parse(errorData)
          errorMessage = parsed.error || parsed.detail || errorMessage
        } catch {
          errorMessage = errorData || errorMessage
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()
      
      toast.dismiss(toastId)
      toast.success("Projet importé avec succès !", {
        description: `Le projet "${pendingImportData.name}" a été importé depuis GitHub.`,
        duration: 5000,
      })
      // Record audit action for project import
      try {
        const importStats = {
          total_members: members.length,
          invited_members: result.invited_count || 0,
          existing_members: result.already_member_count || 0,
          failed_invitations: result.invitation_errors?.length || 0,
          branches_imported: 0, // Would be provided by backend
          commits_imported: 0   // Would be provided by backend
        }

        await auditService.recordProjectImport(
          result.project_id,
          pendingImportData.repo_full_name,
          importStats,
          { 
            project_name: pendingImportData.name,
            github_repository: pendingImportData.repo_full_name
          }
        )

        // Record individual member invitations
        for (const member of members) {
          const invitationResult = result.invitation_errors?.find((err: any) => 
            err.email === member.email
          ) ? "failed" : result.already_members?.includes(member.github_login) ? "already_member" : "success"

          await auditService.recordMemberInvitation(
            result.project_id,
            member.github_login,
            member.role,
            invitationResult,
            { 
              project_name: pendingImportData.name,
              github_repository: pendingImportData.repo_full_name
            }
          )
        }
      } catch (auditError) {
        console.warn("Failed to record audit actions:", auditError)
      }
      
      // Reset form and close dialogs
      resetForm()
      setPendingImportData(null)
      setValidationResult(null)
      setShowMembersPreview(false)
      setShowPermissionValidation(false)
      onOpenChange(false)
      
      if (onSuccess) {
        onSuccess(result.project_id)
      } else {
        router.push(`/dashboard/projects/${encodeURIComponent(result.project_id)}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue"
      toast.dismiss(toastId)
      toast.error("Échec de l'import du projet", { description: msg, duration: 6000 })
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setName("")
    setFullName("")
    setDescription("")
    setLanguage("")
    setVisibility("private")
    setDefaultBranch("main")
    setTeamId("")
    setAutoAnalysis(true)
    setSelectedGithubRepo("")
    setSelectedOrg("")
    setGithubRepos([])
    setError(null)
    setActiveTab("basic")
    setPendingImportData(null)
    setValidationResult(null)
    setShowMembersPreview(false)
    setShowPermissionValidation(false)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm()
    }
    onOpenChange(newOpen)
  }

  const goToAdvancedPage = () => {
    onOpenChange(false)
    router.push("/dashboard/projects/new")
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderGit className="h-5 w-5 text-blue-500" />
            Nouveau Projet
          </DialogTitle>
          <DialogDescription>
            Creez un nouveau projet pour suivre et analyser votre code.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic" className="flex items-center gap-2">
              <FolderGit className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Equipe
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Parametres
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            {/* Organization Selection */}
            <div className="space-y-2">
              <Label>Compte / Organisation GitHub *</Label>
              <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                <SelectTrigger>
                  <SelectValue placeholder="Selectionnez un compte ou une organisation..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingOrgs && (
                    <SelectItem value="loading" disabled>
                      <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                      Chargement...
                    </SelectItem>
                  )}
                  {!loadingOrgs && githubUser && (
                    <SelectItem value="personal">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>{githubUser.login}</span>
                        <Badge variant="outline" className="text-xs ml-1">Personnel</Badge>
                      </div>
                    </SelectItem>
                  )}
                  {!loadingOrgs && organizations.length === 0 && !githubUser && (
                    <SelectItem value="empty" disabled>
                      Aucune organisation trouvee. Connectez votre compte GitHub.
                    </SelectItem>
                  )}
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.login}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        <span>{org.login}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selectionnez d&apos;abord un compte ou une organisation pour filtrer les repositories.
              </p>
            </div>

            {/* GitHub Repo Selection */}
            <div className="space-y-2">
              <Label>Selectionnez un repository GitHub *</Label>
              <Select 
                value={selectedGithubRepo} 
                onValueChange={setSelectedGithubRepo}
                disabled={!selectedOrg}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedOrg ? "Selectionnez un repository..." : "Selectionnez d'abord une organisation"} />
                </SelectTrigger>
                <SelectContent>
                  {loadingGithubRepos && (
                    <SelectItem value="loading" disabled>
                      <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                      Chargement...
                    </SelectItem>
                  )}
                  {githubRepos.length === 0 && !loadingGithubRepos && selectedOrg && (
                    <SelectItem value="empty" disabled>
                      Aucun repository trouve pour cette organisation.
                    </SelectItem>
                  )}
                  {githubRepos.map((repo) => (
                    <SelectItem key={repo.fullName} value={repo.fullName}>
                      <div className="flex items-center gap-2">
                        <span>{repo.name}</span>
                        {repo.language && (
                          <Badge variant="secondary" className="text-xs">
                            {repo.language}
                          </Badge>
                        )}
                        {repo.isPrivate && (
                          <Badge variant="outline" className="text-xs">
                            Prive
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                L&apos;import se fait exclusivement depuis GitHub.
              </p>
            </div>

            {/* Project Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nom du projet *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="mon-projet"
              />
            </div>

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="fullName">Nom complet (owner/repo) *</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="organisation/mon-projet"
              />
              <p className="text-xs text-muted-foreground">
                Format: proprietaire/nom-du-repo
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description du projet..."
                rows={3}
              />
            </div>

            {/* Language */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="language">Langage principal</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectionnez..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TypeScript">TypeScript</SelectItem>
                    <SelectItem value="JavaScript">JavaScript</SelectItem>
                    <SelectItem value="Python">Python</SelectItem>
                    <SelectItem value="Go">Go</SelectItem>
                    <SelectItem value="Java">Java</SelectItem>
                    <SelectItem value="C#">C#</SelectItem>
                    <SelectItem value="PHP">PHP</SelectItem>
                    <SelectItem value="Ruby">Ruby</SelectItem>
                    <SelectItem value="Rust">Rust</SelectItem>
                    <SelectItem value="Other">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="visibility">Visibilite</Label>
                <Select value={visibility} onValueChange={(v: "public" | "private" | "internal") => setVisibility(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Prive</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="internal">Interne</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="team" className="space-y-4 mt-4">
            {/* Team Selection */}
            <div className="space-y-2">
              <Label>Equipe</Label>
              <Select value={teamId} onValueChange={(value) => setTeamId(value === "none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selectionnez une equipe..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune equipe</SelectItem>
                  {loadingTeams && (
                    <SelectItem value="loading" disabled>
                      <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                      Chargement...
                    </SelectItem>
                  )}
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                L&apos;equipe aura acces a ce projet et recevra les notifications.
              </p>
            </div>

            <div className="rounded-lg border border-dashed p-4 text-center">
              <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Vous pourrez ajouter des membres supplementaires apres la creation du projet.
              </p>
              <Button variant="link" size="sm" onClick={goToAdvancedPage}>
                Configurer les membres maintenant
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 mt-4">
            {/* Default Branch */}
            <div className="space-y-2">
              <Label htmlFor="defaultBranch">Branche par defaut</Label>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="defaultBranch"
                  value={defaultBranch}
                  onChange={(e) => setDefaultBranch(e.target.value)}
                  placeholder="main"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                La branche par defaut sera automatiquement protegee.
              </p>
            </div>

            {/* Auto Analysis */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>Analyse automatique</Label>
                <p className="text-xs text-muted-foreground">
                  Lancer automatiquement une analyse a chaque push ou PR.
                </p>
              </div>
              <Switch
                checked={autoAnalysis}
                onCheckedChange={setAutoAnalysis}
              />
            </div>

            <div className="rounded-lg border border-dashed p-4 text-center">
              <Settings className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Plus d&apos;options disponibles sur la page de creation avancee.
              </p>
              <Button variant="link" size="sm" onClick={goToAdvancedPage}>
                Configuration avancee
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creation...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Creer le projet
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Permission Validation Dialog */}
      <PermissionValidationDialog
        open={showPermissionValidation}
        onOpenChange={setShowPermissionValidation}
        repoFullName={pendingImportData?.repo_full_name || ""}
        onValidated={handlePermissionValidated}
      />

      {/* Members Preview Dialog */}
      <MembersPreviewDialog
        open={showMembersPreview}
        onOpenChange={setShowMembersPreview}
        repoFullName={pendingImportData?.repo_full_name || ""}
        onConfirmImport={handleConfirmImport}
      />
    </Dialog>
  )
}
