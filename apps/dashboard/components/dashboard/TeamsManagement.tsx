"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Search,
  Filter,
  Plus,
  Mail,
  RefreshCw,
  Users,
  Code2,
  FolderOpen,
  Clock,
  Edit,
  Trash2,
  ChevronRight,
  Building2,
  Loader2,
  UserPlus,
  AlertCircle,
  X,
  Shield,
  User,
  Crown,
  MoreVertical,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { extractApiErrorMessage } from "@/lib/display"

// ─── Types ────────────────────────────────────────────────────────────────────

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
  description: string | null
  is_active: boolean
  member_count: number
  members: TeamMember[]
  project_id: string | null
  organization_id: string | null
  organization_name?: string | null
  repository_count?: number
  project_count?: number
  created_at?: string | null
}

interface Project {
  id: string
  name: string
  repo: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<TeamRole, { label: string; icon: typeof Crown; color: string; badge: string }> = {
  admin: {
    label: "Admin",
    icon: Crown,
    color: "text-amber-500",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  reviewer: {
    label: "Reviewer",
    icon: Shield,
    color: "text-blue-500",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  developer: {
    label: "Developer",
    icon: User,
    color: "text-gray-500",
    badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
}

// Avatar color pool (deterministic by index/name hash)
const AVATAR_COLORS = [
  "#f97316", "#3b82f6", "#22c55e", "#8b5cf6",
  "#ec4899", "#f59e0b", "#6366f1", "#14b8a6",
]

function getAvatarColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string | null, email: string | null): string {
  if (name) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
  }
  if (email) return email[0].toUpperCase()
  return "?"
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return "À l'instant"
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} jour${Math.floor(diff / 86400) > 1 ? "s" : ""}`
  return new Date(dateStr).toLocaleDateString("fr-FR")
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

interface RoleSlice {
  label: string
  count: number
  color: string
}

function DonutChart({ slices, total }: { slices: RoleSlice[]; total: number }) {
  const radius = 52
  const cx = 70
  const cy = 70
  const strokeWidth = 22
  const segments: { d: string; color: string }[] = []
  let cumAngle = -Math.PI / 2

  for (const s of slices) {
    const pct = total > 0 ? s.count / total : 0
    const angle = pct * 2 * Math.PI
    if (angle === 0) continue
    const x1 = cx + radius * Math.cos(cumAngle)
    const y1 = cy + radius * Math.sin(cumAngle)
    const x2 = cx + radius * Math.cos(cumAngle + angle)
    const y2 = cy + radius * Math.sin(cumAngle + angle)
    const large = angle > Math.PI ? 1 : 0
    segments.push({ d: `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`, color: s.color })
    cumAngle += angle
  }

  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      {segments.length === 0 ? (
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
      ) : (
        segments.map((seg, i) => (
          <path key={i} d={seg.d} fill="none" stroke={seg.color} strokeWidth={strokeWidth} strokeLinecap="butt" />
        ))
      )}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#6b7280">Membres</text>
    </svg>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, iconBg, loading }: {
  label: string; value: number; icon: React.ReactNode; iconBg: string; loading?: boolean
}) {
  return (
    <div className="flex-1 min-w-[150px] border rounded-lg px-5 py-4 flex items-center justify-between bg-white dark:bg-card">
      <div>
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        {loading ? (
          <div className="h-7 w-10 bg-muted animate-pulse rounded" />
        ) : (
          <p className="text-2xl font-bold">{value}</p>
        )}
      </div>
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", iconBg)}>{icon}</div>
    </div>
  )
}

// ─── Error banner ─────────────────────────────────────────────────────────────

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss}><X className="h-4 w-4" /></button>
    </div>
  )
}

// ─── Success banner ───────────────────────────────────────────────────────────

function SuccessBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 px-4 py-3 text-sm text-green-700 dark:text-green-400">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss}><X className="h-4 w-4" /></button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TeamsManagement() {
  const [teams, setTeams] = useState<Team[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // ── Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMemberRoleOpen, setEditMemberRoleOpen] = useState(false)
  const [removeMemberOpen, setRemoveMemberOpen] = useState(false)
  const [invitationsOpen, setInvitationsOpen] = useState(false)

  // ── Selected state
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // ── Create form
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newProjectId, setNewProjectId] = useState("")

  // ── Edit form
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")

  // ── Invite form
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<TeamRole>("developer")

  // ── Edit member role
  const [editRole, setEditRole] = useState<TeamRole>("developer")

  // ─── Fetch teams ────────────────────────────────────────────────────────────

  const fetchTeams = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/dashboard/teams")
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(data, "Impossible de charger les équipes"))
      }
      const data = await res.json()
      setTeams(data.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement")
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/projects")
      if (!res.ok) return
      const data = await res.json()
      const items: Project[] = (data.projects || data.items || []).map((p: { id?: string; name?: string; repo?: string; full_name?: string }) => ({
        id: p.id || "",
        name: p.name || p.full_name || "",
        repo: p.repo || p.full_name || "",
      }))
      setProjects(items)
    } catch {
      // non-fatal
    }
  }, [])

  useEffect(() => {
    void fetchTeams()
    void fetchProjects()
  }, [fetchTeams, fetchProjects])

  // ─── Fetch members of a specific team ───────────────────────────────────────

  const openMembersDialog = useCallback(async (team: Team) => {
    setSelectedTeam(team)
    setTeamMembers([])
    setMembersOpen(true)
    setLoadingMembers(true)
    try {
      const res = await fetch(`/api/dashboard/teams/${encodeURIComponent(team.id)}/members`)
      if (!res.ok) throw new Error("Impossible de charger les membres")
      const data = await res.json()
      setTeamMembers(data.items || data.members || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur membres")
    } finally {
      setLoadingMembers(false)
    }
  }, [])

  // ─── Create team ────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      setSubmitting(true)
      const res = await fetch("/api/dashboard/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          project_id: newProjectId || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(data, "Impossible de créer l'équipe"))
      }
      setCreateOpen(false)
      setNewName("")
      setNewDescription("")
      setNewProjectId("")
      setSuccess("Équipe créée avec succès")
      void fetchTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur création")
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Edit team ──────────────────────────────────────────────────────────────

  const openEditDialog = (team: Team) => {
    setSelectedTeam(team)
    setEditName(team.name)
    setEditDescription(team.description || "")
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!selectedTeam || !editName.trim()) return
    try {
      setSubmitting(true)
      const res = await fetch(`/api/dashboard/teams/${encodeURIComponent(selectedTeam.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(data, "Impossible de modifier l'équipe"))
      }
      setEditOpen(false)
      setSuccess("Équipe modifiée avec succès")
      void fetchTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur modification")
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete team ─────────────────────────────────────────────────────────────

  const openDeleteDialog = (team: Team) => {
    setSelectedTeam(team)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!selectedTeam) return
    try {
      setSubmitting(true)
      const res = await fetch(`/api/dashboard/teams/${encodeURIComponent(selectedTeam.id)}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(data, "Impossible de supprimer l'équipe"))
      }
      setDeleteOpen(false)
      setSuccess(`Équipe "${selectedTeam.name}" supprimée`)
      setSelectedTeam(null)
      void fetchTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur suppression")
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Invite member ──────────────────────────────────────────────────────────

  const openInviteDialog = (team: Team) => {
    setSelectedTeam(team)
    setInviteEmail("")
    setInviteRole("developer")
    setInviteOpen(true)
  }

  const handleInvite = async () => {
    if (!selectedTeam || !inviteEmail.trim()) return
    try {
      setSubmitting(true)
      const res = await fetch("/api/dashboard/teams/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: selectedTeam.id,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(data, "Impossible d'inviter le membre"))
      }
      const result = await res.json()
      setInviteOpen(false)
      if (result.status === "already_exists") {
        // User already exists — add them directly
        const addRes = await fetch(`/api/dashboard/teams/${encodeURIComponent(selectedTeam.id)}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: result.user_id, role: inviteRole }),
        })
        if (addRes.ok) {
          setSuccess("Membre ajouté directement à l'équipe (compte existant)")
        } else {
          setSuccess("L'utilisateur existe déjà, invitation envoyée")
        }
      } else {
        setSuccess(`Invitation envoyée à ${inviteEmail}`)
      }
      setInviteEmail("")
      void fetchTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur invitation")
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Edit member role ───────────────────────────────────────────────────────

  const openEditMemberRole = (team: Team, member: TeamMember) => {
    setSelectedTeam(team)
    setSelectedMember(member)
    setEditRole(member.role)
    setEditMemberRoleOpen(true)
  }

  const handleUpdateRole = async () => {
    if (!selectedTeam || !selectedMember) return
    try {
      setSubmitting(true)
      const res = await fetch(
        `/api/dashboard/teams/${encodeURIComponent(selectedTeam.id)}/members/${encodeURIComponent(selectedMember.user_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: editRole }),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(data, "Impossible de modifier le rôle"))
      }
      setEditMemberRoleOpen(false)
      setSuccess("Rôle mis à jour")
      // Refresh members list if open
      if (membersOpen && selectedTeam) void openMembersDialog(selectedTeam)
      void fetchTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur mise à jour rôle")
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Remove member ──────────────────────────────────────────────────────────

  const openRemoveMember = (team: Team, member: TeamMember) => {
    setSelectedTeam(team)
    setSelectedMember(member)
    setRemoveMemberOpen(true)
  }

  const handleRemoveMember = async () => {
    if (!selectedTeam || !selectedMember) return
    try {
      setSubmitting(true)
      const res = await fetch(
        `/api/dashboard/teams/${encodeURIComponent(selectedTeam.id)}/members/${encodeURIComponent(selectedMember.user_id)}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(extractApiErrorMessage(data, "Impossible de retirer le membre"))
      }
      setRemoveMemberOpen(false)
      setSuccess("Membre retiré de l'équipe")
      // Refresh members list
      const refreshed = teamMembers.filter((m) => m.user_id !== selectedMember.user_id)
      setTeamMembers(refreshed)
      void fetchTeams()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur suppression membre")
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Computed stats ──────────────────────────────────────────────────────────

  const totalMembers = teams.reduce((sum, t) => sum + (t.member_count || 0), 0)
  const totalRepos = teams.reduce((sum, t) => sum + (t.repository_count || 0), 0)
  const totalProjects = teams.reduce((sum, t) => sum + (t.project_count || 0), 0)

  // Role distribution from members across all teams
  const roleMap: Record<string, number> = {}
  teams.forEach((t) => {
    ;(t.members || []).forEach((m) => {
      roleMap[m.role] = (roleMap[m.role] || 0) + 1
    })
  })
  const roleSlices: RoleSlice[] = [
    { label: "Développeur", count: roleMap["developer"] || 0, color: "#3b82f6" },
    { label: "Reviewer", count: roleMap["reviewer"] || 0, color: "#22c55e" },
    { label: "Admin", count: roleMap["admin"] || 0, color: "#f97316" },
  ].filter((s) => s.count > 0)

  // Filtered teams for search
  const filtered = teams.filter((t) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      (t.organization_name || "").toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q)
    )
  })

  // ─── Recent assignments (last 4 member additions across teams) ───────────────
  const recentMembers: Array<{ member: TeamMember; teamName: string }> = []
  teams.forEach((team) => {
    ;(team.members || []).forEach((m) => {
      recentMembers.push({ member: m, teamName: team.name })
    })
  })
  recentMembers.sort((a, b) => {
    const da = a.member.created_at ? new Date(a.member.created_at).getTime() : 0
    const db = b.member.created_at ? new Date(b.member.created_at).getTime() : 0
    return db - da
  })
  const recent = recentMembers.slice(0, 4)

  // ─── UI ──────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">

      {/* Banners */}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {success && <SuccessBanner message={success} onDismiss={() => setSuccess(null)} />}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Gestion des équipes</h1>
            <p className="text-sm text-muted-foreground">
              Créez, organisez et supervisez les équipes associées aux organisations et aux projets.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setInvitationsOpen(true)}
          >
            <Mail className="h-4 w-4" />
            Invitations
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void fetchTeams()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Synchroniser
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Créer une équipe
          </Button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="flex gap-4 flex-wrap">
        <StatCard
          label="Équipes"
          value={teams.length}
          loading={loading}
          iconBg="bg-orange-100 dark:bg-orange-900/30"
          icon={<Users className="h-5 w-5 text-orange-400" />}
        />
        <StatCard
          label="Membres actifs"
          value={totalMembers}
          loading={loading}
          iconBg="bg-teal-100 dark:bg-teal-900/30"
          icon={<Users className="h-5 w-5 text-teal-500" />}
        />
        <StatCard
          label="Repositories liés"
          value={totalRepos}
          loading={loading}
          iconBg="bg-purple-100 dark:bg-purple-900/30"
          icon={<Code2 className="h-5 w-5 text-purple-500" />}
        />
        <StatCard
          label="Projets associés"
          value={totalProjects}
          loading={loading}
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          icon={<FolderOpen className="h-5 w-5 text-amber-500" />}
        />
      </div>

      {/* ── Search + filter ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher une équipe, un membre ou un projet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md px-3 py-2 bg-white dark:bg-card whitespace-nowrap">
          <Filter className="h-4 w-4" />
          {filtered.length} équipes
        </div>
      </div>

      {/* ── Teams table ── */}
      <div className="border rounded-lg bg-white dark:bg-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold">Équipes ({filtered.length})</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Chargement des équipes...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Users className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              {search ? "Aucune équipe ne correspond à votre recherche." : "Aucune équipe pour le moment."}
            </p>
            {!search && (
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Créer une équipe
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Équipe</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Organisation</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Membres</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Repositories</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Projets</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((team) => (
                  <tr key={team.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded border flex items-center justify-center bg-muted/40 shrink-0">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <span className="font-medium">{team.name}</span>
                          {team.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{team.description}</p>
                          )}
                        </div>
                        {team.is_active && (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs px-1.5 py-0 h-5 font-normal ml-1">
                            active
                          </Badge>
                        )}
                      </div>
                    </td>
                    {/* Org */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span>{team.organization_name || "—"}</span>
                      </div>
                    </td>
                    {/* Members */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1.5">
                          {(team.members || []).slice(0, 3).map((m, i) => {
                            const key = m.display_name || m.email || m.user_id
                            return (
                              <Avatar key={i} className="h-6 w-6 border-2 border-white dark:border-card">
                                <AvatarFallback
                                  style={{ backgroundColor: getAvatarColor(key) }}
                                  className="text-white text-[10px] font-semibold"
                                >
                                  {getInitials(m.display_name, m.email)}
                                </AvatarFallback>
                              </Avatar>
                            )
                          })}
                        </div>
                        {(team.member_count || 0) > 3 && (
                          <span className="text-xs text-muted-foreground">+{(team.member_count || 0) - 3}</span>
                        )}
                        <span className="text-sm text-muted-foreground ml-1">{team.member_count || 0}</span>
                      </div>
                    </td>
                    {/* Repos */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">{team.repository_count ?? "—"}</span>
                    </td>
                    {/* Projects */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">{team.project_count ?? "—"}</span>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => void openMembersDialog(team)}
                        >
                          <Users className="h-3.5 w-3.5" />
                          Membres
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => openEditDialog(team)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Modifier
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => openDeleteDialog(team)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Supprimer
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Bottom panels ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Recent assignments */}
        <div className="border rounded-lg bg-white dark:bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Affectations récentes</h3>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Aucune affectation récente</p>
          ) : (
            <>
              <div className="space-y-3">
                {recent.map(({ member, teamName }, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback
                          style={{ backgroundColor: getAvatarColor(member.display_name || member.email || member.user_id) }}
                          className="text-white text-[10px] font-semibold"
                        >
                          {getInitials(member.display_name, member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">
                        <span className="font-medium">{member.display_name || member.email || "Membre"}</span>
                        {" "}<span className="text-muted-foreground">a rejoint l&apos;équipe</span>{" "}
                        <span className="font-medium">{teamName}</span>
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {timeAgo(member.created_at)}
                    </span>
                  </div>
                ))}
              </div>
              <button
                className="text-orange-500 hover:text-orange-600 text-sm flex items-center gap-1 mt-2"
                onClick={() => setInvitationsOpen(true)}
              >
                Voir toutes les affectations <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Role distribution */}
        <div className="border rounded-lg bg-white dark:bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Répartition par rôle</h3>
          </div>
          {loading ? (
            <div className="flex items-center gap-6">
              <div className="h-[140px] w-[140px] bg-muted animate-pulse rounded-full" />
              <div className="flex-1 space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-5 bg-muted animate-pulse rounded" />)}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-6">
                <DonutChart slices={roleSlices} total={totalMembers} />
                <div className="flex-1 space-y-2">
                  {roleSlices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune donnée</p>
                  ) : (
                    roleSlices.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                          <span>{r.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{r.count}</span>
                          <span className="text-muted-foreground text-xs w-12 text-right">
                            {totalMembers > 0 ? ((r.count / totalMembers) * 100).toFixed(1) : "0"}%
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <button
                className="text-orange-500 hover:text-orange-600 text-sm flex items-center gap-1 mt-4"
                onClick={() => void fetchTeams()}
              >
                Voir la répartition détaillée <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  DIALOGS                                                              */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      {/* ── Create Team ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une équipe</DialogTitle>
            <DialogDescription>Ajoutez une nouvelle équipe à votre organisation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="create-name">Nom de l&apos;équipe *</Label>
              <Input
                id="create-name"
                placeholder="ex: Backend Core"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-desc">Description (optionnelle)</Label>
              <Textarea
                id="create-desc"
                placeholder="Décrivez le rôle de cette équipe..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-project">Projet associé (optionnel)</Label>
              <Select value={newProjectId} onValueChange={setNewProjectId}>
                <SelectTrigger id="create-project">
                  <SelectValue placeholder="Sélectionner un projet..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun projet</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name || p.repo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => void handleCreate()}
              disabled={submitting || !newName.trim()}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Team ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l&apos;équipe</DialogTitle>
            <DialogDescription>Mettez à jour les informations de l&apos;équipe {selectedTeam?.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nom de l&apos;équipe *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleEdit()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => void handleEdit()}
              disabled={submitting || !editName.trim()}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Team ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l&apos;équipe</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer l&apos;équipe <strong>{selectedTeam?.name}</strong> ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Members Dialog ── */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Membres — {selectedTeam?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedTeam?.member_count || 0} membre(s) dans cette équipe
            </DialogDescription>
          </DialogHeader>

          {/* Invite button inside members dialog */}
          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => {
                setMembersOpen(false)
                if (selectedTeam) openInviteDialog(selectedTeam)
              }}
            >
              <UserPlus className="h-4 w-4" />
              Inviter un membre
            </Button>
          </div>

          {loadingMembers ? (
            <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement...
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="py-10 text-center">
              <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">Aucun membre dans cette équipe.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {teamMembers.map((member) => {
                const roleInfo = ROLE_CONFIG[member.role] || ROLE_CONFIG.developer
                const RoleIcon = roleInfo.icon
                const key = member.display_name || member.email || member.user_id
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted/20"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback
                          style={{ backgroundColor: getAvatarColor(key) }}
                          className="text-white text-xs font-semibold"
                        >
                          {getInitials(member.display_name, member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{member.display_name || member.email || "Utilisateur inconnu"}</p>
                        {member.email && member.display_name && (
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-xs gap-1 px-2", roleInfo.badge)}>
                        <RoleIcon className="h-3 w-3" />
                        {roleInfo.label}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              if (selectedTeam) openEditMemberRole(selectedTeam, member)
                            }}
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            Changer le rôle
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (selectedTeam) openRemoveMember(selectedTeam, member)
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Retirer de l&apos;équipe
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Invite Member ── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter un membre</DialogTitle>
            <DialogDescription>
              Envoyez une invitation pour rejoindre l&apos;équipe <strong>{selectedTeam?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Adresse e-mail *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="utilisateur@exemple.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleInvite()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Rôle</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as TeamRole)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="developer">Développeur</SelectItem>
                  <SelectItem value="reviewer">Reviewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Annuler</Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
              onClick={() => void handleInvite()}
              disabled={submitting || !inviteEmail.trim()}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Envoyer l&apos;invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Member Role ── */}
      <Dialog open={editMemberRoleOpen} onOpenChange={setEditMemberRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le rôle</DialogTitle>
            <DialogDescription>
              Changer le rôle de{" "}
              <strong>{selectedMember?.display_name || selectedMember?.email}</strong>
              {" "}dans l&apos;équipe <strong>{selectedTeam?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="edit-member-role">Nouveau rôle</Label>
            <Select value={editRole} onValueChange={(v) => setEditRole(v as TeamRole)}>
              <SelectTrigger id="edit-member-role" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="developer">Développeur</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMemberRoleOpen(false)}>Annuler</Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => void handleUpdateRole()}
              disabled={submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mettre à jour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove Member Confirm ── */}
      <Dialog open={removeMemberOpen} onOpenChange={setRemoveMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retirer le membre</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir retirer{" "}
              <strong>{selectedMember?.display_name || selectedMember?.email}</strong>{" "}
              de l&apos;équipe <strong>{selectedTeam?.name}</strong> ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveMemberOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={() => void handleRemoveMember()} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retirer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invitations / All members Dialog ── */}
      <Dialog open={invitationsOpen} onOpenChange={setInvitationsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Toutes les affectations
            </DialogTitle>
            <DialogDescription>
              Historique complet des membres par équipe
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {teams.map((team) => (
              <div key={team.id}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{team.name}</span>
                  <Badge variant="secondary" className="text-xs">{team.member_count || 0} membres</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 px-2 text-xs gap-1 text-orange-500"
                    onClick={() => {
                      setInvitationsOpen(false)
                      openInviteDialog(team)
                    }}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Inviter
                  </Button>
                </div>
                {(team.members || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-6 pb-2">Aucun membre</p>
                ) : (
                  <div className="space-y-1 pl-6">
                    {(team.members || []).map((m, i) => {
                      const key = m.display_name || m.email || m.user_id
                      const roleInfo = ROLE_CONFIG[m.role] || ROLE_CONFIG.developer
                      return (
                        <div key={i} className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback
                                style={{ backgroundColor: getAvatarColor(key) }}
                                className="text-white text-[10px]"
                              >
                                {getInitials(m.display_name, m.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{m.display_name || m.email || "Membre"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={cn("text-xs", roleInfo.badge)}>{roleInfo.label}</Badge>
                            <span className="text-xs text-muted-foreground">{timeAgo(m.created_at)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
