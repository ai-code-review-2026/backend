export const APP_ROLES = ["admin", "tech_lead", "developer"] as const

export type AppRole = (typeof APP_ROLES)[number]

export const REVIEW_ROLES = ["admin", "tech_lead"] as const
export type ReviewRole = (typeof REVIEW_ROLES)[number]

export const PROJECT_SETTINGS_WRITE_ROLES = ["admin", "tech_lead"] as const
export type ProjectSettingsWriteRole = (typeof PROJECT_SETTINGS_WRITE_ROLES)[number]

export const ROLE_DEFAULT_PERMISSIONS: Record<AppRole, string[]> = {
  admin: [
    "admin.read",
    "admin.write",
    "analyses.create",
    "analyses.read",
    "analyses.write",
    "assignments.create",
    "assignments.modify",
    "assignments.view_all",
    "assignments.view_own",
    "comments.create",
    "comments.edit",
    "comments.read",
    "comments.reply",
    "comments.resolve",
    "integrations.read",
    "integrations.write",
    "metrics.read_self",
    "metrics.read_team",
    "observability.read",
    "organizations.read",
    "organizations.write",
    "project_roles.read",
    "project_roles.write",
    "project_settings.audit",
    "project_settings.read",
    "project_settings.write",
    "projects.read",
    "projects.update",
    "repositories.create",
    "repositories.read",
    "reviews.approve",
    "reviews.assign",
    "reviews.block",
    "reviews.bulk_action",
    "reviews.claim",
    "reviews.delegate",
    "reviews.request_changes",
    "reviews.warn",
    "role_permissions.read",
    "role_permissions.write",
    "teams.create",
    "teams.delete",
    "teams.manage_members",
    "teams.read",
    "teams.update",
    "templates.create",
    "templates.use",
    "threads.create",
    "threads.moderate",
    "threads.participate",
    "users.manage",
  ],
  tech_lead: [
    "analyses.create",
    "analyses.read",
    "analyses.write",
    "assignments.create",
    "assignments.modify",
    "assignments.view_all",
    "assignments.view_own",
    "comments.create",
    "comments.edit",
    "comments.read",
    "comments.reply",
    "comments.resolve",
    "metrics.read_self",
    "metrics.read_team",
    "organizations.read",
    "project_roles.read",
    "project_roles.write",
    "project_settings.audit",
    "project_settings.read",
    "project_settings.write",
    "projects.read",
    "projects.update",
    "repositories.create",
    "repositories.read",
    "reviews.approve",
    "reviews.assign",
    "reviews.block",
    "reviews.bulk_action",
    "reviews.claim",
    "reviews.delegate",
    "reviews.request_changes",
    "reviews.warn",
    "teams.create",
    "teams.delete",
    "teams.manage_members",
    "teams.read",
    "teams.update",
    "templates.create",
    "templates.use",
    "threads.create",
    "threads.moderate",
    "threads.participate",
  ],
  developer: [
    "analyses.create",
    "analyses.read",
    "assignments.view_own",
    "comments.read",
    "metrics.read_self",
    "projects.read",
    "repositories.read",
  ],
}

const ROLE_ALIASES: Record<string, AppRole> = {
  admin: "admin",
  administrator: "admin",
  owner: "admin",
  superadmin: "admin",
  "super-admin": "admin",
  super_admin: "admin",

  tech_lead: "tech_lead",
  "tech-lead": "tech_lead",
  techlead: "tech_lead",
  lead: "tech_lead",
  team_lead: "tech_lead",
  "team-lead": "tech_lead",
  reviewer: "tech_lead",
  review: "tech_lead",
  "code-reviewer": "tech_lead",
  code_reviewer: "tech_lead",
  reviewer_lead: "tech_lead",
  "reviewer-lead": "tech_lead",
  lead_reviewer: "tech_lead",
  "lead-reviewer": "tech_lead",
  reviewer_senior: "tech_lead",
  "reviewer-senior": "tech_lead",
  senior_reviewer: "tech_lead",
  "senior-reviewer": "tech_lead",
  reviewer_junior: "tech_lead",
  "reviewer-junior": "tech_lead",
  junior_reviewer: "tech_lead",
  "junior-reviewer": "tech_lead",

  developer: "developer",
  dev: "developer",
  member: "developer",
  user: "developer",
  viewer: "developer",
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null
  }
  return value as Record<string, unknown>
}

function hasValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0
  }
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return value !== null && value !== undefined
}

export function getRolePriority(role: AppRole): number {
  switch (role) {
    case "admin":
      return 300
    case "tech_lead":
      return 200
    case "developer":
      return 100
    default:
      return 0
  }
}

export function getHigherRole(role1: AppRole, role2: AppRole): AppRole {
  return getRolePriority(role1) >= getRolePriority(role2) ? role1 : role2
}

export function normalizeRole(value: unknown): AppRole {
  if (Array.isArray(value)) {
    return value.reduce<AppRole>((resolved, item) => {
      const next = normalizeRole(item)
      return getHigherRole(resolved, next)
    }, "developer")
  }

  if (typeof value !== "string") {
    return "developer"
  }

  let normalized = value.trim().toLowerCase()
  if (normalized.startsWith("org:")) {
    normalized = normalized.slice(4)
  }

  return ROLE_ALIASES[normalized] ?? "developer"
}

export function extractRoleFromClaims(sessionClaims: unknown): AppRole {
  const claims = asRecord(sessionClaims)
  if (!claims) {
    return "developer"
  }

  const metadata = asRecord(claims.metadata)
  const publicMetadata = asRecord(claims.publicMetadata ?? claims.public_metadata)
  const appMetadata = asRecord(claims.appMetadata ?? claims.app_metadata)
  const unsafeMetadata = asRecord(claims.unsafeMetadata ?? claims.unsafe_metadata)

  const candidates: unknown[] = [
    claims.role,
    claims.roles,
    claims.org_role,
    metadata?.role,
    publicMetadata?.role,
    appMetadata?.role,
    unsafeMetadata?.role,
  ]

  for (const candidate of candidates) {
    if (!hasValue(candidate)) {
      continue
    }
    return normalizeRole(candidate)
  }

  return "developer"
}

export function isAdmin(role: AppRole): boolean {
  return role === "admin"
}

export function isTechLead(role: AppRole): boolean {
  return role === "tech_lead"
}

export function isReviewer(role: AppRole): boolean {
  return role === "tech_lead" || role === "admin"
}

export function isReviewerLead(role: AppRole): boolean {
  return role === "tech_lead" || role === "admin"
}

export function isReviewerSeniorOrLead(role: AppRole): boolean {
  return role === "tech_lead" || role === "admin"
}

export function canReview(role: AppRole): boolean {
  return REVIEW_ROLES.includes(role as ReviewRole)
}

export function canModifyProjectSettings(role: AppRole): boolean {
  return PROJECT_SETTINGS_WRITE_ROLES.includes(role as ProjectSettingsWriteRole)
}

export function getRoleHomePath(role: AppRole): string {
  switch (role) {
    case "admin":
      return "/dashboard/admin"
    case "tech_lead":
      return "/dashboard/lead"
    default:
      return "/dashboard/developer"
  }
}

export function formatRoleLabel(role: AppRole): string {
  switch (role) {
    case "admin":
      return "Admin"
    case "tech_lead":
      return "Tech Lead"
    default:
      return "Developer"
  }
}

export function hasPermission(userPermissions: readonly string[], permission: string): boolean {
  return userPermissions.includes(permission)
}

export function hasAnyPermission(userPermissions: readonly string[], permissions: readonly string[]): boolean {
  return permissions.some((permission) => userPermissions.includes(permission))
}

export function getDefaultPermissionsForRole(role: AppRole): string[] {
  return ROLE_DEFAULT_PERMISSIONS[role]
}
