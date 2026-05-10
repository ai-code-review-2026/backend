/**
 * Granular permissions system for team members.
 * These permissions can override role-based permissions on a per-user basis.
 */

export const AVAILABLE_PERMISSIONS = {
  // Code & Repository
  "repo.read": "View repository code and files",
  "repo.write": "Modify repository files",
  "repo.delete": "Delete files from repository",
  "repo.settings": "Manage repository settings",
  
  // Branches
  "branch.create": "Create new branches",
  "branch.delete": "Delete branches",
  "branch.merge": "Merge branches",
  "branch.protection": "Manage branch protection rules",
  
  // Pull Requests & Reviews
  "pr.create": "Create pull requests",
  "pr.review": "Review pull requests",
  "pr.approve": "Approve pull requests",
  "pr.merge": "Merge pull requests",
  "pr.close": "Close pull requests",
  
  // Analysis & Reviews
  "analysis.read": "View code analysis results",
  "analysis.create": "Trigger code analysis",
  "analysis.approve": "Approve analysis results",
  "analysis.reject": "Reject analysis results",
  
  // Comments & Feedback
  "comment.create": "Add comments",
  "comment.edit": "Edit own comments",
  "comment.edit_all": "Edit all comments",
  "comment.delete": "Delete comments",
  "comment.resolve": "Resolve comment threads",
  
  // Deployment
  "deploy.trigger": "Trigger deployments",
  "deploy.approve": "Approve deployments",
  "deploy.rollback": "Rollback deployments",
  
  // Team Management
  "team.read": "View team members",
  "team.invite": "Invite team members",
  "team.remove": "Remove team members",
  "team.edit_roles": "Edit member roles",
  "team.edit_permissions": "Edit member permissions",
  
  // Project Settings
  "project.settings": "Manage project settings",
  "project.delete": "Delete project",
  "project.archive": "Archive project",
  
  // Knowledge Base
  "kb.read": "View knowledge base",
  "kb.write": "Contribute to knowledge base",
  "kb.delete": "Delete knowledge base entries",
  
  // Security
  "security.read": "View security findings",
  "security.manage": "Manage security policies",
  "security.override": "Override security checks",
  
  // Integrations
  "integration.read": "View integrations",
  "integration.manage": "Manage integrations (Jira, Slack, etc.)",
  
  // Admin
  "admin.users": "Manage platform users",
  "admin.audit": "View audit logs",
  "admin.observability": "Access observability tools",
} as const

export type Permission = keyof typeof AVAILABLE_PERMISSIONS

// Permission categories for UI grouping
export const PERMISSION_CATEGORIES = {
  "Code & Repository": [
    "repo.read",
    "repo.write",
    "repo.delete",
    "repo.settings",
  ],
  "Branches": [
    "branch.create",
    "branch.delete",
    "branch.merge",
    "branch.protection",
  ],
  "Pull Requests": [
    "pr.create",
    "pr.review",
    "pr.approve",
    "pr.merge",
    "pr.close",
  ],
  "Analysis": [
    "analysis.read",
    "analysis.create",
    "analysis.approve",
    "analysis.reject",
  ],
  "Comments": [
    "comment.create",
    "comment.edit",
    "comment.edit_all",
    "comment.delete",
    "comment.resolve",
  ],
  "Deployment": [
    "deploy.trigger",
    "deploy.approve",
    "deploy.rollback",
  ],
  "Team": [
    "team.read",
    "team.invite",
    "team.remove",
    "team.edit_roles",
    "team.edit_permissions",
  ],
  "Project": [
    "project.settings",
    "project.delete",
    "project.archive",
  ],
  "Knowledge Base": [
    "kb.read",
    "kb.write",
    "kb.delete",
  ],
  "Security": [
    "security.read",
    "security.manage",
    "security.override",
  ],
  "Integrations": [
    "integration.read",
    "integration.manage",
  ],
  "Admin": [
    "admin.users",
    "admin.audit",
    "admin.observability",
  ],
} as const

// Default permissions by role
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    // All permissions
    ...Object.keys(AVAILABLE_PERMISSIONS) as Permission[],
  ],
  tech_lead: [
    "repo.read",
    "repo.write",
    "branch.create",
    "pr.create",
    "pr.review",
    "pr.approve",
    "pr.merge",
    "analysis.read",
    "analysis.approve",
    "analysis.reject",
    "comment.create",
    "comment.edit",
    "comment.delete",
    "comment.resolve",
    "team.read",
    "kb.read",
    "kb.write",
    "security.read",
    "integration.read",
  ],
  developer: [
    "repo.read",
    "repo.write",
    "branch.create",
    "pr.create",
    "analysis.read",
    "analysis.create",
    "comment.create",
    "comment.edit",
    "team.read",
    "kb.read",
    "security.read",
    "integration.read",
  ],
}

/**
 * Check if a user has a specific permission
 */
export function hasPermission(
  userPermissions: string[],
  requiredPermission: Permission
): boolean {
  return userPermissions.includes(requiredPermission)
}

/**
 * Check if a user has ALL of the specified permissions
 */
export function hasAllPermissions(
  userPermissions: string[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.every((p) => userPermissions.includes(p))
}

/**
 * Check if a user has ANY of the specified permissions
 */
export function hasAnyPermission(
  userPermissions: string[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.some((p) => userPermissions.includes(p))
}

/**
 * Get permissions for a role with optional overrides
 */
export function getEffectivePermissions(
  role: string,
  customPermissions: string[] = []
): Permission[] {
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.developer
  
  // Merge role permissions with custom permissions (custom permissions override)
  const allPermissions = new Set([...rolePermissions, ...customPermissions])
  
  return Array.from(allPermissions) as Permission[]
}
