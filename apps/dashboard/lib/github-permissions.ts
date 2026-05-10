// Service for validating GitHub permissions before import

export interface GitHubPermissions {
  admin: boolean
  maintain: boolean
  push: boolean
  triage: boolean
  pull: boolean
}

export interface RepositoryPermissions {
  full_name: string
  permissions: GitHubPermissions
  user_role: "owner" | "admin" | "maintainer" | "collaborator" | "none"
  can_import: boolean
  can_manage_webhooks: boolean
  can_invite_collaborators: boolean
  organization_role?: "owner" | "admin" | "member" | "none"
  missing_permissions: string[]
  warnings: string[]
}

export interface PermissionValidationResult {
  valid: boolean
  permissions: RepositoryPermissions
  requirements: {
    minimum_access: "admin" | "maintain" | "push"
    needs_webhook_access: boolean
    needs_member_management: boolean
  }
  recommendations: string[]
}

class GitHubPermissionValidator {
  private baseUrl = "/api/dashboard/github/permissions"

  // Validate permissions for repository import
  async validateImportPermissions(repoFullName: string): Promise<PermissionValidationResult> {
    const response = await fetch(`${this.baseUrl}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository: repoFullName })
    })

    if (!response.ok) {
      const raw = await response.text()
      let errorMessage = `HTTP ${response.status}`
      try {
        const parsed = JSON.parse(raw) as { error?: string }
        errorMessage = parsed.error || errorMessage
      } catch {
        errorMessage = raw || errorMessage
      }
      throw new Error(errorMessage)
    }

    return response.json()
  }

  // Get detailed permissions for a repository
  async getRepositoryPermissions(repoFullName: string): Promise<RepositoryPermissions> {
    const response = await fetch(`${this.baseUrl}/check`, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository: repoFullName })
    })

    if (!response.ok) {
      const raw = await response.text()
      let errorMessage = `HTTP ${response.status}`
      try {
        const parsed = JSON.parse(raw) as { error?: string }
        errorMessage = parsed.error || errorMessage
      } catch {
        errorMessage = raw || errorMessage
      }
      throw new Error(errorMessage)
    }

    return response.json()
  }

  // Check if user can manage webhooks for repository
  async canManageWebhooks(repoFullName: string): Promise<boolean> {
    try {
      const permissions = await this.getRepositoryPermissions(repoFullName)
      return permissions.can_manage_webhooks
    } catch {
      return false
    }
  }

  // Check if user can invite collaborators
  async canInviteCollaborators(repoFullName: string): Promise<boolean> {
    try {
      const permissions = await this.getRepositoryPermissions(repoFullName)
      return permissions.can_invite_collaborators
    } catch {
      return false
    }
  }

  // Validate permissions and provide detailed feedback
  validatePermissions(permissions: GitHubPermissions, isOwner: boolean = false): {
    canImport: boolean
    canManageWebhooks: boolean
    canInviteCollaborators: boolean
    missingPermissions: string[]
    warnings: string[]
    recommendations: string[]
  } {
    const missing: string[] = []
    const warnings: string[] = []
    const recommendations: string[] = []

    // Check minimum permissions for import
    const canImport = isOwner || permissions.admin || permissions.maintain
    if (!canImport) {
      missing.push("Admin ou Maintain access requis pour importer le repository")
      recommendations.push("Demandez à un admin du repository de vous donner les permissions Admin ou Maintain")
    }

    // Check webhook management
    const canManageWebhooks = isOwner || permissions.admin
    if (!canManageWebhooks) {
      warnings.push("Permissions Admin requises pour gérer les webhooks")
      recommendations.push("Pour la synchronisation automatique, demandez les permissions Admin")
    }

    // Check collaborator management  
    const canInviteCollaborators = isOwner || permissions.admin
    if (!canInviteCollaborators) {
      warnings.push("Permissions Admin requises pour inviter des collaborateurs")
      recommendations.push("Pour inviter automatiquement les membres, demandez les permissions Admin")
    }

    // Additional checks for private repos
    if (!permissions.push) {
      missing.push("Permission Push requise pour accéder au code")
    }

    return {
      canImport,
      canManageWebhooks,
      canInviteCollaborators,
      missingPermissions: missing,
      warnings,
      recommendations
    }
  }

  // Get permission requirements explanation
  getPermissionRequirements(): {
    minimum: { level: string; description: string }
    recommended: { level: string; description: string }
    optional: { level: string; description: string }[]
  } {
    return {
      minimum: {
        level: "Maintain",
        description: "Requis pour importer le repository et accéder aux branches/commits"
      },
      recommended: {
        level: "Admin", 
        description: "Recommandé pour une expérience complète avec webhooks et gestion des membres"
      },
      optional: [
        {
          level: "Owner",
          description: "Accès complet à toutes les fonctionnalités du repository"
        }
      ]
    }
  }
}

export const permissionValidator = new GitHubPermissionValidator()
