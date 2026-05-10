"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  FileText,
  Code2,
  Users,
  Calendar,
  RefreshCw,
  Copy,
  CheckCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"

export interface ProjectDescriptionData {
  repo_id: string
  business_description?: string
  technical_summary?: string
  structure?: {
    main_languages: string[]
    frameworks_detected: string[]
  }
  architecture?: {
    pattern: { value: string }
    pattern_confidence: number
  }
  quality?: {
    has_tests: boolean
    has_ci_cd: boolean
    has_documentation: boolean
    code_quality_score: number
  }
  last_analyzed_at: string
  context_version: number
}

interface ProjectDescriptionProps {
  data: ProjectDescriptionData | null
  loading?: boolean
  onRefresh?: () => void
  className?: string
  showTechnicalSummary?: boolean
}

export function ProjectDescription({
  data,
  loading = false,
  onRefresh,
  className,
  showTechnicalSummary = true
}: ProjectDescriptionProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(type)
    setTimeout(() => setCopiedText(null), 2000)
  }

  if (loading) {
    return <ProjectDescriptionSkeleton showTechnical={showTechnicalSummary} />
  }

  if (!data) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No project description available</p>
            {onRefresh && (
              <Button variant="outline" onClick={onRefresh} size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate Description
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Business Description */}
      {data.business_description && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Project Description
                </CardTitle>
                <CardDescription>
                  Non-technical overview for stakeholders
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(data.business_description!, "business")}
                >
                  {copiedText === "business" ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                {onRefresh && (
                  <Button variant="outline" size="sm" onClick={onRefresh}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-base leading-relaxed">
                {data.business_description}
              </p>

              {/* Quick Info Tags */}
              <div className="flex flex-wrap gap-2">
                {data.structure?.main_languages.map((lang) => (
                  <Badge key={lang} variant="secondary">
                    {lang}
                  </Badge>
                ))}
                {data.architecture && (
                  <Badge variant="outline">
                    {data.architecture.pattern.value} architecture
                  </Badge>
                )}
                {data.quality?.has_tests && (
                  <Badge variant="outline" className="text-[color:var(--green-status)]">
                    Has Tests
                  </Badge>
                )}
                {data.quality?.has_ci_cd && (
                  <Badge variant="outline" className="text-teal-400">
                    CI/CD
                  </Badge>
                )}
                {data.quality?.has_documentation && (
                  <Badge variant="outline" className="text-purple-600">
                    Documented
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Technical Summary - Optional */}
      {showTechnicalSummary && data.technical_summary && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-5 w-5" />
                  Technical Summary
                </CardTitle>
                <CardDescription>
                  Detailed technical information for developers
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(data.technical_summary!, "technical")}
              >
                {copiedText === "technical" ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-muted/50 p-4 rounded-md">
                {data.technical_summary}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Last updated: {new Date(data.last_analyzed_at).toLocaleDateString()}</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div>
                Version: {data.context_version}
              </div>
              {data.quality && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <div>
                    Quality Score: {data.quality.code_quality_score}%
                  </div>
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {data.repo_id}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ProjectDescriptionSkeleton({ showTechnical = true }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
            <div className="flex flex-wrap gap-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-16" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {showTechnical && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
              <Skeleton className="h-8 w-8" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}