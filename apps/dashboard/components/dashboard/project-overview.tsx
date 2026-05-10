"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Code2,
  FileText,
  GitBranch,
  Package,
  Layers,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProjectProfile {
  repo_id: string
  org_id?: string
  context_version: number
  analysis_status: "analyzing" | "completed" | "failed"
  created_at: string
  last_analyzed_at: string
  last_context_update_at?: string
  business_description?: string
  technical_summary?: string
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
  quality?: {
    has_tests: boolean
    test_framework?: string
    test_coverage_estimated?: number
    has_ci_cd: boolean
    ci_cd_platform?: string
    has_documentation: boolean
    linting_tools: string[]
    code_quality_score: number
  }
  dependencies?: {
    external_dependencies_count: number
    dev_dependencies_count: number
    production_dependencies_count: number
    dependency_managers: string[]
    security_vulnerabilities_count: number
  }
}

interface ProjectOverviewProps {
  profile: ProjectProfile | null
  loading?: boolean
  onRefresh?: () => void
  className?: string
}

export function ProjectOverview({ profile, loading = false, onRefresh, className }: ProjectOverviewProps) {
  if (loading) {
    return <ProjectOverviewSkeleton />
  }

  if (!profile) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No project profile available</p>
            {onRefresh && (
              <Button variant="outline" onClick={onRefresh} size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Analyze Project
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const getStatusIcon = () => {
    switch (profile.analysis_status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "failed":
        return <AlertCircle className="h-4 w-4 text-destructive" />
      case "analyzing":
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusText = () => {
    switch (profile.analysis_status) {
      case "completed":
        return "Analysis Complete"
      case "failed":
        return "Analysis Failed"
      case "analyzing":
        return "Analyzing..."
      default:
        return "Unknown Status"
    }
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                Project Overview
              </CardTitle>
              <CardDescription>
                Comprehensive analysis and insights for {profile.repo_id}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span className="text-sm font-medium">{getStatusText()}</span>
              {onRefresh && (
                <Button variant="outline" size="sm" onClick={onRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {profile.business_description && (
          <CardContent>
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Project Description</h4>
              <p className="text-sm leading-relaxed">{profile.business_description}</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Technical Summary */}
      {profile.technical_summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Technical Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm">
                {profile.technical_summary}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Structure & Languages */}
        {profile.structure && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers className="h-4 w-4" />
                Project Structure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Languages</h4>
                <div className="flex flex-wrap gap-1">
                  {profile.structure.main_languages.map((lang) => (
                    <Badge key={lang} variant="default">
                      {lang}
                    </Badge>
                  ))}
                  {profile.structure.secondary_languages.map((lang) => (
                    <Badge key={lang} variant="secondary">
                      {lang}
                    </Badge>
                  ))}
                </div>
              </div>

              {profile.structure.frameworks_detected.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Frameworks</h4>
                  <div className="flex flex-wrap gap-1">
                    {profile.structure.frameworks_detected.map((framework) => (
                      <Badge key={framework} variant="outline">
                        {framework}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Files:</span>
                  <span className="ml-2 font-medium">{profile.structure.total_files}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Code Files:</span>
                  <span className="ml-2 font-medium">{profile.structure.code_files_count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Test Files:</span>
                  <span className="ml-2 font-medium">{profile.structure.test_files_count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Config Files:</span>
                  <span className="ml-2 font-medium">{profile.structure.config_files_count}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Architecture */}
        {profile.architecture && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <GitBranch className="h-4 w-4" />
                Architecture
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Pattern</h4>
                <div className="flex items-center gap-2">
                  <Badge variant="default">{profile.architecture.pattern.value}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(profile.architecture.pattern_confidence * 100)}% confidence
                  </span>
                </div>
              </div>

              {profile.architecture.entry_points.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Entry Points</h4>
                  <div className="space-y-1">
                    {profile.architecture.entry_points.slice(0, 3).map((entry) => (
                      <div key={entry} className="text-sm font-mono text-muted-foreground">
                        {entry}
                      </div>
                    ))}
                    {profile.architecture.entry_points.length > 3 && (
                      <div className="text-sm text-muted-foreground">
                        +{profile.architecture.entry_points.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">API Endpoints:</span>
                  <span className="ml-2 font-medium">{profile.architecture.api_endpoints_count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Docker:</span>
                  {profile.architecture.docker_detected ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Database:</span>
                  {profile.architecture.database_detected ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">CI/CD:</span>
                  {profile.architecture.ci_cd_detected ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quality */}
        {profile.quality && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle className="h-4 w-4" />
                Code Quality
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Quality Score</h4>
                <div className="space-y-2">
                  <Progress value={profile.quality.code_quality_score} className="w-full" />
                  <span className="text-sm text-muted-foreground">
                    {profile.quality.code_quality_score}% overall quality
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tests</span>
                  <div className="flex items-center gap-2">
                    {profile.quality.has_tests ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {profile.quality.test_framework && (
                          <Badge variant="outline" className="text-xs">
                            {profile.quality.test_framework}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </div>
                </div>

                {profile.quality.test_coverage_estimated && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Test Coverage</span>
                    <span className="font-medium">
                      ~{Math.round(profile.quality.test_coverage_estimated)}%
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">CI/CD</span>
                  <div className="flex items-center gap-2">
                    {profile.quality.has_ci_cd ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {profile.quality.ci_cd_platform && (
                          <Badge variant="outline" className="text-xs">
                            {profile.quality.ci_cd_platform}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </div>
                </div>

                {profile.quality.linting_tools.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Linting Tools</h4>
                    <div className="flex flex-wrap gap-1">
                      {profile.quality.linting_tools.map((tool) => (
                        <Badge key={tool} variant="outline" className="text-xs">
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dependencies */}
        {profile.dependencies && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-4 w-4" />
                Dependencies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">External:</span>
                  <span className="ml-2 font-medium">{profile.dependencies.external_dependencies_count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Dev:</span>
                  <span className="ml-2 font-medium">{profile.dependencies.dev_dependencies_count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Production:</span>
                  <span className="ml-2 font-medium">{profile.dependencies.production_dependencies_count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Vulnerabilities:</span>
                  <span className={cn(
                    "ml-2 font-medium",
                    profile.dependencies.security_vulnerabilities_count > 0
                      ? "text-destructive"
                      : "text-green-500"
                  )}>
                    {profile.dependencies.security_vulnerabilities_count}
                  </span>
                </div>
              </div>

              {profile.dependencies.dependency_managers.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Package Managers</h4>
                  <div className="flex flex-wrap gap-1">
                    {profile.dependencies.dependency_managers.map((manager) => (
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

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-4 w-4" />
            Analysis Metadata
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Context Version:</span>
              <span className="ml-2 font-medium">{profile.context_version}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>
              <span className="ml-2 font-medium">
                {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Last Analyzed:</span>
              <span className="ml-2 font-medium">
                {new Date(profile.last_analyzed_at).toLocaleDateString()}
              </span>
            </div>
            {profile.last_context_update_at && (
              <div>
                <span className="text-muted-foreground">Last Updated:</span>
                <span className="ml-2 font-medium">
                  {new Date(profile.last_context_update_at).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ProjectOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}