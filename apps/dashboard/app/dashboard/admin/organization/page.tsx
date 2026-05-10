"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Unplug,
  Users,
} from "lucide-react"
import { Github } from "@/components/ui/social-icons"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type CreateMode = "platform" | "github_import"

interface OrgMember {
  user_id: string
  email: string
  display_name: string | null
  role: string
  joined_at: string
}

interface PendingInvitation {
  id: string
  emailAddress: string
  role: string
  createdAt: number
}

interface Organization {
  id: string
  name: string
  slug: string | null
  description: string | null
  memberCount: number
  createdAt: string | null
  updatedAt: string | null
  clerkOrgId: string | null
  githubOrgId: string | null
  githubOrgLogin: string | null
  source: string
  syncStatus: string
}

interface GithubOrganization {
  id: string
  login: string
  name: string
  description: string | null
  avatarUrl: string | null
  htmlUrl: string | null
}

interface Capabilities {
  canCreateGithubOrganizations: boolean
  githubCreationReason: string
}

interface OrganizationsResponse {
  organizations: Organization[]
  githubOrganizations: GithubOrganization[]
  capabilities: Capabilities
}

interface FormState {
  name: string
  slug: string
  description: string
  githubOrgLogin: string
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  description: "",
  githubOrgLogin: "",
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "-"
  }

  return parsed.toLocaleDateString()
}

function getSyncBadgeVariant(syncStatus: string) {
  switch (syncStatus) {
    case "linked":
      return "success"
    case "clerk_only":
      return "secondary"
    case "github_only":
      return "warning"
    case "error":
      return "error"
    default:
      return "outline"
  }
}

