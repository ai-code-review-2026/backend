"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Mail, Shield, Trash2, UserPlus, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { normalizeRepositoryId } from "@/lib/repository-links"

type ProjectDetails = {
  id: string
  name: string
  full_name: string
}

type ProjectMember = {
  id: string
  user_id: string
  user_email?: string | null
  user_display_name?: string | null
  role_code: string
  created_at?: string | null
}

type MembersResponse = {
  project_id: string
  members: ProjectMember[]
  total: number
}

type ProjectInvitation = {
  id: string
  project_id: string
  email: string
  github_login?: string | null
  role_code: string
  status: "pending" | "accepted" | "revoked"
  clerk_invitation_id?: string | null
  created_at?: string | null
}

type InvitationsResponse = {
  project_id: string
  items: ProjectInvitation[]
  total: number
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "tech_lead", label: "Lead Reviewer" },
  { value: "developer", label: "Developer" },
] as const

function formatDate(value?: string | null): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function ProjectCollaboratorsPage() {
  const params = useParams() as { repoId?: string | string[] }
  const router = useRouter()
  const resourceId = normalizeRepositoryId(
    Array.isArray(params.repoId) ? params.repoId[0] ?? "" : params.repoId ?? "",
  )

  const [project, setProject] = useState<ProjectDetails | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteGithubLogin, setInviteGithubLogin] = useState("")
  const [inviteRole, setInviteRole] = useState<string>("developer")
  const [error, setError] = useState<string | null>(null)

  const loadPageData = useCallback(async () => {
    if (!resourceId) {
      setError("Project identifier is missing")
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [projectRes, membersRes, invitationsRes] = await Promise.all([
        fetch(`/api/dashboard/projects/${encodeURIComponent(resourceId)}`, { cache: "no-store" }),
        fetch(`/api/dashboard/projects/${encodeURIComponent(resourceId)}/members`, { cache: "no-store" }),
        fetch(`/api/dashboard/projects/${encodeURIComponent(resourceId)}/invitations`, { cache: "no-store" }),
      ])

      if (!projectRes.ok) {
        throw new Error("Failed to load project")
      }
      const projectPayload = (await projectRes.json()) as ProjectDetails
      setProject({
        id: projectPayload.id,
        name: projectPayload.name,
        full_name: projectPayload.full_name,
      })

      if (membersRes.ok) {
        const membersPayload = (await membersRes.json()) as MembersResponse
        setMembers(Array.isArray(membersPayload.members) ? membersPayload.members : [])
      } else {
        setMembers([])
      }

      if (invitationsRes.ok) {
        const invitationsPayload = (await invitationsRes.json()) as InvitationsResponse
        setInvitations(Array.isArray(invitationsPayload.items) ? invitationsPayload.items : [])
      } else {
        setInvitations([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project collaborators")
    } finally {
      setLoading(false)
    }
  }, [resourceId])

  useEffect(() => {
    void loadPageData()
  }, [loadPageData])

  const stats = useMemo(() => {
    const pendingInvites = invitations.filter((inv) => inv.status === "pending").length
    return {
      members: members.length,
      pendingInvites,
    }
  }, [invitations, members.length])

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Email is required")
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/dashboard/projects/${encodeURIComponent(resourceId)}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          github_login: inviteGithubLogin.trim() || null,
          role_code: inviteRole,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : "Failed to send invitation"
        throw new Error(message)
      }
      setInviteEmail("")
      setInviteGithubLogin("")
      setInviteRole("developer")
      toast.success("Invitation processed")
      await loadPageData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invitation failed")
    } finally {
      setSaving(false)
    }
  }

  const handleRoleUpdate = async (userId: string, roleCode: string) => {
    setSaving(true)
    try {
      const response = await fetch(
        `/api/dashboard/projects/${encodeURIComponent(resourceId)}/members/${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role_code: roleCode }),
        },
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : "Failed to update role"
        throw new Error(message)
      }
      toast.success("Role updated")
      await loadPageData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Role update failed")
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Remove this member from the project?")) return
    setSaving(true)
    try {
      const response = await fetch(
        `/api/dashboard/projects/${encodeURIComponent(resourceId)}/members/${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      )
      if (!response.ok) {
        throw new Error("Failed to remove member")
      }
      toast.success("Member removed")
      await loadPageData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Member removal failed")
    } finally {
      setSaving(false)
    }
  }

  const handleRevokeInvitation = async (invitationId: string) => {
    setSaving(true)
    try {
      const response = await fetch(
        `/api/dashboard/projects/${encodeURIComponent(resourceId)}/invitations/${encodeURIComponent(invitationId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "revoked" }),
        },
      )
      if (!response.ok) {
        throw new Error("Failed to revoke invitation")
      }
      toast.success("Invitation revoked")
      await loadPageData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="text-muted-foreground">Loading collaborators...</span>
      </div>
    )
  }

  if (!project || error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-8">
          <p className="text-destructive">{error || "Project not found"}</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push("/dashboard/projects")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to projects
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/projects/${encodeURIComponent(project.id)}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Project details
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">Collaborateurs et invitations</h1>
          <p className="text-sm text-muted-foreground">
            Projet: <span className="font-medium text-foreground">{project.name}</span> ({project.full_name})
          </p>
        </div>
        <Button onClick={() => router.push(`/dashboard/projects/${encodeURIComponent(project.id)}/analyses/new`)}>
          <Shield className="mr-2 h-4 w-4" />
          Nouvelle analyse
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Membres du projet</CardDescription>
            <CardTitle>{stats.members}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Invitations en attente</CardDescription>
            <CardTitle>{stats.pendingInvites}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Actions</CardDescription>
            <CardTitle className="text-base">Gestion des roles et acces</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Inviter un collaborateur
          </CardTitle>
          <CardDescription>Invitation via Clerk + liaison backend projet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="name@company.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-github">GitHub login (optionnel)</Label>
            <Input
              id="invite-github"
              placeholder="github-login"
              value={inviteGithubLogin}
              onChange={(event) => setInviteGithubLogin(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4">
            <Button onClick={handleInvite} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Envoyer
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="members" className="w-full">
        <TabsList>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            Collaborateurs
          </TabsTrigger>
          <TabsTrigger value="invitations" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Invitations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Collaborateur</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[130px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {member.user_display_name || member.user_id}
                      </TableCell>
                      <TableCell>{member.user_email || "-"}</TableCell>
                      <TableCell>
                        <Select
                          value={member.role_code}
                          onValueChange={(value) => void handleRoleUpdate(member.user_id, value)}
                        >
                          <SelectTrigger className="w-[170px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{formatDate(member.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleRemoveMember(member.user_id)}
                          title="Remove member"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Aucun collaborateur trouve.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>GitHub</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[130px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium">{invitation.email}</TableCell>
                      <TableCell>{invitation.github_login || "-"}</TableCell>
                      <TableCell>{invitation.role_code}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            invitation.status === "accepted"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {invitation.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(invitation.created_at)}</TableCell>
                      <TableCell className="text-right">
                        {invitation.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleRevokeInvitation(invitation.id)}
                          >
                            Revoquer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {invitations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Aucune invitation.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
