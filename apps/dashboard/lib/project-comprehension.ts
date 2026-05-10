/**
 * Client-side API functions for project comprehension and RAG queries
 */

// Project Comprehension API Types
export interface ProjectProfile {
  repo_id: string
  org_id?: string
  context_version: number
  analysis_status: "analyzing" | "completed" | "failed"
  created_at: string
  last_analyzed_at: string
  last_context_update_at?: string
  analysis_error?: string
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

export interface ContextStatus {
  is_stale: boolean
  status: string
  age_hours: number
  reason?: string
  recommended_action: string
  refresh_priority: number
}

// RAG Query API Types
export interface RAGQueryRequest {
  query: string
  repo_id?: string
  org_id?: string
  context?: {
    file_path?: string
    line_range?: [number, number]
    commit_sha?: string
  }
}

export interface AgentResult {
  agent_id: string
  agent_name: string
  success: boolean
  content?: string
  citations?: Array<{
    source: string
    content: string
    score: number
  }>
  error?: string
  execution_time_ms: number
}

export interface RAGQueryResponse {
  request_id: string
  results: AgentResult[]
  synthesis?: {
    content: string
    confidence: number
    sources_used: number
  }
  total_execution_time_ms: number
}

// Cache configuration
const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const CONTEXT_CACHE_TTL_MS = 2 * 60 * 1000 // 2 minutes

// Cache storage
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>()

function getCachedData<T>(key: string): T | null {
  const cached = cache.get(key)
  if (!cached) return null

  const now = Date.now()
  if (now - cached.timestamp > cached.ttl) {
    cache.delete(key)
    return null
  }

  return cached.data as T
}

function setCachedData<T>(key: string, data: T, ttl: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttl })
}

// Project Comprehension API
export async function fetchProjectProfile(repoId: string): Promise<ProjectProfile | null> {
  const cacheKey = `project_profile_${repoId}`
  const cached = getCachedData<ProjectProfile>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetch(`/api/dashboard/projects/${repoId}/profile`)
    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`Failed to fetch project profile: ${response.status}`)
    }

    const data = await response.json()
    setCachedData(cacheKey, data.profile, PROJECT_CACHE_TTL_MS)
    return data.profile
  } catch (error) {
    console.error("Error fetching project profile:", error)
    return null
  }
}

export async function analyzeProject(repoId: string, repoPath?: string): Promise<boolean> {
  try {
    const body = repoPath ? JSON.stringify({ repo_path: repoPath }) : undefined
    const response = await fetch(`/api/dashboard/projects/${repoId}/analyze`, {
      method: "POST",
      headers: repoPath ? { "Content-Type": "application/json" } : {},
      body,
    })

    if (!response.ok) {
      throw new Error(`Failed to start project analysis: ${response.status}`)
    }

    // Clear cache to force refresh
    cache.delete(`project_profile_${repoId}`)
    cache.delete(`context_status_${repoId}`)

    return true
  } catch (error) {
    console.error("Error starting project analysis:", error)
    return false
  }
}

export async function generateProjectDescription(repoId: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/dashboard/projects/${repoId}/description`, {
      method: "POST",
    })

    if (!response.ok) {
      throw new Error(`Failed to generate description: ${response.status}`)
    }

    const data = await response.json()

    // Clear profile cache to get updated description
    cache.delete(`project_profile_${repoId}`)

    return data.description
  } catch (error) {
    console.error("Error generating project description:", error)
    return null
  }
}

export async function fetchContextStatus(repoId: string): Promise<ContextStatus | null> {
  const cacheKey = `context_status_${repoId}`
  const cached = getCachedData<ContextStatus>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetch(`/api/dashboard/projects/${repoId}/context/status`)
    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`Failed to fetch context status: ${response.status}`)
    }

    const data = await response.json()
    setCachedData(cacheKey, data.status, CONTEXT_CACHE_TTL_MS)
    return data.status
  } catch (error) {
    console.error("Error fetching context status:", error)
    return null
  }
}

export async function refreshProjectContext(repoId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/dashboard/projects/${repoId}/context/refresh`, {
      method: "POST",
    })

    if (!response.ok) {
      throw new Error(`Failed to refresh context: ${response.status}`)
    }

    // Clear caches
    cache.delete(`project_profile_${repoId}`)
    cache.delete(`context_status_${repoId}`)

    return true
  } catch (error) {
    console.error("Error refreshing project context:", error)
    return false
  }
}

// RAG Query API
export async function executeRAGQuery(request: RAGQueryRequest): Promise<RAGQueryResponse | null> {
  try {
    const response = await fetch("/api/dashboard/rag/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`Failed to execute RAG query: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error("Error executing RAG query:", error)
    return null
  }
}

export async function queryCodeContext(query: string, repoId: string, filePath?: string): Promise<AgentResult | null> {
  try {
    const body: any = { query, repo_id: repoId }
    if (filePath) {
      body.context = { file_path: filePath }
    }

    const response = await fetch("/api/dashboard/rag/query/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Failed to query code context: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error("Error querying code context:", error)
    return null
  }
}

export async function queryDocumentation(query: string, repoId?: string): Promise<AgentResult | null> {
  try {
    const body: any = { query }
    if (repoId) {
      body.repo_id = repoId
    }

    const response = await fetch("/api/dashboard/rag/query/documentation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Failed to query documentation: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error("Error querying documentation:", error)
    return null
  }
}

export async function analyzeDiff(diffContent: string, repoId: string): Promise<RAGQueryResponse | null> {
  try {
    const response = await fetch("/api/dashboard/rag/analyze/diff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        diff_content: diffContent,
        repo_id: repoId,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to analyze diff: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error("Error analyzing diff:", error)
    return null
  }
}

export async function getAgentsStatus(): Promise<Record<string, boolean> | null> {
  try {
    const response = await fetch("/api/dashboard/rag/agents/status")

    if (!response.ok) {
      throw new Error(`Failed to get agents status: ${response.status}`)
    }

    const data = await response.json()
    return data.agents_status
  } catch (error) {
    console.error("Error getting agents status:", error)
    return null
  }
}

// Utility functions
export function clearProjectCache(repoId: string): void {
  cache.delete(`project_profile_${repoId}`)
  cache.delete(`context_status_${repoId}`)
}

export function clearAllCache(): void {
  cache.clear()
}