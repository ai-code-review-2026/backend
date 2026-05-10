"use client"

import { useState, useEffect, useCallback } from "react"
import { ProjectDetail, ProjectSummary, AnalysisSummary, BranchInfo, QualityMetrics, DependencySummary } from "@/types/project"
import { ProjectProfile, fetchProjectProfile, analyzeProject } from "@/lib/project-comprehension"
import { formatCompactRelativeTime as formatRelativeTime } from "@/lib/domain/dates"

// Cache configuration
const CACHE_TTL_MS = 2 * 60 * 1000 // 2 minutes

// In-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>()

function getCached<T>(key: string): T | null {
  const cached = cache.get(key)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return cached.data as T
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() })
}

// Transform ProjectProfile to ProjectDetail
function transformProfileToDetail(profile: ProjectProfile, projectId: string): ProjectDetail {
  const mainLanguage = profile.structure?.main_languages?.[0] || "Unknown"
  
  return {
    id: projectId,
    repoId: profile.repo_id,
    name: profile.repo_id.split("/").pop() || profile.repo_id,
    description: profile.business_description,
    language: mainLanguage,
    status: profile.analysis_status === "completed" ? "active" : 
            profile.analysis_status === "analyzing" ? "maintenance" : "active",
    starred: false, // This would come from user preferences
    lastActivity: profile.last_analyzed_at 
      ? formatRelativeTime(profile.last_analyzed_at)
      : "Unknown",
    healthScore: profile.quality?.code_quality_score || 0,
    branches: 0, // Would come from a separate API
    commits: 0, // Would come from a separate API
    contributors: 0, // Would come from a separate API
    coverage: profile.quality?.test_coverage_estimated,
    createdAt: profile.created_at,
    updatedAt: profile.last_analyzed_at || profile.created_at,
    organizationId: profile.org_id,
    teamMembers: [], // Would come from a separate API
  }
}

// Hook for fetching project detail
export function useProjectDetail(projectId: string | undefined) {
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [profile, setProfile] = useState<ProjectProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchProject = useCallback(async () => {
    if (!projectId) {
      setLoading(false)
      return
    }

    // Check cache first
    const cacheKey = `project_detail_${projectId}`
    const cached = getCached<{ project: ProjectDetail; profile: ProjectProfile }>(cacheKey)
    if (cached) {
      setProject(cached.project)
      setProfile(cached.profile)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch from profile API
      const profileData = await fetchProjectProfile(projectId)
      
      if (profileData) {
        const projectDetail = transformProfileToDetail(profileData, projectId)
        setProject(projectDetail)
        setProfile(profileData)
        setCache(cacheKey, { project: projectDetail, profile: profileData })
      } else {
        // If no profile exists, create a basic project structure
        // This could happen for new projects that haven't been analyzed yet
        setProject({
          id: projectId,
          repoId: projectId,
          name: projectId.split("/").pop() || projectId,
          language: "Unknown",
          status: "active",
          starred: false,
          lastActivity: "Never",
          healthScore: 0,
          branches: 0,
          commits: 0,
          contributors: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          teamMembers: [],
        })
        setProfile(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch project"))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void fetchProject()
  }, [fetchProject])

  const refresh = useCallback(() => {
    if (projectId) {
      cache.delete(`project_detail_${projectId}`)
    }
    return fetchProject()
  }, [projectId, fetchProject])

  const runAnalysis = useCallback(async () => {
    if (!projectId) return false
    const success = await analyzeProject(projectId)
    if (success) {
      // Refresh data after analysis starts
      setTimeout(() => void refresh(), 2000)
    }
    return success
  }, [projectId, refresh])

  const toggleStar = useCallback(() => {
    if (!project) return
    setProject({ ...project, starred: !project.starred })
    // TODO: Persist to backend
  }, [project])

  return {
    project,
    profile,
    loading,
    error,
    refresh,
    runAnalysis,
    toggleStar,
  }
}

// Hook for fetching project analyses
export function useProjectAnalyses(projectId: string | undefined) {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchAnalyses = useCallback(async () => {
    if (!projectId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/dashboard/projects/${projectId}/analyses`)
      if (!response.ok) {
        if (response.status === 404) {
          setAnalyses([])
          return
        }
        throw new Error("Failed to fetch analyses")
      }
      const data = await response.json()
      setAnalyses(data.analyses || [])
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch analyses"))
      // Set mock data for development
      setAnalyses([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void fetchAnalyses()
  }, [fetchAnalyses])

  return { analyses, loading, error, refresh: fetchAnalyses }
}

// Hook for fetching project branches
export function useProjectBranches(projectId: string | undefined) {
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchBranches = useCallback(async () => {
    if (!projectId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/dashboard/projects/${projectId}/branches`)
      if (!response.ok) {
        if (response.status === 404) {
          setBranches([])
          return
        }
        throw new Error("Failed to fetch branches")
      }
      const data = await response.json()
      setBranches(data.branches || [])
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch branches"))
      setBranches([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void fetchBranches()
  }, [fetchBranches])

  return { branches, loading, error, refresh: fetchBranches }
}

// Hook for fetching project quality metrics
export function useProjectQuality(projectId: string | undefined) {
  const [quality, setQuality] = useState<QualityMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchQuality = useCallback(async () => {
    if (!projectId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Use the profile endpoint which contains quality data
      const profile = await fetchProjectProfile(projectId)
      if (profile?.quality) {
        setQuality({
          overallScore: profile.quality.code_quality_score,
          metrics: {
            testCoverage: profile.quality.test_coverage_estimated,
            documentation: profile.quality.has_documentation ? 80 : 20,
          },
          checklist: {
            hasTests: profile.quality.has_tests,
            hasCICD: profile.quality.has_ci_cd,
            hasDocumentation: profile.quality.has_documentation,
            hasLinting: profile.quality.linting_tools.length > 0,
            hasSecurityScanning: false,
          },
          securityIssues: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
          },
        })
      } else {
        setQuality(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch quality"))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void fetchQuality()
  }, [fetchQuality])

  return { quality, loading, error, refresh: fetchQuality }
}

// Hook for fetching project dependencies
export function useProjectDependencies(projectId: string | undefined) {
  const [dependencies, setDependencies] = useState<DependencySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchDependencies = useCallback(async () => {
    if (!projectId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Use the profile endpoint which contains dependency data
      const profile = await fetchProjectProfile(projectId)
      if (profile?.dependencies) {
        setDependencies({
          totalCount: profile.dependencies.external_dependencies_count + profile.dependencies.dev_dependencies_count,
          productionCount: profile.dependencies.production_dependencies_count,
          devCount: profile.dependencies.dev_dependencies_count,
          outdatedCount: 0, // Would need separate API
          vulnerableCount: profile.dependencies.security_vulnerabilities_count,
          packageManagers: profile.dependencies.dependency_managers,
          vulnerabilities: {
            critical: 0,
            high: 0,
            medium: 0,
            low: profile.dependencies.security_vulnerabilities_count,
          },
        })
      } else {
        setDependencies(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch dependencies"))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void fetchDependencies()
  }, [fetchDependencies])

  return { dependencies, loading, error, refresh: fetchDependencies }
}

// Clear all project-related caches
export function clearProjectCaches(projectId?: string): void {
  if (projectId) {
    cache.delete(`project_detail_${projectId}`)
  } else {
    cache.clear()
  }
}
