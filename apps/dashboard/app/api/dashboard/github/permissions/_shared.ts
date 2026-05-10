import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { getGithubUser, requestGithub, resolveGithubTokenForUser } from "@/lib/github-client"
import { GitHubApiError } from "@/lib/server/github/client"

type GitHubPermissions = {
  admin: boolean
  maintain: boolean
  push: boolean
  triage: boolean
  pull: boolean
}

export type RepositoryPermissionsPayload = {
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

export type PermissionValidationPayload = {
  valid: boolean
  permissions: RepositoryPermissionsPayload
  requirements: {
    minimum_access: "admin" | "maintain" | "push"
    needs_webhook_access: boolean
    needs_member_management: boolean
  }
  recommendations: string[]
}

type GitHubRepositoryResponse = {
  full_name?: string
  owner?: {
    login?: string
    type?: string
  }
  permissions?: Partial<GitHubPermissions>
}

type GitHubMembershipResponse = {
  role?: string
}

type RepoRequestBody = {
  repository?: string
}

function emptyPermissions(): GitHubPermissions {
  return {
    admin: false,
    maintain: false,
    push: false,
    triage: false,
    pull: false,
  }
}

function normalizeRepoFullName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || !trimmed.includes("/")) {
    return null
  }
  return trimmed
}

function deriveUserRole(
  repoOwnerLogin: string | null,
  githubLogin: string | null,
  permissions: GitHubPermissions,
): RepositoryPermissionsPayload["user_role"] {
  if (
    repoOwnerLogin &&
    githubLogin &&
    repoOwnerLogin.trim().toLowerCase() === githubLogin.trim().toLowerCase()
  ) {
    return "owner"
  }
  if (permissions.admin) {
    return "admin"
  }
  if (permissions.maintain) {
    return "maintainer"
  }
  if (permissions.push || permissions.triage || permissions.pull) {
    return "collaborator"
  }
  return "none"
}

function buildValidationPayload(
  fullName: string,
  permissions: GitHubPermissions,
  githubLogin: string | null,
  repoOwnerLogin: string | null,
  organizationRole?: RepositoryPermissionsPayload["organization_role"],
): PermissionValidationPayload {
  const userRole = deriveUserRole(repoOwnerLogin, githubLogin, permissions)
  const isOwner = userRole === "owner"
  const canImport = isOwner || permissions.admin || permissions.maintain
  const canManageWebhooks = isOwner || permissions.admin
  const canInviteCollaborators = isOwner || permissions.admin

  const missingPermissions: string[] = []
  const warnings: string[] = []
  const recommendations: string[] = []

  if (!canImport) {
    missingPermissions.push("Admin ou Maintain access requis pour importer le repository")
    recommendations.push("Demandez un acces Admin ou Maintain sur ce repository GitHub")
  }

  if (!permissions.push) {
    missingPermissions.push("Permission Push requise pour acceder au code du repository")
  }

  if (!canManageWebhooks) {
    warnings.push("Permissions Admin requises pour gerer les webhooks")
    recommendations.push("Ajoutez l'acces Admin si vous voulez activer les webhooks automatiques")
  }

  if (!canInviteCollaborators) {
    warnings.push("Permissions Admin requises pour inviter des collaborateurs")
    recommendations.push("Ajoutez l'acces Admin si vous voulez inviter automatiquement les membres")
  }

  const payload: RepositoryPermissionsPayload = {
    full_name: fullName,
    permissions,
    user_role: userRole,
    can_import: canImport,
    can_manage_webhooks: canManageWebhooks,
    can_invite_collaborators: canInviteCollaborators,
    organization_role: organizationRole,
    missing_permissions: missingPermissions,
    warnings,
  }

  return {
    valid: canImport,
    permissions: payload,
    requirements: {
      minimum_access: "maintain",
      needs_webhook_access: true,
      needs_member_management: true,
    },
    recommendations,
  }
}

async function resolveOrganizationRole(
  ownerLogin: string,
  ownerType: string | null,
  token: string,
): Promise<RepositoryPermissionsPayload["organization_role"]> {
  if (ownerType !== "Organization") {
    return undefined
  }

  try {
    const membership = await requestGithub<GitHubMembershipResponse>(
      `/user/memberships/orgs/${encodeURIComponent(ownerLogin)}`,
      {},
      token,
    )
    const role = membership?.role?.trim().toLowerCase()
    if (role === "admin" || role === "member") {
      return role
    }
    return "none"
  } catch (error: unknown) {
    if ((error as { status?: number }).status === 404) {
      return "none"
    }
    return undefined
  }
}

export async function readRepositoryFromRequest(request: Request): Promise<string | NextResponse> {
  const body = (await request.json().catch(() => null)) as RepoRequestBody | null
  const repository = normalizeRepoFullName(body?.repository)
  if (!repository) {
    return NextResponse.json(
      { error: "repository is required and must use the format owner/repo" },
      { status: 400 },
    )
  }
  return repository
}

export async function resolvePermissionValidation(
  repoFullName: string,
): Promise<PermissionValidationPayload | NextResponse> {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await resolveGithubTokenForUser(userId)
  if (!token) {
    return NextResponse.json(
      { error: "GitHub account not connected in Clerk OAuth" },
      { status: 401 },
    )
  }

  const githubUser = await getGithubUser(token).catch(() => null)
  const githubLogin =
    typeof githubUser?.login === "string" && githubUser.login.trim().length > 0
      ? githubUser.login.trim()
      : null

  let repository: GitHubRepositoryResponse
  try {
    repository = await requestGithub<GitHubRepositoryResponse>(
      `/repos/${repoFullName}`,
      {},
      token,
    )
  } catch (error: unknown) {
    const githubError = error as GitHubApiError
    return NextResponse.json(
      {
        error:
          githubError?.status === 404
            ? `Repository inaccessible: ${repoFullName}`
            : githubError?.message ?? "GitHub repository lookup failed",
      },
      { status: githubError?.status ?? 500 },
    )
  }

  const ownerLogin =
    typeof repository.owner?.login === "string" && repository.owner.login.trim().length > 0
      ? repository.owner.login.trim()
      : null
  const ownerType =
    typeof repository.owner?.type === "string" && repository.owner.type.trim().length > 0
      ? repository.owner.type.trim()
      : null

  const permissions: GitHubPermissions = {
    ...emptyPermissions(),
    ...(repository.permissions ?? {}),
  }

  const organizationRole = ownerLogin
    ? await resolveOrganizationRole(ownerLogin, ownerType, token)
    : undefined

  return buildValidationPayload(
    repository.full_name?.trim() || repoFullName,
    permissions,
    githubLogin,
    ownerLogin,
    organizationRole,
  )
}
