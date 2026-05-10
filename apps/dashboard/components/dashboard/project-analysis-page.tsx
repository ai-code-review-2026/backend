"use client"

import { useCallback, useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ProjectOverview } from "@/components/dashboard/project-overview"
import { ProjectDescription } from "@/components/dashboard/project-description"
import { ProjectStructure } from "@/components/dashboard/project-structure"
import {
  fetchProjectProfile,
  analyzeProject,
  fetchContextStatus,
  refreshProjectContext,
  type ProjectProfile,
  type ContextStatus,
} from "@/lib/project-comprehension"
import { RefreshCw, AlertTriangle, CheckCircle, Clock } from "lucide-react"

interface ProjectAnalysisPageProps {
  repoId: string
  repoPath?: string
}

export function ProjectAnalysisPage({ repoId, repoPath }: ProjectAnalysisPageProps) {
  const [profile, setProfile] = useState<ProjectProfile | null>(null)
  const [contextStatus, setContextStatus] = useState<ContextStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [profileData, statusData] = await Promise.all([
        fetchProjectProfile(repoId),
        fetchContextStatus(repoId),
      ])
      setProfile(profileData)
      setContextStatus(statusData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project data")
    } finally {
      setLoading(false)
    }
  }, [repoId])

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      const success = await analyzeProject(repoId, repoPath)
      if (success) {
        setTimeout(loadData, 2000)
      } else {
        setError("Failed to start project analysis")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start analysis")
    } finally {
      setAnalyzing(false)
    }
  }

  const handleRefreshContext = async () => {
    setRefreshing(true)
    try {
      const success = await refreshProjectContext(repoId)
      if (success) {
        setTimeout(loadData, 2000)
      } else {
        setError("Failed to refresh context")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh context")
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [loadData])

  const getStatusBadge = () => {
    if (!profile) return null

    switch (profile.analysis_status) {
      case "completed":
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Complete</Badge>
      case "failed":
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Failed</Badge>
      case "analyzing":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1 animate-spin" />Analyzing</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getStalenessAlert = () => {
    if (!contextStatus || !contextStatus.is_stale) return null

    return (
      <Alert className="mb-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <div>
            <strong>Context may be stale:</strong> {contextStatus.reason}
            <br />
            <span className="text-sm text-muted-foreground">
              Recommended: {contextStatus.recommended_action}
            </span>
          </div>
          <Button
            size="sm"
            onClick={handleRefreshContext}
            disabled={refreshing}
          >
            {refreshing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              "Refresh Context"
            )}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Project Analysis</h1>
          <p className="text-muted-foreground">{repoId}</p>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge()}
          <Button
            onClick={handleAnalyze}
            disabled={analyzing || profile?.analysis_status === "analyzing"}
            size="sm"
          >
            {analyzing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {profile ? "Re-analyze" : "Analyze"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Staleness Alert */}
      {getStalenessAlert()}

      {/* Main Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Loading project data...</span>
        </div>
      ) : !profile ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center space-y-3">
              <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No project analysis available</p>
              <Button onClick={handleAnalyze} disabled={analyzing}>
                {analyzing ? "Analyzing..." : "Start Analysis"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="structure">Structure</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <ProjectOverview
              profile={profile}
              onRefresh={loadData}
            />
          </TabsContent>

          <TabsContent value="description" className="space-y-6">
            <ProjectDescription
              data={profile}
              onRefresh={loadData}
            />
          </TabsContent>

          <TabsContent value="structure" className="space-y-6">
            <ProjectStructure
              data={profile}
              onRefresh={loadData}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Context Status Footer */}
      {contextStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Context Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm">
              <div className="space-y-1">
                <div>Status: <Badge variant="outline">{contextStatus.status}</Badge></div>
                <div className="text-muted-foreground">
                  Age: {Math.round(contextStatus.age_hours)} hours
                  {contextStatus.refresh_priority > 50 && (
                    <span className="ml-2 text-[color:var(--orange)]">• High refresh priority</span>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshContext}
                disabled={refreshing}
              >
                {refreshing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  "Refresh"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}