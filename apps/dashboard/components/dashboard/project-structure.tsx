"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Folder,
  FileCode,
  TestTube,
  Settings,
  FileText,
  Package,
  GitBranch,
  Layers,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Database,
  Container,
  Workflow
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"

export interface ProjectStructureData {
  repo_id: string
  structure?: {
    root_directories: string[]
    main_languages: string[]
    secondary_languages: string[]
    frameworks_detected: string[]
    package_managers: Array<{ value: string }>
    total_files: number
    total_directories: number
    code_files_count: number
    config_files_count: number
    doc_files_count: number
    test_files_count: number
  }
  architecture?: {
    pattern: { value: string }
    pattern_confidence: number
    entry_points: string[]
    api_endpoints_count: number
    database_detected: boolean
    docker_detected: boolean
    ci_cd_detected: boolean
  }
  dependencies?: {
    external_dependencies_count: number
    dev_dependencies_count: number
    production_dependencies_count: number
    dependency_managers: string[]
    security_vulnerabilities_count: number
  }
  context_version: number
  last_analyzed_at: string
}

interface ProjectStructureProps {
  data: ProjectStructureData | null
  loading?: boolean
  onRefresh?: () => void
  className?: string
  showDetails?: boolean
}

export function ProjectStructure({
  data,
  loading = false,
  onRefresh,
  className,
  showDetails = true
}: ProjectStructureProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  if (loading) {
    return <ProjectStructureSkeleton />
  }

  if (!data || !data.structure) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <Folder className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No project structure available</p>
            {onRefresh && (
              <Button variant="outline" onClick={onRefresh} size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Analyze Structure
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const { structure, architecture, dependencies } = data

  // Calculate file distribution percentages
  const totalFiles = structure.total_files
  const codePercentage = (structure.code_files_count / totalFiles) * 100
  const testPercentage = (structure.test_files_count / totalFiles) * 100
  const configPercentage = (structure.config_files_count / totalFiles) * 100
  const docPercentage = (structure.doc_files_count / totalFiles) * 100

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Project Structure
              </CardTitle>
              <CardDescription>
                File organization, languages, and architectural patterns
              </CardDescription>
            </div>
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* File Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileCode className="h-4 w-4" />
              File Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2">
                    <FileCode className="h-3 w-3 text-blue-500" />
                    Code Files
                  </span>
                  <span className="font-medium">{structure.code_files_count}</span>
                </div>
                <Progress value={codePercentage} className="h-2" />
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2">
                    <TestTube className="h-3 w-3 text-green-500" />
                    Test Files
                  </span>
                  <span className="font-medium">{structure.test_files_count}</span>
                </div>
                <Progress value={testPercentage} className="h-2" />
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2">
                    <Settings className="h-3 w-3 text-[color:var(--orange)]" />
                    Config Files
                  </span>
                  <span className="font-medium">{structure.config_files_count}</span>
                </div>
                <Progress value={configPercentage} className="h-2" />
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2">
                    <FileText className="h-3 w-3 text-purple-500" />
                    Documentation
                  </span>
                  <span className="font-medium">{structure.doc_files_count}</span>
                </div>
                <Progress value={docPercentage} className="h-2" />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total Files:</span>
                <span className="ml-2 font-medium">{structure.total_files}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Directories:</span>
                <span className="ml-2 font-medium">{structure.total_directories}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Languages & Frameworks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-4 w-4" />
              Languages & Frameworks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Primary Languages</h4>
              <div className="flex flex-wrap gap-1">
                {structure.main_languages.map((lang) => (
                  <Badge key={lang} variant="default">
                    {lang}
                  </Badge>
                ))}
              </div>
            </div>

            {structure.secondary_languages.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Secondary Languages</h4>
                <div className="flex flex-wrap gap-1">
                  {structure.secondary_languages.map((lang) => (
                    <Badge key={lang} variant="secondary">
                      {lang}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {structure.frameworks_detected.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Frameworks</h4>
                <div className="flex flex-wrap gap-1">
                  {structure.frameworks_detected.map((framework) => (
                    <Badge key={framework} variant="outline">
                      {framework}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {structure.package_managers.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Package Managers</h4>
                <div className="flex flex-wrap gap-1">
                  {structure.package_managers.map((pm) => (
                    <Badge key={pm.value} variant="secondary">
                      {pm.value}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Architecture */}
      {architecture && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <GitBranch className="h-4 w-4" />
              Architecture Pattern
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="default" className="text-sm">
                    {architecture.pattern.value}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(architecture.pattern_confidence * 100)}% confidence
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {architecture.database_detected && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Database className="h-4 w-4 text-blue-500" />
                    Database
                  </div>
                )}
                {architecture.docker_detected && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Container className="h-4 w-4 text-cyan-500" />
                    Docker
                  </div>
                )}
                {architecture.ci_cd_detected && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Workflow className="h-4 w-4 text-green-500" />
                    CI/CD
                  </div>
                )}
              </div>
            </div>

            {showDetails && (
              <>
                {architecture.entry_points.length > 0 && (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSection("entry-points")}
                      className="h-auto p-0 font-medium text-sm"
                    >
                      {expandedSections.has("entry-points") ? (
                        <ChevronDown className="h-3 w-3 mr-1" />
                      ) : (
                        <ChevronRight className="h-3 w-3 mr-1" />
                      )}
                      Entry Points ({architecture.entry_points.length})
                    </Button>
                    {expandedSections.has("entry-points") && (
                      <div className="mt-2 space-y-1 ml-4">
                        {architecture.entry_points.map((entry, index) => (
                          <div key={index} className="text-sm font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                            {entry}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {architecture.api_endpoints_count > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">API Endpoints detected:</span>
                    <span className="ml-2 font-medium">{architecture.api_endpoints_count}</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Root Directories */}
      {showDetails && structure.root_directories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Folder className="h-4 w-4" />
              Root Directories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {structure.root_directories.map((dir) => (
                <div key={dir} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-mono">{dir}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dependencies Summary */}
      {dependencies && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-4 w-4" />
              Dependencies Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded">
                <div className="text-2xl font-bold">{dependencies.external_dependencies_count}</div>
                <div className="text-sm text-muted-foreground">External</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded">
                <div className="text-2xl font-bold">{dependencies.dev_dependencies_count}</div>
                <div className="text-sm text-muted-foreground">Dev</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded">
                <div className="text-2xl font-bold">{dependencies.production_dependencies_count}</div>
                <div className="text-sm text-muted-foreground">Production</div>
              </div>
              <div className={cn(
                "text-center p-4 rounded",
                dependencies.security_vulnerabilities_count > 0
                  ? "bg-red-50 dark:bg-red-950/20"
                  : "bg-green-50 dark:bg-green-950/20"
              )}>
                <div className={cn(
                  "text-2xl font-bold",
                  dependencies.security_vulnerabilities_count > 0
                    ? "text-destructive"
                    : "text-[color:var(--green-status)]"
                )}>
                  {dependencies.security_vulnerabilities_count}
                </div>
                <div className="text-sm text-muted-foreground">Vulnerabilities</div>
              </div>
            </div>

            {dependencies.dependency_managers.length > 0 && showDetails && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Package Managers</h4>
                <div className="flex flex-wrap gap-1">
                  {dependencies.dependency_managers.map((manager) => (
                    <Badge key={manager} variant="secondary" className="text-xs">
                      {manager}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ProjectStructureSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-8 w-8" />
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-8" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex flex-wrap gap-2">
                {[...Array(6)].map((_, j) => (
                  <Skeleton key={j} className="h-6 w-16" />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}