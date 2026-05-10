"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  Star,
  StarOff,
  Play,
  Settings,
  MoreHorizontal,
  GitBranch,
  Clock,
  Users,
  ExternalLink,
  RefreshCw,
  Archive,
  Trash2,
  Copy,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  LANGUAGE_COLORS,
  STATUS_CONFIG,
  type ProjectStatus,
  type ProjectDetail,
} from "@/types/project"

interface ProjectHeaderProps {
  project: ProjectDetail | null
  loading?: boolean
  onRunAnalysis?: () => Promise<void>
  onToggleStar?: () => void
  className?: string
}

// Health score color based on value
function getHealthScoreColor(score: number): string {
  if (score >= 90) return "text-green-500"
  if (score >= 70) return "text-yellow-500"
  if (score >= 50) return "text-[color:var(--orange)]"
  return "text-destructive"
}

function getHealthScoreBgColor(score: number): string {
  if (score >= 90) return "stroke-green-500"
  if (score >= 70) return "stroke-yellow-500"
  if (score >= 50) return "stroke-orange-500"
  return "stroke-red-500"
}

// Circular progress component for health score
function HealthScoreGauge({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-muted/20"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className={getHealthScoreBgColor(score)}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
            transition: "stroke-dashoffset 0.5s ease-in-out",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-sm font-bold", getHealthScoreColor(score))}>
          {score}%
        </span>
      </div>
    </div>
  )
}

// Tab navigation items
const PROJECT_TABS = [
  { value: "overview", label: "Overview", href: "" },
  { value: "analyses", label: "Analyses", href: "/analyses" },
  { value: "branches", label: "Branches", href: "/branches" },
  { value: "quality", label: "Quality", href: "/quality" },
  { value: "dependencies", label: "Dependencies", href: "/dependencies" },
] as const

export function ProjectHeader({
  project,
  loading = false,
  onRunAnalysis,
  onToggleStar,
  className,
}: ProjectHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [copied, setCopied] = useState(false)

  // Determine active tab from pathname
  const projectBasePath = project ? `/dashboard/projects/${project.id}` : ""
  const activeTab = PROJECT_TABS.find((tab) => {
    if (tab.href === "") {
      return pathname === projectBasePath || pathname === `${projectBasePath}/`
    }
    return pathname.startsWith(`${projectBasePath}${tab.href}`)
  })?.value || "overview"

  const handleRunAnalysis = async () => {
    if (!onRunAnalysis || isAnalyzing) return
    setIsAnalyzing(true)
    const toastId = toast.loading("Analyse en cours...")
    try {
      await onRunAnalysis()
      toast.dismiss(toastId)
      toast.success("Analyse lancée avec succès !", { duration: 4000 })
    } catch (err) {
      toast.dismiss(toastId)
      toast.error("Échec du lancement de l'analyse", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
        duration: 6000,
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleCopyId = async () => {
    if (!project) return
    await navigator.clipboard.writeText(project.id)
    setCopied(true)
    toast.success("ID du projet copié !", { duration: 2000 })
    setTimeout(() => setCopied(false), 2000)
  }

  const handleTabChange = (value: string) => {
    const tab = PROJECT_TABS.find((t) => t.value === value)
    if (tab && project) {
      router.push(`${projectBasePath}${tab.href}`)
    }
  }

  if (loading) {
    return <ProjectHeaderSkeleton />
  }

  if (!project) {
    return null
  }

  const status = STATUS_CONFIG[project.status as ProjectStatus]
  const languageColor = LANGUAGE_COLORS[project.language] || "bg-gray-500"

  return (
    <div className={cn("space-y-4", className)}>
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/projects">Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Main Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
      >
        {/* Left Section - Project Info */}
        <div className="flex items-start gap-4">
          {/* Back Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard/projects")}
            className="shrink-0 mt-1"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {/* Health Score Gauge */}
          <div className="shrink-0">
            <HealthScoreGauge score={project.healthScore} size={64} />
          </div>

          {/* Project Details */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleStar}
                className="h-8 w-8"
              >
                {project.starred ? (
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                ) : (
                  <StarOff className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Language Badge */}
              <Badge variant="secondary" className="gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", languageColor)} />
                {project.language}
              </Badge>

              {/* Status Badge */}
              <Badge variant="secondary" className={status.className}>
                {status.label}
              </Badge>

              {/* Last Activity */}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {project.lastActivity}
              </span>

              {/* Contributors */}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {project.contributors} contributors
              </span>

              {/* Branches */}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                {project.branches} branches
              </span>
            </div>

            {project.description && (
              <p className="text-sm text-muted-foreground max-w-2xl">
                {project.description}
              </p>
            )}
          </div>
        </div>

        {/* Right Section - Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="gap-2"
          >
            {isAnalyzing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run Analysis
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopyId}>
                {copied ? (
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                Copy Project ID
              </DropdownMenuItem>
              {project.repoUrl && (
                <DropdownMenuItem asChild>
                  <a href={project.repoUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in GitHub
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/projects/${project.id}/settings`}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-[color:var(--orange)]"
                onClick={() => toast.info("Archivage disponible dans les paramètres du projet.", { duration: 4000 })}
              >
                <Archive className="h-4 w-4 mr-2" />
                Archive Project
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => toast.info("Suppression disponible dans les paramètres du projet.", { duration: 4000 })}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full justify-start h-auto p-1 bg-muted/50">
          {PROJECT_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="data-[state=active]:bg-background"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}

function ProjectHeaderSkeleton() {
  return (
    <div className="space-y-4">
      {/* Breadcrumb Skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Main Header Skeleton */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      {/* Tabs Skeleton */}
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>
    </div>
  )
}

export { HealthScoreGauge, PROJECT_TABS }
