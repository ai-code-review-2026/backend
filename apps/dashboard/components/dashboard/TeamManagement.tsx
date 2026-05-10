"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Crown,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  Shield,
  Trash2,
  User,
  UserPlus,
  Users,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { extractApiErrorMessage } from "@/lib/display"

type TeamRole = "admin" | "reviewer" | "developer"

interface TeamMember {
  id: string
  user_id: string
  email: string | null
  display_name: string | null
  role: TeamRole
  permissions: string[]
  created_at: string | null
}

interface Team {
  id: string
  name: string
  project_id: string
  description: string | null
  is_active: boolean
  member_count: number
  members: TeamMember[]
}

interface TeamsResponse {
  items: Team[]
  total: number
}

interface UserAccess {
  user_id: string
  project_id: string
  team_id: string | null
  team_name: string | null
  role: TeamRole
  permissions: string[]
  source: "team" | "org" | "platform" | "none"
}

const roleConfig: Record<TeamRole, { label: string; icon: typeof Crown; color: string }> = {
  admin: { label: "Admin", icon: Crown, color: "text-amber-500" },
  reviewer: { label: "Reviewer", icon: Shield, color: "text-blue-500" },
  developer: { label: "Developer", icon: User, color: "text-gray-500" },
}

interface TeamManagementProps {
  projectId: string
}

