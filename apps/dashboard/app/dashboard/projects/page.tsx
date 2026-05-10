"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { clearProjectCaches } from "@/hooks/use-project"
import {
  Folder,
  GitBranch,
  Star,
  StarOff,
  Clock,
  MoreHorizontal,
  Search,
  Plus,
  Grid3X3,
  List,
  AlertTriangle,
  Settings,
  Archive,
  Eye,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BADGE_SUCCESS, BADGE_WARNING, BADGE_SECONDARY } from "@/lib/design-tokens"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
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
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { CreateProjectDialog } from "@/components/dashboard/CreateProjectDialog"

// Types for projects
interface Project {
  id: string
  name: string
  repo: string
  description: string
  language: string
  team: string
  status: "active" | "maintenance" | "archived"
  starred: boolean
  lastActivity: string
  branches: number
  openIssues: number
  healthScore: number
  commits: number
  contributors: number
  coverage: number
}

interface ApiProject {
  id: string
  name: string
  repo?: string
  description?: string | null
  language?: string | null
  team?: string | null
  status?: string
  defaultBranch?: string
  memberCount?: number
  healthScore?: number
  analysisCount?: number
  lastAnalysisAt?: string | null
  updatedAt?: string
}

function formatProjectActivity(value?: string | null) {
  if (!value) return "No activity yet"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "No activity yet"
  return date.toLocaleDateString("fr-FR", {
    month: "short",
    day: "numeric",
  })
}

function normalizeProject(raw: ApiProject): Project {
  const safeStatus =
    raw.status === "maintenance" || raw.status === "archived" ? raw.status : "active"

  return {
    id: raw.id,
    name: raw.name || raw.repo || raw.id,
    repo: raw.repo || "",
    description: raw.description || "No description available",
    language: raw.language || "Unknown",
    team: raw.team || "Unassigned",
    status: safeStatus,
    starred: false,
    lastActivity: formatProjectActivity(raw.lastAnalysisAt || raw.updatedAt),
    branches: raw.defaultBranch ? 1 : 0,
    openIssues: 0,
    healthScore: typeof raw.healthScore === "number" ? raw.healthScore : 0,
    commits: typeof raw.analysisCount === "number" ? raw.analysisCount : 0,
    contributors: typeof raw.memberCount === "number" ? raw.memberCount : 0,
    coverage: 0,
  }
}

const languageColors: Record<string, string> = {
  TypeScript: "bg-blue-500",
  Go: "bg-cyan-500",
  Python: "bg-yellow-500",
  Dart: "bg-teal-500",
  "Node.js": "bg-green-500",
}

const statusConfig = {
  active: { label: "Actif", variant: BADGE_SUCCESS },
  maintenance: { label: "Maintenance", variant: BADGE_WARNING },
  archived: { label: "Archive", variant: BADGE_SECONDARY },
}

interface ProjectCardProps {
  project: Project
  viewMode: "grid" | "list"
  onClick: () => void
  onStar?: (projectId: string, starred: boolean) => void
}

