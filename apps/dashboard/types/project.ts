/**
 * Project-related type definitions
 * 
 * Simplified role system: admin, tech_lead, developer only
 */

// Project status types
export type ProjectStatus = "active" | "maintenance" | "archived"

// Project role types for team members - SIMPLIFIED
export type ProjectRole = "admin" | "tech_lead" | "developer"

// Language colors for UI consistency
export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-400",
  Go: "bg-cyan-500",
  Python: "bg-yellow-500",
  Dart: "bg-teal-500",
  "Node.js": "bg-green-500",
  Rust: "bg-orange-500",
  Java: "bg-red-500",
  "C#": "bg-purple-500",
  Ruby: "bg-red-400",
  PHP: "bg-indigo-400",
  Swift: "bg-orange-400",
  Kotlin: "bg-violet-500",
}

// Status configuration for UI
export const STATUS_CONFIG: Record<ProjectStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  maintenance: {
    label: "Maintenance",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  archived: {
    label: "Archived",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
}

// Role configuration for UI - SIMPLIFIED to 3 roles only
export const ROLE_CONFIG: Record<ProjectRole, { label: string; color: string; description: string }> = {
  admin: {
    label: "Admin",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    description: "Full project access and management",
  },
  tech_lead: {
    label: "Tech Lead",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    description: "Can lead reviews, assignments, and team operations",
  },
  developer: {
    label: "Developer",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    description: "Can view code and submit for review",
  },
}

// Team member interface
export interface ProjectTeamMember {
  id: string
  userId: string
  name: string
  email: string
  avatarUrl?: string
  role: ProjectRole
  organization?: {
    id: string
    name: string
  }
  joinedAt: string
}

// Project summary for list view
export interface ProjectSummary {
  id: string
  name: string
  description?: string
  language: string
  status: ProjectStatus
  starred: boolean
  lastActivity: string
  healthScore: number
  branches: number
  commits: number
  contributors: number
  coverage?: number
  openIssues?: number
  team?: string
}

// Project detail with full information
export interface ProjectDetail extends ProjectSummary {
  repoId: string
  repoUrl?: string
  defaultBranch?: string
  createdAt: string
  updatedAt: string
  organizationId?: string
  teamMembers: ProjectTeamMember[]
  settings?: {
    autoAnalysis: boolean
    protectedBranches: string[]
    requiredReviewers: number
  }
}

// Analysis summary for project analyses tab
export interface AnalysisSummary {
  id: string
  projectId: string
  type: "pull_request" | "commit" | "branch"
  referenceId: string // PR number, commit SHA, or branch name
  title: string
  status: "pending" | "in_progress" | "completed" | "failed"
  filesChanged: number
  linesAdded: number
  linesRemoved: number
  findings: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
  }
  author?: {
    name: string
    avatarUrl?: string
  }
  createdAt: string
  completedAt?: string
}

// Branch information
export interface BranchInfo {
  name: string
  type: "main" | "feature" | "release" | "hotfix" | "other"
  isProtected: boolean
  isDefault: boolean
  lastCommit: {
    sha: string
    message: string
    author: string
    date: string
  }
  aheadBehind?: {
    ahead: number
    behind: number
  }
  status?: "active" | "stale" | "merged"
}

// Quality metrics
export interface QualityMetrics {
  overallScore: number
  metrics: {
    testCoverage?: number
    codeComplexity?: number
    maintainability?: number
    documentation?: number
    security?: number
  }
  checklist: {
    hasTests: boolean
    hasCICD: boolean
    hasDocumentation: boolean
    hasLinting: boolean
    hasSecurityScanning: boolean
  }
  securityIssues: {
    critical: number
    high: number
    medium: number
    low: number
  }
}

// Dependency information
export interface DependencyInfo {
  name: string
  version: string
  latestVersion?: string
  type: "production" | "dev" | "peer"
  packageManager: string
  hasVulnerability: boolean
  vulnerabilitySeverity?: "critical" | "high" | "medium" | "low"
}

export interface DependencySummary {
  totalCount: number
  productionCount: number
  devCount: number
  outdatedCount: number
  vulnerableCount: number
  packageManagers: string[]
  vulnerabilities: {
    critical: number
    high: number
    medium: number
    low: number
  }
}