export function TeamManagement({ projectId }: TeamManagementProps) {
  const [teams, setTeams] = useState<Team[]>([])
  const [userAccess, setUserAccess] = useState<UserAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false)
  const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [showEditRoleDialog, setShowEditRoleDialog] = useState(false)
  const [showRemoveMemberDialog, setShowRemoveMemberDialog] = useState(false)

  // Form states
  const [newTeamName, setNewTeamName] = useState("")
  const [newTeamDescription, setNewTeamDescription] = useState("")
  const [newMemberEmail, setNewMemberEmail] = useState("")
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>("developer")
  const [editMemberRole, setEditMemberRole] = useState<TeamRole>("developer")
  const [submitting, setSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const isAdmin = userAccess?.role === "admin" || userAccess?.source === "platform"

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [teamsRes, accessRes] = await Promise.all([
        fetch(`/api/dashboard/teams/project/${encodeURIComponent(projectId)}?include_members=true`),
        fetch(`/api/dashboard/teams/access/project/${encodeURIComponent(projectId)}`),
      ])

      if (!teamsRes.ok) {
        const teamsError = await teamsRes.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(teamsError, "Failed to load teams"))
      }

      if (!accessRes.ok) {
        const accessError = await accessRes.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(accessError, "Failed to load user access"))
      }

      const teamsData = (await teamsRes.json()) as TeamsResponse
      const accessData = (await accessRes.json()) as UserAccess

      setTeams(teamsData.items || [])
      setUserAccess(accessData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team data")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return

    try {
      setSubmitting(true)
      const response = await fetch("/api/dashboard/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTeamName.trim(),
          project_id: projectId,
          description: newTeamDescription.trim() || null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(errorData, "Failed to create team"))
      }

      setShowCreateTeamDialog(false)
      setNewTeamName("")
      setNewTeamDescription("")
      void fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team")
    } finally {
      setSubmitting(false)
    }
  }

  const handleInviteMember = async () => {
    if (!selectedTeam || !newMemberEmail.trim()) return

    try {
      setSubmitting(true)
      const response = await fetch("/api/dashboard/teams/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: selectedTeam.id,
          email: newMemberEmail.trim(),
          role: newMemberRole,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(errorData, "Failed to invite member"))
      }

      setShowAddMemberDialog(false)
      setNewMemberEmail("")
      setNewMemberRole("developer")
      void fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite member")
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateMemberRole = async () => {
    if (!selectedTeam || !selectedMember) return

    try {
      setSubmitting(true)
      const response = await fetch(
        `/api/dashboard/teams/${encodeURIComponent(selectedTeam.id)}/members/${encodeURIComponent(selectedMember.user_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: editMemberRole }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(errorData, "Failed to update member role"))
      }

      setShowEditRoleDialog(false)
      setSelectedMember(null)
      void fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member role")
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!selectedTeam || !selectedMember) return

    try {
      setSubmitting(true)
      const response = await fetch(
        `/api/dashboard/teams/${encodeURIComponent(selectedTeam.id)}/members/${encodeURIComponent(selectedMember.user_id)}`,
        { method: "DELETE" }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(errorData, "Failed to remove member"))
      }

      setShowRemoveMemberDialog(false)
      setSelectedMember(null)
      void fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member")
    } finally {
      setSubmitting(false)
    }
  }

  const getInitials = (name: string | null, email: string | null): string => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return "?"
  }

  const filteredTeams = teams.map((team) => ({
    ...team,
    members: team.members.filter((member) => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        member.email?.toLowerCase().includes(query) ||
        member.display_name?.toLowerCase().includes(query)
      )
    }),
  }))

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading team data...</span>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive bg-destructive/5">
        <CardContent className="py-6">
          <p className="text-center text-destructive">{error}</p>
          <div className="mt-4 text-center">
            <Button variant="outline" onClick={() => void fetchData()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Team Management</h2>
          <p className="text-sm text-muted-foreground">
            Manage team members and their permissions for this project.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateTeamDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Team
          </Button>
        )}
      </div>

      {/* User Access Info */}
      {userAccess && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Your Access</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Badge variant={userAccess.role === "admin" ? "default" : "secondary"}>
                {roleConfig[userAccess.role].label}
              </Badge>
              <span className="text-sm text-muted-foreground">
                via {userAccess.source === "team" ? `Team: ${userAccess.team_name}` : userAccess.source}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Teams List */}
      {filteredTeams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">No teams yet</h3>
            <p className="mt-1 text-muted-foreground">
              Create a team to start managing project members.
            </p>
            {isAdmin && (
              <Button className="mt-4" onClick={() => setShowCreateTeamDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Team
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredTeams.map((team) => (
            <Card key={team.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {team.name}
                    </CardTitle>
                    {team.description && (
                      <CardDescription className="mt-1">{team.description}</CardDescription>
                    )}
                  </div>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedTeam(team)
                        setShowAddMemberDialog(true)
                      }}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add Member
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {team.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No members in this team.</p>
                ) : (
                  <div className="space-y-3">
                    {team.members.map((member) => {
                      const roleInfo = roleConfig[member.role]
                      const RoleIcon = roleInfo.icon
                      return (
                        <div
                          key={member.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback>
                                {getInitials(member.display_name, member.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                {member.display_name || member.email || "Unknown User"}
                              </p>
                              {member.email && member.display_name && (
                                <p className="text-sm text-muted-foreground">{member.email}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="gap-1">
                              <RoleIcon className={`h-3 w-3 ${roleInfo.color}`} />
                              {roleInfo.label}
                            </Badge>
                            {isAdmin && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedTeam(team)
                                      setSelectedMember(member)
                                      setEditMemberRole(member.role)
                                      setShowEditRoleDialog(true)
                                    }}
                                  >
                                    <Shield className="mr-2 h-4 w-4" />
                                    Change Role
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => {
                                      setSelectedTeam(team)
                                      setSelectedMember(member)
                                      setShowRemoveMemberDialog(true)
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remove from Team
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Team Dialog */}
      <Dialog open={showCreateTeamDialog} onOpenChange={setShowCreateTeamDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>
              Create a new team for this project. You will be added as the team admin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                placeholder="e.g., Backend Team"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-description">Description (optional)</Label>
              <Input
                id="team-description"
                placeholder="e.g., Backend development team"
                value={newTeamDescription}
                onChange={(e) => setNewTeamDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTeamDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTeam} disabled={submitting || !newTeamName.trim()}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to add a new member to {selectedTeam?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="member-email">Email Address</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="user@example.com"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-role">Role</Label>
              <Select value={newMemberRole} onValueChange={(v) => setNewMemberRole(v as TeamRole)}>
                <SelectTrigger id="member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="reviewer">Reviewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteMember} disabled={submitting || !newMemberEmail.trim()}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={showEditRoleDialog} onOpenChange={setShowEditRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Member Role</DialogTitle>
            <DialogDescription>
              Update the role for {selectedMember?.display_name || selectedMember?.email}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={editMemberRole} onValueChange={(v) => setEditMemberRole(v as TeamRole)}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="reviewer">Reviewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditRoleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateMemberRole} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog open={showRemoveMemberDialog} onOpenChange={setShowRemoveMemberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {selectedMember?.display_name || selectedMember?.email}{" "}
              from {selectedTeam?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveMemberDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveMember} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
