"use client"
/* eslint-disable react/no-unescaped-entities */

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Edit, RotateCcw, Search, Shield, UserCog, UserPlus, Users, X } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { GroupedPermissions } from "./GroupedPermissions"
import { ROLE_DEFAULT_PERMISSIONS } from "@/lib/roles"

type AdminUser = {
  id: string
  email: string
  displayName: string | null
  isActive: boolean
  roles: string[]
  permissions: string[]
  customPermissions?: string[]
  revokedPermissions?: string[]
}

type PermissionCatalogItem = {
  code: string
  description: string
  userCount: number
}

type UsersPayload = {
  items?: AdminUser[]
  permissions?: PermissionCatalogItem[]
  stats?: {
    totalUsers?: number
    admins?: number
    reviewers?: number
    developers?: number
    activeUsers?: number
  }
}

type IntegrationsPayload = {
  ciToken?: {
    exists?: boolean
    prefix?: string | null
    createdAt?: string | null
    revoked?: boolean
  }
}

type RolePermissionDetail = {
  id: string
  role_id: string
  permission_id: string
  permission_code: string
  permission_description: string
  enabled: boolean
}

type RolePermissionsPayload = {
  roles?: Array<{
    id: string
    code: string
    label: string
    is_system: boolean
    permissions: RolePermissionDetail[]
  }>
}

type RoleValue =
  | "admin"
  | "tech_lead"
  | "developer"

type RoleOption = {
  value: RoleValue
  label: string
  description: string
  chips: string[]
  indicatorClass: string
  badgeClass: string
}

type PermissionOverride = "grant" | "revoke"

type PermissionGroup = {
  key: string
  label: string
  items: Array<{ code: string; description: string }>
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: "developer",
    label: "Developer",
    description: "Peut soumettre des PRs pour analyse et consulter les résultats détaillés.",
    chips: ["Soumettre", "Consulter", "Commenter"],
    indicatorClass: "bg-[#17f0c4]",
    badgeClass:
      "font-mono text-[11px] uppercase tracking-wider border border-[#17f0c4]/40 text-[#17f0c4] bg-[#17f0c4]/10",
  },
  {
    value: "tech_lead",
    label: "Tech Lead",
    description: "Peut piloter les reviews, les assignations et les operations d'equipe.",
    chips: ["Approuver", "Bloquer", "Demander changements", "Review"],
    indicatorClass: "bg-violet-400",
    badgeClass:
      "font-mono text-[11px] uppercase tracking-wider border border-violet-400/40 text-violet-400 bg-violet-400/10",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Accès complet à toutes les fonctionnalités de la plateforme.",
    chips: ["Utilisateurs", "Intégrations", "Paramètres", "Organisation"],
    indicatorClass: "bg-[--orange]",
    badgeClass:
      "font-mono text-[11px] uppercase tracking-wider border border-[--border-accent] text-[--orange] bg-[--orange-glow]",
  },
]

const ROLE_LOOKUP = new Map(ROLE_OPTIONS.map((option) => [option.value, option]))

const ROLE_PERMISSION_FALLBACKS: Record<RoleValue, string[]> = {
  admin: ROLE_DEFAULT_PERMISSIONS.admin,
  tech_lead: ROLE_DEFAULT_PERMISSIONS.tech_lead,
  developer: ROLE_DEFAULT_PERMISSIONS.developer,
}

const PERMISSION_GROUP_LABELS: Record<string, string> = {
  admin: "Administration",
  analyses: "Analyses",
  assignments: "Assignations",
  comments: "Commentaires",
  integrations: "Integrations",
  metrics: "Metriques",
  observability: "Observabilite",
  organizations: "Organisation",
  project_roles: "Roles projet",
  project_settings: "Parametres projet",
  projects: "Projets",
  repositories: "Depots",
  reviews: "Reviews",
  role_permissions: "Permissions des roles",
  teams: "Equipes",
  templates: "Templates",
  threads: "Discussions",
  users: "Utilisateurs",
}

function normalizeRole(role: string): RoleValue {
  if (role === "admin") return "admin"
  if (role === "tech_lead" || role === "reviewer" || role.startsWith("reviewer_")) return "tech_lead"
  if (role === "developer" || role === "viewer" || role === "member") return "developer"
  return "developer"
}

function extractApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback
  }

  const record = payload as {
    message?: unknown
    detail?: unknown
    error?: unknown
  }

  if (typeof record.message === "string" && record.message.trim().length > 0) {
    return record.message
  }

  if (typeof record.detail === "string" && record.detail.trim().length > 0) {
    return record.detail
  }

  if (typeof record.error === "string" && record.error.trim().length > 0) {
    return record.error
  }

  if (record.error && typeof record.error === "object") {
    const nested = record.error as { message?: unknown; detail?: unknown; code?: unknown }
    if (typeof nested.message === "string" && nested.message.trim().length > 0) {
      return nested.message
    }
    if (typeof nested.detail === "string" && nested.detail.trim().length > 0) {
      return nested.detail
    }
    if (typeof nested.code === "string" && nested.code.trim().length > 0) {
      return nested.code
    }
  }

  return fallback
}

function initials(nameOrEmail: string): string {
  const cleaned = nameOrEmail.trim()
  if (!cleaned) {
    return "US"
  }
  const parts = cleaned.split(" ").filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return cleaned.slice(0, 2).toUpperCase()
}

function displayNameOf(user: AdminUser): string {
  return user.displayName && user.displayName.trim().length > 0 ? user.displayName : user.email
}

function primaryRole(user: AdminUser): RoleValue {
  if (user.roles.includes("admin")) {
    return "admin"
  }
  if (user.roles.some((role) => role === "tech_lead" || role === "reviewer" || role.startsWith("reviewer_"))) {
    return "tech_lead"
  }
  if (user.roles.includes("developer")) {
    return "developer"
  }
  return normalizeRole(user.roles[0] ?? "developer")
}

function getRoleMeta(role: string) {
  return ROLE_LOOKUP.get(normalizeRole(role)) ?? ROLE_OPTIONS[0]
}

function hasReviewerRole(user: AdminUser): boolean {
  return user.roles.some((role) => role === "tech_lead" || role === "reviewer" || role.startsWith("reviewer_"))
}

function getPermissionGroupLabel(code: string): string {
  const prefix = code.split(".")[0] ?? "other"
  return PERMISSION_GROUP_LABELS[prefix] ?? "Autres"
}

function buildPermissionOverrides(user: AdminUser | null): Record<string, PermissionOverride> {
  if (!user) {
    return {}
  }

  const next: Record<string, PermissionOverride> = {}
  for (const code of user.customPermissions ?? []) {
    next[code] = "grant"
  }
  for (const code of user.revokedPermissions ?? []) {
    next[code] = "revoke"
  }
  return next
}

