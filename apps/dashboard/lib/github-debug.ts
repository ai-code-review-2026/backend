// Enhanced error logging and debugging utilities for GitHub push functionality
// This file helps debug the "Not Found" error in diff editor push operations

import { toast } from "sonner"

// Enhanced error types for better debugging
interface GitHubError extends Error {
  status?: number
  body?: unknown
  details?: unknown
  repository?: string
  operation?: string
}

// Comprehensive error logger for GitHub operations
export function logGitHubError(error: unknown, context: {
  operation: string
  repository?: string
  owner?: string
  repo?: string
  filePath?: string
  branch?: string
  additionalInfo?: Record<string, unknown>
}) {
  const typedError = error as GitHubError
  const fallbackMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "Unknown GitHub operation error"
  
  const errorInfo = {
    timestamp: new Date().toISOString(),
    operation: context.operation,
    repository: context.repository || `${context.owner}/${context.repo}`,
    filePath: context.filePath,
    branch: context.branch,
    status: typedError.status,
    message: typedError.message || fallbackMessage,
    details: typedError.details || typedError.body,
    ...context.additionalInfo
  }
  
  console.warn("[GitHub Operation Error]", errorInfo)
  
  // Enhanced error messages for common issues
  if (typedError.status === 404) {
    const causes = []
    if (!context.owner || !context.repo) {
      causes.push("Invalid repository format")
    }
    if (!context.filePath) {
      causes.push("Missing file path")
    }
    if (!context.branch) {
      causes.push("Missing branch information")
    }
    
    console.warn("[GitHub 404 Analysis]", {
      possibleCauses: causes,
      troubleshooting: {
        repositoryAccess: "Check if repository exists and is accessible",
        permissions: "Verify GitHub token has proper permissions",
        fileExists: "Confirm file exists on the specified branch",
        branchExists: "Verify branch exists in repository"
      }
    })
  }
}

// Repository coordinates validator
export function validateRepoCoordinates(repoString: string | null | undefined): {
  isValid: boolean
  owner?: string
  repo?: string
  error?: string
  normalized?: string
} {
  if (!repoString?.trim()) {
    return { isValid: false, error: "Repository string is empty" }
  }
  
  const raw = repoString.trim()
  const normalized = raw
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
  
  const parts = normalized.split("/").filter(part => part.length > 0)
  
  if (parts.length < 2) {
    return { 
      isValid: false, 
      error: "Invalid format. Expected owner/repo format",
      normalized 
    }
  }
  
  return {
    isValid: true,
    owner: parts[0],
    repo: parts[1],
    normalized
  }
}

// Enhanced GitHub API caller with better error handling
export async function callGitHubAPI(
  action: string,
  payload: unknown,
  context: { repository?: string; operation?: string } = {}
) {
  try {
    const response = await fetch("/api/dashboard/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        payload,
      }),
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      const error: GitHubError = new Error(data.error || `GitHub API ${action} failed`)
      error.status = response.status
      error.body = data
      error.repository = context.repository
      error.operation = context.operation || action
      throw error
    }
    
    return { response, data }
  } catch (error) {
    logGitHubError(error, {
      operation: context.operation || action,
      repository: context.repository,
      additionalInfo: { action, payload }
    })
    throw error
  }
}

// Repository health checker
export async function checkRepositoryHealth(owner: string, repo: string): Promise<{
  accessible: boolean
  exists: boolean
  hasWriteAccess: boolean
  errors: string[]
}> {
  const errors: string[] = []
  let accessible = false
  let exists = false
  let hasWriteAccess = false
  
  try {
    // Check repository access
    const { data: repoData } = await callGitHubAPI("get_repository", { owner, repo }, {
      repository: `${owner}/${repo}`,
      operation: "health-check"
    })
    
    if (repoData?.ok) {
      accessible = true
      exists = true
      hasWriteAccess = repoData.result?.permissions?.push || false
    }
  } catch (error) {
    const typedError = error as GitHubError
    if (typedError.status === 404) {
      errors.push("Repository not found or not accessible")
    } else if (typedError.status === 403) {
      errors.push("Permission denied - check GitHub token")
    } else {
      errors.push(typedError.message || "Unknown error")
    }
  }
  
  return { accessible, exists, hasWriteAccess, errors }
}

// User-friendly error messages
export function getReadableErrorMessage(error: GitHubError): string {
  if (error.status === 404) {
    return "Repository or file not found. Please check:\n• Repository exists and is accessible\n• File exists on the current branch\n• GitHub account has proper permissions"
  }
  
  if (error.status === 403) {
    return "Permission denied. Please:\n• Reconnect your GitHub account\n• Ensure you have write access to the repository"
  }
  
  if (error.status === 409) {
    return "File was modified on GitHub. Please refresh the page to get the latest version."
  }
  
  return error.message || "An unexpected error occurred"
}

// Show error toast with enhanced information
export function showGitHubErrorToast(error: GitHubError, context?: { operation?: string }) {
  const message = getReadableErrorMessage(error)
  const title = `GitHub ${context?.operation || 'Operation'} Failed`
  
  toast.error(title, {
    description: message,
  })
}

// Debug information collector for support
export function collectDebugInfo(analysis: any, repoCoordinates: any) {
  return {
    timestamp: new Date().toISOString(),
    analysis: {
      id: analysis?.id,
      repo: analysis?.repo,
      source: analysis?.source,
      hasRepo: !!analysis?.repo
    },
    repoCoordinates: {
      raw: repoCoordinates,
      parsed: validateRepoCoordinates(analysis?.repo)
    },
    userAgent: navigator?.userAgent,
    url: window?.location?.href
  }
}
