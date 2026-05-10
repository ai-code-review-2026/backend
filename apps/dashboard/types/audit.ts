// Types for audit trail system

export interface AuditAction {
  id: string
  timestamp: string
  actor_id: string
  actor_email: string
  action_type: AuditActionType
  resource_type: "project" | "repository" | "github_repository" | "member" | "organization" | "webhook"
  resource_id: string
  details: AuditActionDetails
  metadata: AuditMetadata
  ip_address?: string
  user_agent?: string
}

export type AuditActionType = 
  // Project actions
  | "project.created"
  | "project.imported"
  | "project.updated"
  | "project.deleted"
  // Repository actions
  | "repository.imported" 
  | "repository.synchronized"
  | "repository.webhook.created"
  | "repository.webhook.updated"
  | "repository.webhook.deleted"
  // GitHub actions
  | "github.permissions_validated"
  // Member actions
  | "member.invited"
  | "member.added"
  | "member.removed"
  | "member.role.updated"
  | "member.permissions.updated"
  // Organization actions
  | "organization.imported"
  | "organization.synchronized"

export interface AuditActionDetails {
  // Before/after states for updates
  before?: any
  after?: any
  // Additional context
  reason?: string
  source?: "manual" | "github_webhook" | "github_import" | "automated"
  // Import specific details
  import_stats?: {
    total_members: number
    invited_members: number
    existing_members: number
    failed_invitations: number
    branches_imported: number
    commits_imported: number
  }
}

export interface AuditMetadata {
  // GitHub context
  github_repository?: string
  github_organization?: string
  github_actor?: string
  // Platform context
  project_name?: string
  organization_id?: string
  team_id?: string
  // Request context
  request_id?: string
  session_id?: string
}