export function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [permissions, setPermissions] = useState<PermissionCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [tokenBusy, setTokenBusy] = useState(false)
  const [tokenInfo, setTokenInfo] = useState<IntegrationsPayload["ciToken"] | null>(null)
  const [lastRotatedToken, setLastRotatedToken] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [stats, setStats] = useState({
    totalUsers: 0,
    admins: 0,
    reviewers: 0,
    developers: 0,
    activeUsers: 0,
  })
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [selectedRole, setSelectedRole] = useState<RoleValue>("developer")
  const [selectedPermissionOverrides, setSelectedPermissionOverrides] = useState<Record<string, PermissionOverride>>({})
  const [rolePermissionQuery, setRolePermissionQuery] = useState("")
  const [rolePermissionsByRole, setRolePermissionsByRole] = useState<Record<RoleValue, RolePermissionDetail[]>>({
    admin: [],
    tech_lead: [],
    developer: [],
  })

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      await fetch("/api/auth/sync", {
        method: "POST",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).catch(() => null)

      const [usersResponse, rolePermissionsResponse, integrationsResponse] = await Promise.all([
        fetch("/api/dashboard/admin/users?limit=250", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        fetch("/api/dashboard/admin/roles/permissions", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        fetch("/api/dashboard/admin/integrations", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
      ])
      const usersPayload = (await usersResponse.json().catch(() => ({}))) as UsersPayload
      if (!usersResponse.ok) {
        throw new Error(extractApiErrorMessage(usersPayload, "Impossible de charger les utilisateurs."))
      }

      const items = Array.isArray(usersPayload.items) ? usersPayload.items : []
      const permissionItems = Array.isArray(usersPayload.permissions) ? usersPayload.permissions : []
      const payloadStats = usersPayload.stats ?? {}

      setUsers(items)
      setPermissions(permissionItems)
      setStats({
        totalUsers: Number(payloadStats.totalUsers ?? items.length),
        admins: Number(payloadStats.admins ?? items.filter((item) => primaryRole(item) === "admin").length),
        reviewers: Number(payloadStats.reviewers ?? items.filter((item) => hasReviewerRole(item)).length),
        developers: Number(payloadStats.developers ?? items.filter((item) => primaryRole(item) === "developer").length),
        activeUsers: Number(payloadStats.activeUsers ?? items.filter((item) => item.isActive).length),
      })

      const rolePermissionsPayload = (await rolePermissionsResponse.json().catch(() => ({}))) as RolePermissionsPayload
      if (rolePermissionsResponse.ok) {
        const nextRolePermissions: Record<RoleValue, RolePermissionDetail[]> = {
          admin: [],
          tech_lead: [],
          developer: [],
        }
        for (const role of rolePermissionsPayload.roles ?? []) {
          const normalizedRole = normalizeRole(role.code)
          nextRolePermissions[normalizedRole] = Array.isArray(role.permissions) ? role.permissions : []
        }
        setRolePermissionsByRole(nextRolePermissions)
      }

      const integrationsPayload = (await integrationsResponse.json().catch(() => ({}))) as IntegrationsPayload
      if (integrationsResponse.ok) {
        setTokenInfo(integrationsPayload.ciToken ?? null)
      } else {
        setActionMessage(
          extractApiErrorMessage(
            integrationsPayload,
            "Les utilisateurs sont chargés, mais les informations d'intégration CI sont indisponibles.",
          ),
        )
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Impossible de charger les utilisateurs."
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => Number(right.isActive) - Number(left.isActive)),
    [users],
  )

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return sortedUsers
    }
    return sortedUsers.filter((user) => {
      const primary = primaryRole(user)
      const roleMeta = getRoleMeta(primary)
      const haystack = [displayNameOf(user), user.email, primary, roleMeta.label, ...user.permissions]
      return haystack.some((value) => value.toLowerCase().includes(query))
    })
  }, [searchQuery, sortedUsers])

  const selectedRoleMeta = useMemo(() => getRoleMeta(selectedRole), [selectedRole])
  const permissionDescriptions = useMemo(() => {
    const next = new Map<string, string>()
    for (const permission of permissions) {
      next.set(permission.code, permission.description)
    }
    for (const rolePermissions of Object.values(rolePermissionsByRole)) {
      for (const permission of rolePermissions) {
        if (!next.has(permission.permission_code)) {
          next.set(permission.permission_code, permission.permission_description)
        }
      }
    }
    return next
  }, [permissions, rolePermissionsByRole])

  const selectedRolePermissionSet = useMemo(() => {
    const configuredPermissions = rolePermissionsByRole[selectedRole]
      .filter((permission) => permission.enabled)
      .map((permission) => permission.permission_code)
    const source = configuredPermissions.length > 0 ? configuredPermissions : ROLE_PERMISSION_FALLBACKS[selectedRole]
    return new Set(source)
  }, [rolePermissionsByRole, selectedRole])

  const groupedRolePermissions = useMemo(() => {
    const allCodes = new Set<string>()
    for (const permission of permissions) {
      allCodes.add(permission.code)
    }
    for (const rolePermissions of Object.values(rolePermissionsByRole)) {
      for (const permission of rolePermissions) {
        allCodes.add(permission.permission_code)
      }
    }
    for (const code of Object.keys(selectedPermissionOverrides)) {
      allCodes.add(code)
    }

    const normalizedQuery = rolePermissionQuery.trim().toLowerCase()
    const buckets = new Map<string, PermissionGroup>()

    for (const code of Array.from(allCodes).sort((left, right) => left.localeCompare(right))) {
      const description = permissionDescriptions.get(code) ?? "Permission personnalisée"
      if (normalizedQuery && !`${code} ${description}`.toLowerCase().includes(normalizedQuery)) {
        continue
      }

      const groupKey = code.split(".")[0] ?? "other"
      const existing = buckets.get(groupKey)
      const item = { code, description }
      if (existing) {
        existing.items.push(item)
      } else {
        buckets.set(groupKey, {
          key: groupKey,
          label: getPermissionGroupLabel(code),
          items: [item],
        })
      }
    }

    return Array.from(buckets.values()).sort((left, right) => left.label.localeCompare(right.label))
  }, [permissionDescriptions, permissions, rolePermissionQuery, rolePermissionsByRole, selectedPermissionOverrides])

  const permissionOverrideStats = useMemo(() => {
    let granted = 0
    let revoked = 0
    for (const state of Object.values(selectedPermissionOverrides)) {
      if (state === "grant") {
        granted += 1
      } else {
        revoked += 1
      }
    }
    return { granted, revoked }
  }, [selectedPermissionOverrides])

  const effectivePermissionCount = useMemo(() => {
    const codes = new Set<string>(selectedRolePermissionSet)
    for (const [code, state] of Object.entries(selectedPermissionOverrides)) {
      if (state === "grant") {
        codes.add(code)
      } else {
        codes.delete(code)
      }
    }
    return codes.size
  }, [selectedPermissionOverrides, selectedRolePermissionSet])

  const updatePermissionOverride = (code: string, nextChecked: boolean) => {
    const baselineEnabled = selectedRolePermissionSet.has(code)
    setSelectedPermissionOverrides((previous) => {
      const next = { ...previous }
      if (nextChecked === baselineEnabled) {
        delete next[code]
      } else {
        next[code] = nextChecked ? "grant" : "revoke"
      }
      return next
    })
  }

  const patchUser = async (
    userId: string,
    body: { role?: string; isActive?: boolean; customPermissions?: string[]; revokedPermissions?: string[] },
  ) => {
    setBusyUserId(userId)
    setActionMessage(null)
    try {
      const response = await fetch(`/api/dashboard/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string; item?: Partial<AdminUser> }
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload, "Mise à jour utilisateur impossible."))
      }
      // Targeted optimistic update — preserve all existing fields (esp. permissions)
      // and only overwrite the fields we actually changed.
      await loadData()
      setActionMessage("Utilisateur mis à jour.")
      return true
    } catch (updateError) {
      setActionMessage(updateError instanceof Error ? updateError.message : "Mise à jour utilisateur impossible.")
      return false
    } finally {
      setBusyUserId(null)
    }
  }

  const openRoleDialog = (user: AdminUser) => {
    setSelectedUser(user)
    setSelectedRole(normalizeRole(primaryRole(user)))
    setSelectedPermissionOverrides(buildPermissionOverrides(user))
    setRolePermissionQuery("")
    setRoleDialogOpen(true)
  }

  const saveRole = async () => {
    if (!selectedUser || !selectedRole) return
    const customPermissions = Object.entries(selectedPermissionOverrides)
      .filter(([, state]) => state === "grant")
      .map(([code]) => code)
      .sort((left, right) => left.localeCompare(right))
    const revokedPermissions = Object.entries(selectedPermissionOverrides)
      .filter(([, state]) => state === "revoke")
      .map(([code]) => code)
      .sort((left, right) => left.localeCompare(right))
    const body: { role?: string; customPermissions?: string[]; revokedPermissions?: string[] } = {
      role: selectedRole,
    }
    const hadExistingOverrides =
      (selectedUser.customPermissions?.length ?? 0) > 0 || (selectedUser.revokedPermissions?.length ?? 0) > 0
    if (customPermissions.length > 0 || revokedPermissions.length > 0 || hadExistingOverrides) {
      body.customPermissions = customPermissions
      body.revokedPermissions = revokedPermissions
    }
    const updated = await patchUser(selectedUser.id, body)
    if (updated) {
      setRoleDialogOpen(false)
      setSelectedUser(null)
      setSelectedPermissionOverrides({})
    }
  }

  const rotateCiToken = async () => {
    setTokenBusy(true)
    setActionMessage(null)
    try {
      const response = await fetch("/api/dashboard/admin/integrations/ci-token", {
        method: "POST",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as {
        token?: string
        prefix?: string
        createdAt?: string
        error?: string
      }
      if (!response.ok || typeof payload.token !== "string") {
        throw new Error(extractApiErrorMessage(payload, "Rotation du token impossible."))
      }
      setLastRotatedToken(payload.token)
      setTokenInfo({
        exists: true,
        prefix: payload.prefix ?? payload.token.slice(0, 12),
        createdAt: payload.createdAt ?? new Date().toISOString(),
        revoked: false,
      })
      setActionMessage("Nouveau token généré. Copiez-le maintenant.")
    } catch (rotateError) {
      setActionMessage(rotateError instanceof Error ? rotateError.message : "Rotation du token impossible.")
    } finally {
      setTokenBusy(false)
    }
  }

  const revokeCiToken = async () => {
    setTokenBusy(true)
    setActionMessage(null)
    try {
      const response = await fetch("/api/dashboard/admin/integrations/ci-token", {
        method: "DELETE",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload, "Revocation du token impossible."))
      }
      setLastRotatedToken(null)
      setTokenInfo((previous) => ({
        ...(previous ?? {}),
        exists: false,
        revoked: true,
      }))
      setActionMessage("Token CI révoqué.")
    } catch (revokeError) {
      setActionMessage(revokeError instanceof Error ? revokeError.message : "Revocation du token impossible.")
    } finally {
      setTokenBusy(false)
    }
  }

  const statsCards = [
    { label: "Total utilisateurs", value: stats.totalUsers, icon: Users, accent: "text-[--orange]", bg: "bg-[--orange-glow]" },
    { label: "Admins", value: stats.admins, icon: Shield, accent: "text-rose-400", bg: "bg-rose-400/10" },
    { label: "Tech Leads", value: stats.reviewers, icon: CheckCircle2, accent: "text-amber-400", bg: "bg-amber-400/10" },
    { label: "Développeurs", value: stats.developers, icon: UserCog, accent: "text-[#17f0c4]", bg: "bg-[#17f0c4]/10" },
  ]

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-6 px-4 pb-10 lg:px-6">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center border border-[--border-accent] bg-[--orange-glow] text-[--orange]">
            <Users className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Gestion des utilisateurs</h1>
            <p className="text-sm text-muted-foreground font-mono uppercase tracking-wider text-[11px]">
              RBAC · Accès &amp; permissions
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/admin/organization">Invitations organisation</Link>
          </Button>
          <Button size="sm">
            <UserPlus className="h-4 w-4" />
            Ajouter utilisateur
          </Button>
        </div>
      </div>

      {/* ── Alerts ───────────────────────────────────────────────────── */}
      {error && (
        <div className="border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      )}
      {actionMessage && (
        <div className="border border-[--border-accent] bg-[--orange-glow] px-4 py-3 text-sm text-[--orange]">
          {actionMessage}
        </div>
      )}

      {/* ── Stats cards ──────────────────────────────────────────────── */}
      <div className="grid gap-px bg-[--border-card] border border-[--border-card] sm:grid-cols-2 xl:grid-cols-4">
        {statsCards.map((stat) => (
          <div key={stat.label} className="bg-[--bg-card] px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-3xl font-semibold tabular-nums text-foreground">{stat.value}</p>
              </div>
              <div className={`flex size-10 items-center justify-center border border-[--border-card] ${stat.bg} ${stat.accent}`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search ───────────────────────────────────────────────────── */}
      <div className="border border-[--border-card] bg-[--bg-card] p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-2xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              type="search"
              placeholder="Rechercher un utilisateur, email, rôle ou permission…"
              className="h-10 w-full border border-[--border-card] bg-[--bg-card-inner] pl-9 pr-9 text-sm text-foreground outline-none transition-colors focus:border-[--orange] placeholder:text-muted-foreground"
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground transition hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <span className="border border-[--border-card] bg-[--bg-card-inner] px-2.5 py-1 text-foreground">
              {filteredUsers.length}
            </span>
            <span>/ {sortedUsers.length} utilisateurs</span>
          </div>
        </div>
      </div>

      {/* ── Users table ──────────────────────────────────────────────── */}
      <div className="border border-[--border-card] bg-[--bg-card]">
        <div className="border-b border-[--border-card] bg-[--bg-card-inner] px-5 py-3">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Utilisateurs
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Permissions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  Chargement des utilisateurs…
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  {searchQuery
                    ? "Aucun utilisateur ne correspond à cette recherche."
                    : "Aucun utilisateur RBAC trouvé."}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => {
                const role = primaryRole(user)
                const roleMeta = getRoleMeta(role)
                const isBusy = busyUserId === user.id
                const permissionPreview = user.permissions.slice(0, 5)
                const extraPermissions = Math.max(0, user.permissions.length - permissionPreview.length)

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 border border-[--border-card]">
                          <AvatarFallback className="bg-[--bg-card-inner] text-xs font-semibold text-foreground">
                            {initials(displayNameOf(user))}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-foreground">{displayNameOf(user)}</p>
                          <p className={`text-[11px] font-mono ${user.isActive ? "text-[#17f0c4]" : "text-rose-400"}`}>
                            {user.isActive ? "ACTIF" : "INACTIF"}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-muted-foreground">{user.email}</TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center border px-2 py-0.5 ${roleMeta.badgeClass}`}>
                          {roleMeta.label}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openRoleDialog(user)}
                          disabled={isBusy}
                          className="size-7"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {permissionPreview.length === 0 ? (
                          <span className="border border-[--border-card] bg-[--bg-card-inner] px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                            aucune
                          </span>
                        ) : (
                          permissionPreview.map((permission) => (
                            <span
                              key={permission}
                              className="border border-[--border-card] bg-[--bg-card-inner] px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                            >
                              {permission}
                            </span>
                          ))
                        )}
                        {extraPermissions > 0 && (
                          <span className="border border-[--border-card] bg-[--bg-card-inner] px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                            +{extraPermissions}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Permissions catalog ──────────────────────────────────────── */}
      <GroupedPermissions permissions={permissions} />

      {/* ── CI Token ─────────────────────────────────────────────────── */}
      <div className="border border-[--border-card] bg-[--bg-card]">
        <div className="border-b border-[--border-card] bg-[--bg-card-inner] px-5 py-3">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Token CI / CD
          </h2>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-muted-foreground">
            Ce token sert à l&apos;intégration CI/CD (rotation et révocation réelles).
          </p>
          <div className="border border-[--border-card] bg-[--bg-card-inner] px-4 py-3">
            <p className="text-sm text-foreground">
              État :{" "}
              {tokenInfo?.exists && !tokenInfo?.revoked ? (
                <span className="font-mono font-semibold text-[#17f0c4]">
                  ACTIF ({tokenInfo?.prefix ?? "inconnu"})
                </span>
              ) : (
                <span className="font-mono font-semibold text-[--orange]">AUCUN TOKEN ACTIF</span>
              )}
            </p>
            {tokenInfo?.createdAt && (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Dernière rotation : {new Date(tokenInfo.createdAt).toLocaleString("fr-FR")}
              </p>
            )}
          </div>

          {lastRotatedToken && (
            <div className="border border-[#17f0c4]/30 bg-[#17f0c4]/10 px-4 py-3">
              <p className="mb-1 font-mono text-[11px] text-[#17f0c4]">
                NOUVEAU TOKEN — affiché une seule fois :
              </p>
              <code className="break-all font-mono text-xs text-[#17f0c4]">{lastRotatedToken}</code>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void rotateCiToken()} disabled={tokenBusy}>
              Générer nouveau token
            </Button>
            <Button variant="outline" size="sm" onClick={() => void revokeCiToken()} disabled={tokenBusy}>
              Révoquer le token actif
            </Button>
          </div>
        </div>
      </div>

      {/* ── Role Dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={roleDialogOpen}
        onOpenChange={(open) => {
          setRoleDialogOpen(open)
          if (!open) {
            setSelectedUser(null)
            setSelectedPermissionOverrides({})
            setRolePermissionQuery("")
          }
        }}
      >
        <DialogContent className="sm:max-w-[880px]">
          <DialogHeader>
            <DialogTitle>Modifier le rôle</DialogTitle>
            <DialogDescription>
              Sélectionnez le nouveau rôle pour{" "}
              <span className="font-medium text-foreground">
                {selectedUser ? displayNameOf(selectedUser) : ""}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <Select value={selectedRole} onValueChange={(value) => setSelectedRole(normalizeRole(value))}>
              <SelectTrigger className="h-10 w-full">
                <div className="flex items-center gap-2.5">
                  <span className={`size-2 ${selectedRoleMeta.indicatorClass}`} />
                  <span className="font-medium text-foreground">{selectedRoleMeta.label}</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex items-center gap-2.5">
                      <span className={`size-2 ${role.indicatorClass}`} />
                      <span>{role.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="border border-[--border-card] bg-[--bg-card-inner] p-4">
                  <div className="flex items-center gap-2">
                    <span className={`size-2 ${selectedRoleMeta.indicatorClass}`} />
                    <p className="font-semibold text-foreground">{selectedRoleMeta.label}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedRoleMeta.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedRoleMeta.chips.map((chip) => (
                      <span
                        key={chip}
                        className="border border-[--border-card] bg-[--bg-card] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="border border-[--border-card] bg-[--bg-card-inner] p-4">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    Overrides utilisateur
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="border border-[--border-card] bg-[--bg-card] px-3 py-2">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Actives</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{effectivePermissionCount}</p>
                    </div>
                    <div className="border border-[--border-card] bg-[--bg-card] px-3 py-2">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Accordees</p>
                      <p className="mt-1 text-lg font-semibold text-[#17f0c4]">{permissionOverrideStats.granted}</p>
                    </div>
                    <div className="border border-[--border-card] bg-[--bg-card] px-3 py-2">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Retirees</p>
                      <p className="mt-1 text-lg font-semibold text-rose-400">{permissionOverrideStats.revoked}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Le rÃ´le dÃ©finit la base. Les interrupteurs ci-dessous permettent de forcer ON ou OFF par utilisateur.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setSelectedPermissionOverrides({})}
                    disabled={Object.keys(selectedPermissionOverrides).length === 0}
                  >
                    <RotateCcw className="h-4 w-4" />
                    RÃ©initialiser les overrides
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={rolePermissionQuery}
                    onChange={(event) => setRolePermissionQuery(event.target.value)}
                    type="search"
                    placeholder="Rechercher une permission..."
                    className="h-10 w-full border border-[--border-card] bg-[--bg-card-inner] pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-[--orange] placeholder:text-muted-foreground"
                  />
                </div>

                <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
                  {groupedRolePermissions.length === 0 ? (
                    <div className="border border-[--border-card] bg-[--bg-card-inner] px-4 py-6 text-sm text-muted-foreground">
                      Aucune permission ne correspond Ã  cette recherche.
                    </div>
                  ) : (
                    groupedRolePermissions.map((group) => (
                      <div key={group.key} className="border border-[--border-card] bg-[--bg-card-inner]">
                        <div className="border-b border-[--border-card] px-4 py-3">
                          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                            {group.label}
                          </p>
                        </div>
                        <div className="divide-y divide-[--border-card]">
                          {group.items.map((permission) => {
                            const baselineEnabled = selectedRolePermissionSet.has(permission.code)
                            const overrideState = selectedPermissionOverrides[permission.code]
                            const isEnabled = overrideState ? overrideState === "grant" : baselineEnabled

                            return (
                              <div key={permission.code} className="flex items-start justify-between gap-4 px-4 py-3">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <code className="border border-[--border-card] bg-[--bg-card] px-2 py-0.5 font-mono text-[11px] text-foreground">
                                      {permission.code}
                                    </code>
                                    <Badge
                                      variant="outline"
                                      className={
                                        overrideState === "grant"
                                          ? "border-[#17f0c4]/40 bg-[#17f0c4]/10 text-[#17f0c4]"
                                          : overrideState === "revoke"
                                            ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                                            : baselineEnabled
                                              ? "border-[--border-card] bg-[--bg-card] text-muted-foreground"
                                              : "border-[--border-card] bg-transparent text-muted-foreground"
                                      }
                                    >
                                      {overrideState === "grant"
                                        ? "Force ON"
                                        : overrideState === "revoke"
                                          ? "Force OFF"
                                          : baselineEnabled
                                            ? "Herite"
                                            : "Inactif"}
                                    </Badge>
                                  </div>
                                  <p className="text-sm leading-6 text-muted-foreground">{permission.description}</p>
                                </div>

                                <div className="flex items-center gap-3">
                                  <span className={`text-xs font-mono ${isEnabled ? "text-[#17f0c4]" : "text-muted-foreground"}`}>
                                    {isEnabled ? "ON" : "OFF"}
                                  </span>
                                  <Switch
                                    checked={isEnabled}
                                    onCheckedChange={(checked) => updatePermissionOverride(permission.code, checked)}
                                    aria-label={`Activer ou desactiver ${permission.code}`}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => setRoleDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={() => void saveRole()}
              disabled={!selectedRole || busyUserId === selectedUser?.id}
            >
              {busyUserId === selectedUser?.id ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