function ProjectCard({ project, viewMode, onClick, onStar }: ProjectCardProps) {
  const [isStarred, setIsStarred] = useState(project.starred)
  const status = statusConfig[project.status as keyof typeof statusConfig]

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newStarred = !isStarred
    setIsStarred(newStarred)
    onStar?.(project.id, newStarred)
    toast.success(newStarred ? "Projet ajouté aux favoris" : "Projet retiré des favoris", {
      duration: 2000,
    })
  }

  const handleDropdownClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  if (viewMode === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="group"
      >
        <Card 
          className="hover:shadow-md transition-all cursor-pointer hover:border-primary/50"
          onClick={onClick}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Folder className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium hover:text-primary transition-colors">{project.name}</h3>
                  <div className={`h-2 w-2 rounded-full ${languageColors[project.language]}`} />
                  <span className="text-xs text-muted-foreground">{project.language}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{project.description}</p>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <GitBranch className="h-4 w-4" />
                  {project.branches}
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  {project.openIssues}
                </span>
                <Badge variant={status.variant}>
                  {status.label}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleStarClick}
                >
                  {isStarred ? (
                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  ) : (
                    <StarOff className="h-4 w-4" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={handleDropdownClick}>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onClick}>
                      <Eye className="h-4 w-4 mr-2" />
                      Voir le Projet
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings className="h-4 w-4 mr-2" />
                      Parametres
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toast.info("Archivage non disponible depuis cette vue. Utilisez les paramètres du projet.", { duration: 4000 }) }}>
                      <Archive className="h-4 w-4 mr-2" />
                      Archiver
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group"
    >
      <Card 
        className="hover:shadow-md transition-all h-full cursor-pointer hover:border-primary/50"
        onClick={onClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Folder className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <CardTitle className="text-base group-hover:text-primary transition-colors">
                  {project.name}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{project.language}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <GitBranch className="h-4 w-4" />
                {project.branches}
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                {project.openIssues}
              </span>
              <Badge variant={status.variant}>
                {status.label}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStarClick}
            >
              {isStarred ? (
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
              ) : (
                <StarOff className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {project.description}
          </p>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Score Sante</span>
            <span className={cn(
              "font-medium",
              project.healthScore >= 90 ? "text-[color:var(--green-status)]" :
              project.healthScore >= 70 ? "text-[color:var(--orange)]" : "text-destructive"
            )}>
              {project.healthScore}%
            </span>
          </div>
          <Progress
            value={project.healthScore}
            className={cn(
              "h-2",
              project.healthScore >= 90 ? "[&>div]:bg-[color:var(--green-status)]" :
              project.healthScore >= 70 ? "[&>div]:bg-[color:var(--orange)]" : "[&>div]:bg-destructive"
            )}
          />

          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
            <div className="text-center">
              <div className="text-lg font-bold">{project.branches}</div>
              <div className="text-xs text-muted-foreground">Branches</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{project.commits}</div>
              <div className="text-xs text-muted-foreground">Commits</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{project.contributors}</div>
              <div className="text-xs text-muted-foreground">Personnes</div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <Badge variant={status.variant}>
              {status.label}
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {project.lastActivity}
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [teamFilter, setTeamFilter] = useState("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const fetchProjects = async () => {
    let cancelled = false
    
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch("/api/dashboard/projects", {
        cache: 'no-store'
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const data = await response.json()
      if (!cancelled) {
        const normalized = Array.isArray(data.items)
          ? data.items.map((item: ApiProject) => normalizeProject(item))
          : []
        setProjects(normalized)
      }
    } catch (err) {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Failed to fetch projects")
        console.error("Failed to fetch projects:", err)
      }
    } finally {
      if (!cancelled) {
        setLoading(false)
      }
    }
    
    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    void fetchProjects()
  }, [])

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.repo.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || project.status === statusFilter
    const matchesTeam = teamFilter === "all" || project.team === teamFilter
    return matchesSearch && matchesStatus && matchesTeam
  })

  const starredProjects = filteredProjects.filter((p) => p.starred)
  const otherProjects = filteredProjects.filter((p) => !p.starred)

  const handleProjectClick = (projectId: string) => {
    router.push(`/dashboard/projects/${encodeURIComponent(projectId)}`)
  }

  const handleNewProject = () => {
    setCreateDialogOpen(true)
  }

  const handleImportGithub = () => {
    router.push("/dashboard/projects/import")
  }

  const handleProjectCreated = (projectId: string) => {
    // Clear any project-related caches
    if (typeof clearProjectCaches === 'function') {
      clearProjectCaches()
    }
    
    // Force refresh the projects list with cache-busting
    setTimeout(() => {
      fetchProjects() // Refresh list
    }, 100) // Small delay to ensure backend has processed the creation
    
    router.push(`/dashboard/projects/${encodeURIComponent(projectId)}`)
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-3 text-muted-foreground">Chargement des projets...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold text-red-700 dark:text-destructive mb-2">
                Erreur de chargement
              </h3>
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={fetchProjects} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Reessayer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="card-heading text-foreground">Projets</h1>
          <p className="text-muted-foreground mt-1">
            Gerer et surveiller tous vos projets
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleImportGithub}>
            <Folder className="h-4 w-4" />
            Importer GitHub
          </Button>
          <Button className="gap-2" onClick={handleNewProject}>
            <Plus className="h-4 w-4" />
            Nouveau Projet
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher des projets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les Statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="archived">Archive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Equipe" />
              </SelectTrigger>
              <SelectContent>
              <SelectItem value="all">Toutes les Equipes</SelectItem>
              {Array.from(new Set(projects.map((project) => project.team).filter(Boolean))).map((team) => (
                <SelectItem key={team} value={team}>
                  {team}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
            <div className="flex items-center border rounded-lg">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("grid")}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Starred Projects */}
      {starredProjects.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Projets Favoris
          </h2>
          <div className={viewMode === "grid" ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>
            {starredProjects.map((project) => (
              <ProjectCard 
                key={project.id} 
                project={project} 
                viewMode={viewMode}
                onClick={() => handleProjectClick(project.id)}
                onStar={() => {}}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Projects */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Tous les Projets</h2>
        <div className={viewMode === "grid" ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>
          {otherProjects.map((project) => (
            <ProjectCard 
              key={project.id} 
              project={project} 
              viewMode={viewMode}
              onClick={() => handleProjectClick(project.id)}
              onStar={() => {}}
            />
          ))}
        </div>
      </div>

      {filteredProjects.length === 0 && (
        <EmptyState
          title="Aucun projet trouvé"
          description="Essayez d'ajuster vos filtres ou créez un nouveau projet pour commencer."
          icons={[
            <Folder key="f" className="h-5 w-5" />,
            <GitBranch key="g" className="h-5 w-5" />,
            <Plus key="p" className="h-5 w-5" />,
          ]}
          action={{
            label: "Créer un projet",
            icon: <Plus className="h-3.5 w-3.5" />,
            onClick: () => setCreateDialogOpen(true),
          }}
        />
      )}

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleProjectCreated}
      />
    </div>
  )
}
