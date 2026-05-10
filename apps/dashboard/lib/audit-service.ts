// Audit service for tracking user actions

import { AuditAction, AuditActionType, AuditActionDetails, AuditMetadata } from "@/types/audit"

class AuditService {
  private baseUrl = "/api/audit"

  // Record an audit action
  async recordAction(
    actionType: AuditActionType,
    resourceType: AuditAction["resource_type"],
    resourceId: string,
    details: AuditActionDetails = {},
    metadata: AuditMetadata = {}
  ): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: actionType,
          resource_type: resourceType,
          resource_id: resourceId,
          details,
          metadata: {
            ...metadata,
            request_id: this.generateRequestId(),
            timestamp: new Date().toISOString()
          }
        })
      })
    } catch (error) {
      // Don't throw errors for audit failures to avoid disrupting user experience
      console.error("Failed to record audit action:", error)
    }
  }

  // Get audit trail for a resource
  async getAuditTrail(
    resourceType: AuditAction["resource_type"],
    resourceId: string,
    options: {
      limit?: number
      offset?: number
      actionTypes?: AuditActionType[]
      dateFrom?: string
      dateTo?: string
    } = {}
  ): Promise<{ items: AuditAction[]; total: number }> {
    const params = new URLSearchParams({
      resource_type: resourceType,
      resource_id: resourceId,
      limit: (options.limit || 50).toString(),
      offset: (options.offset || 0).toString()
    })

    if (options.actionTypes?.length) {
      params.append("action_types", options.actionTypes.join(","))
    }
    if (options.dateFrom) {
      params.append("date_from", options.dateFrom)
    }
    if (options.dateTo) {
      params.append("date_to", options.dateTo)
    }

    const response = await fetch(`${this.baseUrl}/trail?${params}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch audit trail: ${response.statusText}`)
    }

    return response.json()
  }

  // Get audit statistics
  async getAuditStats(
    resourceType?: AuditAction["resource_type"],
    resourceId?: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<{
    total_actions: number
    actions_by_type: { [key: string]: number }
    actions_by_user: { user_id: string; user_email: string; count: number }[]
    recent_actions: AuditAction[]
  }> {
    const params = new URLSearchParams()
    if (resourceType) params.append("resource_type", resourceType)
    if (resourceId) params.append("resource_id", resourceId)
    if (dateFrom) params.append("date_from", dateFrom)
    if (dateTo) params.append("date_to", dateTo)

    const response = await fetch(`${this.baseUrl}/stats?${params}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch audit stats: ${response.statusText}`)
    }

    return response.json()
  }

  // Helper methods for common actions
  async recordProjectImport(
    projectId: string,
    githubRepo: string,
    stats: AuditActionDetails["import_stats"],
    metadata: Partial<AuditMetadata> = {}
  ) {
    await this.recordAction(
      "project.imported",
      "project",
      projectId,
      { source: "github_import", import_stats: stats },
      { github_repository: githubRepo, ...metadata }
    )
  }

  async recordMemberInvitation(
    projectId: string,
    memberGithubLogin: string,
    role: string,
    invitationResult: "success" | "failed" | "already_member",
    metadata: Partial<AuditMetadata> = {}
  ) {
    await this.recordAction(
      "member.invited",
      "member",
      memberGithubLogin,
      { 
        source: "github_import", 
        after: { role, invitation_result: invitationResult }
      },
      { project_name: projectId, ...metadata }
    )
  }

  async recordWebhookEvent(
    repositoryId: string,
    webhookEvent: string,
    githubActor: string,
    details: any,
    metadata: Partial<AuditMetadata> = {}
  ) {
    await this.recordAction(
      "repository.synchronized",
      "repository", 
      repositoryId,
      { source: "github_webhook", ...details },
      { github_actor: githubActor, ...metadata }
    )
  }

  async recordRoleUpdate(
    memberId: string,
    projectId: string,
    oldRole: string,
    newRole: string,
    reason?: string,
    metadata: Partial<AuditMetadata> = {}
  ) {
    await this.recordAction(
      "member.role.updated",
      "member",
      memberId,
      {
        source: "manual",
        before: { role: oldRole },
        after: { role: newRole },
        reason
      },
      { project_name: projectId, ...metadata }
    )
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export const auditService = new AuditService()