export default function OrganizationPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [githubOrganizations, setGithubOrganizations] = useState<GithubOrganization[]>([])
  const [capabilities, setCapabilities] = useState<Capabilities>({
    canCreateGithubOrganizations: false,
    githubCreationReason: "",
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<CreateMode>("github_import")
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null)

  // Members dialog state
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [membersOrg, setMembersOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member")
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const inviteDeepLinkHandled = useRef(false)

  const linkedCount = useMemo(
    () => organizations.filter((org) => org.syncStatus === "linked").length,
    [organizations],
  )

  useEffect(() => {
    void loadOrganizations()
  }, [])

  async function loadOrganizations(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError(null)

    try {
      const response = await fetch("/api/dashboard/admin/organizations", {
        cache: "no-store",
      })

      const payload = (await response.json().catch(() => null)) as OrganizationsResponse | { error?: string } | null

      if (!response.ok) {
        throw new Error(payload && "error" in payload && payload.error ? payload.error : `Failed to load organizations: ${response.status}`)
      }

      setOrganizations(Array.isArray(payload?.organizations) ? payload.organizations : [])
      setGithubOrganizations(Array.isArray(payload?.githubOrganizations) ? payload.githubOrganizations : [])
      setCapabilities(
        payload?.capabilities ?? {
          canCreateGithubOrganizations: false,
          githubCreationReason: "",
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organizations")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  function resetDialogState() {
    setDialogOpen(false)
    setEditingOrg(null)
    setDialogMode("github_import")
    setFormData(EMPTY_FORM)
    setFormError(null)
    setSubmitting(false)
  }

  function openCreateDialog(mode: CreateMode) {
    setEditingOrg(null)
    setDialogMode(mode)
    setFormData(EMPTY_FORM)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(org: Organization) {
    setEditingOrg(org)
    setDialogMode(org.githubOrgLogin ? "github_import" : "platform")
    setFormData({
      name: org.name,
      slug: org.slug ?? "",
      description: org.description ?? "",
      githubOrgLogin: org.githubOrgLogin ?? "",
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function applyGithubOrganization(login: string) {
    const selected = githubOrganizations.find((org) => org.login === login)
    setFormData((current) => {
      if (!selected) {
        return {
          ...current,
          githubOrgLogin: "",
        }
      }

      const nextName =
        editingOrg || dialogMode === "platform"
          ? current.name
          : current.name || selected.name || selected.login

      const nextSlug =
        editingOrg || dialogMode === "platform"
          ? current.slug
          : current.slug || slugify(selected.login)

      const nextDescription =
        editingOrg || dialogMode === "platform"
          ? current.description
          : current.description || selected.description || ""

      return {
        ...current,
        githubOrgLogin: login,
        name: nextName,
        slug: nextSlug,
        description: nextDescription,
      }
    })
  }

  async function handleLinkClerk(org: Organization) {
    setLinkingId(org.id)
    setError(null)
    setLinkSuccess(null)
    try {
      const response = await fetch(`/api/dashboard/admin/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: org.name,
          slug: org.slug,
          description: org.description,
          linkClerk: true,
        }),
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
        warning?: string
        organization?: Organization
      } | null
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to link Clerk organization")
      }
      if (payload?.warning) {
        // Partial success — Clerk unavailable but local id was saved
        setError(`ℹ️ ${payload.warning}`)
      } else {
        setLinkSuccess(`Organization "${org.name}" linked successfully.`)
      }
      await loadOrganizations({ silent: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link Clerk organization")
    } finally {
      setLinkingId(null)
    }
  }

  const loadMembers = useCallback(async (orgId: string) => {
    setMembersLoading(true)
    try {
      const res = await fetch(`/api/dashboard/admin/organizations/${orgId}/members`)
      const data = (await res.json().catch(() => null)) as {
        members?: OrgMember[]
        pendingInvitations?: PendingInvitation[]
      } | null
      setMembers(Array.isArray(data?.members) ? (data.members as OrgMember[]) : [])
      setPendingInvitations(Array.isArray(data?.pendingInvitations) ? (data.pendingInvitations as PendingInvitation[]) : [])
    } catch {
      setMembers([])
      setPendingInvitations([])
    } finally {
      setMembersLoading(false)
    }
  }, [])

  const openMembersDialog = useCallback(async (org: Organization) => {
    setMembersOrg(org)
    setMembersDialogOpen(true)
    setInviteEmail("")
    setInviteError(null)
    setInviteSuccess(null)
    await loadMembers(org.id)
  }, [loadMembers])

  async function handleInvite() {
    if (!membersOrg || !inviteEmail.trim()) return
    setInviting(true)
    setInviteError(null)
    setInviteSuccess(null)
    try {
      const res = await fetch(`/api/dashboard/admin/organizations/${membersOrg.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const data = (await res.json().catch(() => null)) as {
        error?: string
        warnings?: string[]
        clerkInvitation?: { emailAddress: string }
      } | null
      if (!res.ok) throw new Error(data?.error || "Failed to invite member")
      const warn = data?.warnings?.[0]
      setInviteSuccess(
        data?.clerkInvitation
          ? `Invitation sent to ${data.clerkInvitation.emailAddress}${warn ? ` (${warn})` : ""}`
          : `Member added${warn ? `. Note: ${warn}` : ""}`,
      )
      setInviteEmail("")
      await loadMembers(membersOrg.id)
      await loadOrganizations({ silent: true })
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite member")
    } finally {
      setInviting(false)
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!membersOrg) return
    const confirmed = window.confirm("Remove this member from the organization?")
    if (!confirmed) return
    try {
      await fetch(
        `/api/dashboard/admin/organizations/${membersOrg.id}/members?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      )
      await loadMembers(membersOrg.id)
      await loadOrganizations({ silent: true })
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    if (loading || inviteDeepLinkHandled.current) return

    const params = new URLSearchParams(window.location.search)
    const inviteRequested = params.get("invite") === "1" || params.get("action") === "invite"
    if (!inviteRequested) return

    inviteDeepLinkHandled.current = true

    if (organizations.length === 0) {
      setError("Create or import an organization before inviting teammates.")
      return
    }

    const requestedGithubOrg = params.get("githubOrg")?.trim().toLowerCase()
    const targetOrg =
      (requestedGithubOrg
        ? organizations.find((org) =>
            [org.githubOrgLogin, org.slug, org.name]
              .filter(Boolean)
              .some((value) => value?.trim().toLowerCase() === requestedGithubOrg),
          )
        : null) ?? organizations[0]

    void openMembersDialog(targetOrg)
  }, [loading, openMembersDialog, organizations])

  function openLinkGithubDialog(org: Organization) {
    setEditingOrg(org)
    setDialogMode("github_import")
    setFormData({
      name: org.name,
      slug: org.slug ?? "",
      description: org.description ?? "",
      githubOrgLogin: org.githubOrgLogin ?? "",
    })
    setFormError(null)
    setDialogOpen(true)
  }

  async function handleCreate() {
    setSubmitting(true)
    setFormError(null)

    try {
      const response = await fetch("/api/dashboard/admin/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: dialogMode,
          name: formData.name,
          slug: formData.slug,
          description: formData.description,
          githubOrgLogin: formData.githubOrgLogin || undefined,
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create organization")
      }

      resetDialogState()
      await loadOrganizations({ silent: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create organization")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate() {
    if (!editingOrg) {
      return
    }

    setSubmitting(true)
    setFormError(null)

    try {
      const response = await fetch(`/api/dashboard/admin/organizations/${editingOrg.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          description: formData.description,
          githubOrgLogin: formData.githubOrgLogin || "",
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update organization")
      }

      resetDialogState()
      await loadOrganizations({ silent: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update organization")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(org: Organization) {
    const confirmed = window.confirm(
      `Delete organization '${org.name}'?\n\nThe platform organization will be archived and the linked Clerk organization will also be removed if it exists. The GitHub organization will not be deleted.`,
    )
    if (!confirmed) {
      return
    }

    try {
      const response = await fetch(`/api/dashboard/admin/organizations/${org.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || "Failed to delete organization")
      }

      await loadOrganizations({ silent: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete organization")
    }
  }

  const selectedGithubOrg = githubOrganizations.find((org) => org.login === formData.githubOrgLogin) ?? null

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="mr-3 h-5 w-5 animate-spin text-orange" />
        <span className="text-muted-foreground">Loading organization workspace...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="flex items-center gap-3 text-4xl font-semibold tracking-[-0.05em] text-foreground">
            <Building2 className="h-8 w-8 text-orange" />
            Organization Management
          </h1>
          <p className="text-muted-foreground">
            Create real organizations in the platform, sync them with Clerk, and link an existing GitHub organization.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => void loadOrganizations({ silent: true })} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => openCreateDialog("github_import")}>
            <Github className="h-4 w-4" />
            Import GitHub Org
          </Button>
          <Button className="gap-2" onClick={() => openCreateDialog("platform")}>
            <Plus className="h-4 w-4" />
            Create Platform Org
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Platform organizations</div>
            <div className="mt-2 text-3xl font-semibold">{organizations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Linked to GitHub</div>
            <div className="mt-2 text-3xl font-semibold">{linkedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Available GitHub orgs</div>
            <div className="mt-2 text-3xl font-semibold">{githubOrganizations.length}</div>
          </CardContent>
        </Card>
      </div>

      <Alert className="border-orange/30 bg-orange/5">
        <AlertTriangle className="text-orange" />
        <AlertTitle>Real organization flow</AlertTitle>
        <AlertDescription>
          <p>{capabilities.githubCreationReason || "GitHub organizations are linked from existing GitHub data."}</p>
          <p>
            The implemented flow is: create platform organization, create or reuse Clerk organization, then link an existing GitHub organization.
          </p>
        </AlertDescription>
      </Alert>

      {error ? (
        <Alert variant={error.startsWith("ℹ️") ? "default" : "destructive"}>
          <AlertTriangle />
          <AlertTitle>{error.startsWith("ℹ️") ? "Notice" : "Organization management failed"}</AlertTitle>
          <AlertDescription>{error.replace(/^ℹ️\s*/, "")}</AlertDescription>
        </Alert>
      ) : null}

      {linkSuccess ? (
        <Alert className="border-green-500/30 bg-green-500/10">
          <CheckCircle2 className="text-green-500" />
          <AlertTitle>Linked successfully</AlertTitle>
          <AlertDescription>{linkSuccess}</AlertDescription>
        </Alert>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organizations ({organizations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {organizations.length === 0 ? (
              <div className="space-y-4 py-10 text-center">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
                <div className="space-y-1">
                  <h3 className="text-lg font-medium">No organizations yet</h3>
                  <p className="text-muted-foreground">
                    Start with a platform organization or import an existing GitHub organization and bind it to Clerk.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="outline" onClick={() => openCreateDialog("github_import")}>
                    <Github className="mr-2 h-4 w-4" />
                    Import GitHub Org
                  </Button>
                  <Button onClick={() => openCreateDialog("platform")}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Platform Org
                  </Button>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Clerk</TableHead>
                    <TableHead>GitHub</TableHead>
                    <TableHead>Sync</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{org.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {org.slug || "-"}
                          </div>
                          {org.description ? (
                            <div className="max-w-md text-xs text-muted-foreground">
                              {org.description}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {org.clerkOrgId ? (
                          <Badge variant="outlinePrimary" size="sm">
                            <ShieldCheck className="h-3 w-3" />
                            <span className="max-w-[120px] truncate">{org.clerkOrgId}</span>
                          </Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={linkingId === org.id}
                            onClick={() => void handleLinkClerk(org)}
                          >
                            {linkingId === org.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3 w-3" />
                            )}
                            Link Clerk
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        {org.githubOrgLogin ? (
                          <Badge variant="outline" size="sm">
                            <Github className="h-3 w-3" />
                            {org.githubOrgLogin}
                          </Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => openLinkGithubDialog(org)}
                          >
                            <Github className="h-3 w-3" />
                            Link GitHub
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getSyncBadgeVariant(org.syncStatus)} size="sm">
                          <Link2 className="h-3 w-3" />
                          {org.syncStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {org.memberCount}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(org.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => void openMembersDialog(org)}>
                            <Users className="mr-2 h-3 w-3" />
                            Members
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(org)}>
                            <Pencil className="mr-2 h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(org)}
                          >
                            <Trash2 className="mr-2 h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Members Dialog ─────────────────────────────────────────────── */}
      <Dialog open={membersDialogOpen} onOpenChange={(open) => { if (!open) { setMembersDialogOpen(false); setMembersOrg(null) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-orange" />
              Members — {membersOrg?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Invite form */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-orange" />
                Invite a member
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="email@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleInvite()}
                  className="flex-1"
                  disabled={inviting}
                />
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "member" | "viewer")}>
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => void handleInvite()} disabled={!inviteEmail.trim() || inviting} size="sm">
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                </Button>
              </div>
              {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
              {inviteSuccess && <p className="text-xs text-green-600 dark:text-green-400">{inviteSuccess}</p>}
            </div>

            {/* Member list */}
            {membersLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading members…</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {members.length === 0 && pendingInvitations.length === 0 && (
                  <p className="text-sm text-center text-muted-foreground py-4">No members yet</p>
                )}
                {members.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.display_name || m.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant="outline" size="sm">{m.role}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => void handleRemoveMember(m.user_id)}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {pendingInvitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 opacity-75">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{inv.emailAddress}</p>
                      <p className="text-xs text-muted-foreground">Pending invitation</p>
                    </div>
                    <Badge variant="outline" size="sm" className="shrink-0 ml-2">{inv.role}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : resetDialogState())}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingOrg
                ? `Edit organization: ${editingOrg.name}`
                : dialogMode === "github_import"
                  ? "Import GitHub organization"
                  : "Create platform organization"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {!editingOrg ? (
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDialogMode("github_import")}
                  className={`rounded-xl border p-4 text-left transition ${
                    dialogMode === "github_import"
                      ? "border-orange bg-orange/10"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Github className="h-4 w-4 text-orange" />
                    Import existing GitHub org
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Best option when the organization already exists on GitHub and must be linked to Clerk.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setDialogMode("platform")}
                  className={`rounded-xl border p-4 text-left transition ${
                    dialogMode === "platform"
                      ? "border-orange bg-orange/10"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Building2 className="h-4 w-4 text-orange" />
                    Create platform + Clerk org
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Creates the internal organization and the Clerk organization now. GitHub can stay optional.
                  </p>
                </button>
              </div>
            ) : null}

            <Alert className="border-border bg-muted/30">
              <CheckCircle2 className="text-orange" />
              <AlertTitle>Scenario applied</AlertTitle>
              <AlertDescription>
                {editingOrg
                  ? "You are editing the local platform record and its Clerk synchronization metadata."
                  : dialogMode === "github_import"
                    ? "GitHub organization -> Clerk organization -> platform organization."
                    : "Platform organization -> Clerk organization, with optional GitHub link."}
              </AlertDescription>
            </Alert>

            {formError ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Action failed</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="github-org">GitHub organization</Label>
              <Select
                value={formData.githubOrgLogin || "__none__"}
                onValueChange={(value) => applyGithubOrganization(value === "__none__" ? "" : value)}
              >
                <SelectTrigger id="github-org">
                  <SelectValue placeholder="Select a GitHub organization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {dialogMode === "github_import" && !editingOrg ? "No selection" : "No GitHub link"}
                  </SelectItem>
                  {githubOrganizations.map((org) => (
                    <SelectItem key={org.login} value={org.login}>
                      {org.name} ({org.login})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {dialogMode === "github_import" && !editingOrg
                  ? "Required for GitHub import. Selecting an organization pre-fills the local record."
                  : "Optional. Use this to link the platform organization to an existing GitHub organization."}
              </p>
            </div>

            {selectedGithubOrg ? (
              <Card className="border-border/60 bg-muted/20">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Github className="h-4 w-4 text-orange" />
                      {selectedGithubOrg.name}
                    </div>
                    <div className="text-sm text-muted-foreground">{selectedGithubOrg.login}</div>
                    {selectedGithubOrg.description ? (
                      <div className="text-sm text-muted-foreground">{selectedGithubOrg.description}</div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="org-name">Name</Label>
                <Input
                  id="org-name"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      name: event.target.value,
                      slug: current.slug || slugify(event.target.value),
                    }))
                  }
                  placeholder="Organization name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  value={formData.slug}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      slug: slugify(event.target.value),
                    }))
                  }
                  placeholder="organization-slug"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-description">Description</Label>
              <Textarea
                id="org-description"
                value={formData.description}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="What is this organization used for?"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetDialogState} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={editingOrg ? handleUpdate : handleCreate} disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingOrg ? "Save changes" : "Create organization"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
