"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  GitPullRequest, Clock, Users, CheckCircle2,
  Search, Download, Plus, Eye, MessageSquare, MoreHorizontal,
  Filter, RotateCcw, ChevronLeft, ChevronRight,
} from "lucide-react"
import { Github } from "@/components/ui/social-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_PRS = [
  {
    id: 1287, title: "Ajout du filtrage avancé des utilisateurs",
    repo: "ai-review/web-app", author: "Safa Bejaoui", authorInitials: "SB", authorColor: "bg-blue-500",
    state: "En attente" as const, priority: "Haute" as const,
    tags: ["feature", "+3"],
    reviewers: [
      { initials: "MB", color: "bg-gray-700" },
      { initials: "II", color: "bg-gray-700" },
      { label: "+1" },
    ],
    lastActivity: "il y a 30 min", lastActivityUser: "Safa Bejaoui",
    aiScore: 92, aiLabel: "Excellent", aiColor: "#22c55e",
    comments: 2, createdAt: "il y a 2 heures",
  },
  {
    id: 1286, title: "Refactorisation du service d'authentification",
    repo: "ai-review/backend", author: "Maher Bejaoui", authorInitials: "MB", authorColor: "bg-orange-500",
    state: "À réviser" as const, priority: "Moyenne" as const,
    tags: ["refactor", "+2"],
    reviewers: [
      { initials: "SB", color: "bg-blue-500" },
      { initials: "II", color: "bg-gray-700" },
    ],
    lastActivity: "il y a 1 heure", lastActivityUser: "Maher Bejaoui",
    aiScore: 78, aiLabel: "Bon", aiColor: "#3b82f6",
    comments: 4, createdAt: "il y a 5 heures",
  },
  {
    id: 1285, title: "Mise à jour des dépendances",
    repo: "ai-review/web-app", author: "Islem Islem", authorInitials: "II", authorColor: "bg-gray-600",
    state: "Approved" as const, priority: "Basse" as const,
    tags: ["chore", "+1"],
    reviewers: [
      { initials: "GG", color: "bg-purple-500" },
    ],
    lastActivity: "il y a 3 heures", lastActivityUser: "Islem Islem",
    aiScore: 85, aiLabel: "Très bon", aiColor: "#22c55e",
    comments: 1, createdAt: "il y a 1 jour",
  },
  {
    id: 1284, title: "Correction du calcul du score IA",
    repo: "ai-review/ai-core", author: "Ghazi Ghribi", authorInitials: "GG", authorColor: "bg-purple-500",
    state: "Merged" as const, priority: "Haute" as const,
    tags: ["fix", "+2"],
    reviewers: [
      { initials: "SB", color: "bg-blue-500" },
      { initials: "MB", color: "bg-orange-500" },
    ],
    lastActivity: "il y a 8 heures", lastActivityUser: "Ghazi Ghribi",
    aiScore: 95, aiLabel: "Excellent", aiColor: "#22c55e",
    comments: 0, createdAt: "il y a 2 jours",
  },
  {
    id: 1285, title: "Ajout des tests d'intégration",
    repo: "ai-review/backend", author: "Marwen Essid", authorInitials: "ME", authorColor: "bg-teal-500",
    state: "À réviser" as const, priority: "Moyenne" as const,
    tags: ["test", "+4"],
    reviewers: [
      { initials: "II", color: "bg-gray-600" },
      { initials: "GG", color: "bg-purple-500" },
      { label: "+1" },
    ],
    lastActivity: "il y a 2 heures", lastActivityUser: "Marwen Essid",
    aiScore: 72, aiLabel: "Bon", aiColor: "#3b82f6",
    comments: 3, createdAt: "il y a 2 jours",
  },
  {
    id: 1282, title: "Amélioration de l'export PDF",
    repo: "ai-review/web-app", author: "Ahmed Amin Bejaoui", authorInitials: "AA", authorColor: "bg-orange-400",
    state: "Draft" as const, priority: "Moyenne" as const,
    tags: ["feature", "+3"],
    reviewers: [],
    lastActivity: "il y a 1 jour", lastActivityUser: "Ahmed Amin Bejaoui",
    aiScore: null, aiLabel: "N/A", aiColor: "#6b7280",
    comments: 0, createdAt: "il y a 3 jours",
  },
  {
    id: 1281, title: "Gestion des erreurs réseau",
    repo: "ai-review/ai-core", author: "Safa Bejaoui", authorInitials: "SB", authorColor: "bg-blue-500",
    state: "Closed" as const, priority: "Haute" as const,
    tags: ["fix", "+2"],
    reviewers: [
      { initials: "MB", color: "bg-orange-500" },
    ],
    lastActivity: "il y a 2 jours", lastActivityUser: "Maher Bejaoui",
    aiScore: 66, aiLabel: "Moyen", aiColor: "#f59e0b",
    comments: 0, createdAt: "il y a 4 jours",
  },
]

const WAITING_AUTHOR_PRS = [
  {
    id: 1284, title: "Ajout d'un audit de sécurité",
    repo: "ai-review/web-core", author: "Safa Belaoui", authorInitials: "SB", authorColor: "bg-blue-500",
    state: "Waiting for author" as const, priority: "Haute" as const,
    tags: ["feature", "+2"],
    reviewers: [
      { initials: "MB", color: "bg-orange-500" },
      { initials: "II", color: "bg-gray-600" },
      { label: "+1" },
    ],
    lastActivity: "il y a 2 h", lastActivityUser: "Safa Belaoui",
    aiScore: 82, aiLabel: "Bon", aiColor: "#3b82f6",
    comments: 2, createdAt: "il y a 1 jour",
  },
  {
    id: 1281, title: "Refactorisation du service",
    repo: "ai-review/backend", author: "Maher Bejaoui", authorInitials: "MB", authorColor: "bg-orange-500",
    state: "Waiting for author" as const, priority: "Moyenne" as const,
    tags: ["backend", "+1"],
    reviewers: [
      { initials: "SB", color: "bg-blue-500" },
      { initials: "II", color: "bg-gray-600" },
    ],
    lastActivity: "il y a 5 h", lastActivityUser: "Maher Bejaoui",
    aiScore: 78, aiLabel: "Bon", aiColor: "#3b82f6",
    comments: 4, createdAt: "il y a 2 jours",
  },
  {
    id: 1279, title: "Mise à jour des dépendances",
    repo: "ai-review/web-app", author: "Islam Iciem", authorInitials: "II", authorColor: "bg-gray-600",
    state: "Waiting for author" as const, priority: "Basse" as const,
    tags: ["chore", "+1"],
    reviewers: [
      { initials: "GG", color: "bg-purple-500" },
    ],
    lastActivity: "il y a 3 h", lastActivityUser: "Islam Iciem",
    aiScore: 65, aiLabel: "Bon", aiColor: "#3b82f6",
    comments: 1, createdAt: "il y a 2 jours",
  },
  {
    id: 1276, title: "Amélioration des logs applicatifs",
    repo: "ai-review/web-core", author: "Ahmed Amin Bejaoui", authorInitials: "AA", authorColor: "bg-orange-400",
    state: "Waiting for author" as const, priority: "Moyenne" as const,
    tags: ["enhancement", "+1"],
    reviewers: [
      { initials: "SB", color: "bg-blue-500" },
      { initials: "MB", color: "bg-orange-500" },
    ],
    lastActivity: "il y a 6 h", lastActivityUser: "Ahmed Amin Bejaoui",
    aiScore: 72, aiLabel: "Bon", aiColor: "#3b82f6",
    comments: 3, createdAt: "il y a 4 jours",
  },
  {
    id: 1276, title: "Correction du calcul du score IA",
    repo: "ai-review/ai-core", author: "Ghazi Ghribi", authorInitials: "GG", authorColor: "bg-purple-500",
    state: "Waiting for author" as const, priority: "Haute" as const,
    tags: ["fix", "+2"],
    reviewers: [
      { initials: "SB", color: "bg-blue-500" },
      { initials: "MB", color: "bg-orange-500" },
    ],
    lastActivity: "il y a 6 h", lastActivityUser: "Ghazi Ghribi",
    aiScore: 95, aiLabel: "Excellent", aiColor: "#22c55e",
    comments: 2, createdAt: "il y a 4 jours",
  },
  {
    id: 1269, title: "Ajout des tests d'intégration",
    repo: "ai-review/backend", author: "Marwen Essid", authorInitials: "ME", authorColor: "bg-teal-500",
    state: "Waiting for author" as const, priority: "Moyenne" as const,
    tags: ["test", "+1"],
    reviewers: [
      { initials: "II", color: "bg-gray-600" },
      { initials: "GG", color: "bg-purple-500" },
      { label: "+1" },
    ],
    lastActivity: "il y a 12 h", lastActivityUser: "Marwen Essid",
    aiScore: 68, aiLabel: "Moyen", aiColor: "#f59e0b",
    comments: 1, createdAt: "il y a 4 jours",
  },
]

// ── Types ─────────────────────────────────────────────────────────────────────

type PRState = "En attente" | "À réviser" | "Approved" | "Merged" | "Draft" | "Closed" | "Waiting for author"
type FilterState = "Toutes" | "Open" | "Draft" | "Waiting for author" | "Approved" | "Merged" | "Closed"

// ── Helpers ───────────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: PRState }) {
  const styles: Record<PRState, string> = {
    "En attente": "text-orange-600 bg-orange-50 border-orange-200",
    "À réviser": "text-blue-600 bg-blue-50 border-blue-200",
    "Approved": "text-green-600 bg-green-50 border-green-200",
    "Merged": "text-purple-600 bg-purple-50 border-purple-200",
    "Draft": "text-gray-600 bg-gray-50 border-gray-200",
    "Closed": "text-red-600 bg-red-50 border-red-200",
    "Waiting for author": "text-orange-600 bg-orange-50 border-orange-200",
  }
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border", styles[state])}>
      {state}
    </span>
  )
}

function PriorityDot({ priority }: { priority: "Haute" | "Moyenne" | "Basse" }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", {
        "bg-red-500": priority === "Haute",
        "bg-orange-400": priority === "Moyenne",
        "bg-green-500": priority === "Basse",
      })} />
      <span className="text-sm text-gray-700">{priority}</span>
    </div>
  )
}

function AIScoreCircle({ score, label, color }: { score: number | null; label: string; color: string }) {
  if (score === null) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-sm text-gray-400">—</span>
        <span className="text-[10px] text-gray-400">N/A</span>
      </div>
    )
  }
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const strokeDash = (score / 100) * circumference
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-10 w-10">
        <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle
            cx="20" cy="20" r={radius} fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${strokeDash} ${circumference}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>
          {score}
        </span>
      </div>
      <span className="text-[10px] mt-0.5" style={{ color }}>{label}</span>
    </div>
  )
}

function ReviewerAvatars({ reviewers }: { reviewers: Array<{ initials?: string; color?: string; label?: string }> }) {
  return (
    <div className="flex items-center gap-1">
      {reviewers.map((r, i) =>
        r.label ? (
          <span key={i} className="text-xs text-gray-500 border rounded-full h-7 w-7 flex items-center justify-center border-gray-200 bg-white text-[10px]">
            {r.label}
          </span>
        ) : (
          <span key={i} className={cn("h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-medium", r.color)}>
            {r.initials}
          </span>
        )
      )}
    </div>
  )
}

// ── PR Table Row ──────────────────────────────────────────────────────────────

function PRTableRow({ pr, onClick }: { pr: typeof MOCK_PRS[0]; onClick: () => void }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer" onClick={onClick}>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <a
              href="#"
              className="text-orange-500 font-medium text-sm hover:underline"
              onClick={e => { e.stopPropagation() }}
            >
              #{pr.id}
            </a>
            <span className="text-sm font-medium text-gray-800">{pr.title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {pr.tags.map((tag, i) => (
              <span key={i} className={cn(
                "text-[11px] px-2 py-0.5 rounded-full font-medium",
                tag.startsWith("+") ? "bg-gray-100 text-gray-500 text-xs" :
                tag === "feature" ? "bg-blue-100 text-blue-700" :
                tag === "refactor" ? "bg-purple-100 text-purple-700" :
                tag === "fix" ? "bg-red-100 text-red-700" :
                tag === "chore" ? "bg-gray-100 text-gray-600" :
                tag === "test" ? "bg-green-100 text-green-700" :
                tag === "backend" ? "bg-indigo-100 text-indigo-700" :
                tag === "enhancement" ? "bg-teal-100 text-teal-700" :
                "bg-gray-100 text-gray-600"
              )}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <Github className="h-4 w-4 text-gray-400" />
          {pr.repo}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0", pr.authorColor)}>
            {pr.authorInitials}
          </span>
          <div>
            <div className="text-sm text-gray-800">{pr.author}</div>
            <div className="text-[11px] text-gray-400">{pr.createdAt}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Statebadge state={pr.state as PRState} />
      </td>
      <td className="px-4 py-3">
        <PriorityDot priority={pr.priority} />
      </td>
      <td className="px-4 py-3">
        <ReviewerAvatars reviewers={pr.reviewers} />
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-gray-700">{pr.lastActivity}</div>
        <div className="text-[11px] text-gray-400">{pr.lastActivityUser}</div>
      </td>
      <td className="px-4 py-3">
        <AIScoreCircle score={pr.aiScore} label={pr.aiLabel} color={pr.aiColor} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700">
            <Eye className="h-4 w-4" />
          </Button>
          {pr.comments > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-1.5 text-gray-400 hover:text-gray-700 flex items-center gap-0.5">
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs">{pr.comments}</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Voir les détails</DropdownMenuItem>
              <DropdownMenuItem>Approuver</DropdownMenuItem>
              <DropdownMenuItem>Demander des changements</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  )
}

// Fix naming inconsistency
function Statebadge({ state }: { state: PRState }) {
  return <StateBadge state={state} />
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PullRequestsPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [refFilter, setRefFilter] = useState("Tous")
  const [authorFilter, setAuthorFilter] = useState("Tous")
  const [priorityFilter, setPriorityFilter] = useState("Toutes")
  const [batFilter, setBatFilter] = useState("Toutes")
  const [stateFilter, setStateFilter] = useState<FilterState>("Toutes")
  const [page, setPage] = useState(1)

  const isWaitingAuthorFilter = stateFilter === "Waiting for author"
  const prs = isWaitingAuthorFilter ? WAITING_AUTHOR_PRS : MOCK_PRS

  const filteredPRs = prs.filter(pr => {
    if (search && !pr.title.toLowerCase().includes(search.toLowerCase()) && !String(pr.id).includes(search)) return false
    if (stateFilter !== "Toutes" && !isWaitingAuthorFilter && pr.state !== stateFilter) return false
    return true
  })

  const STATE_FILTERS: FilterState[] = ["Toutes", "Open", "Draft", "Waiting for author", "Approved", "Merged", "Closed"]

  const stats = [
    { label: "Total PRs", value: "124", sub: "+18 cette semaine", subColor: "text-orange-500", icon: <GitPullRequest className="h-6 w-6 text-orange-400" />, iconBg: "bg-orange-50" },
    { label: "En attente", value: "28", sub: "22.6% du total", subColor: "text-orange-500", icon: <Clock className="h-6 w-6 text-orange-400" />, iconBg: "bg-orange-50" },
    { label: "À réviser", value: "36", sub: "29.0% du total", subColor: "text-orange-500", icon: <Users className="h-6 w-6 text-orange-400" />, iconBg: "bg-orange-50" },
    { label: "Fusionnées", value: "42", sub: "33.9% du total", subColor: "text-green-500", icon: <CheckCircle2 className="h-6 w-6 text-green-400" />, iconBg: "bg-green-50" },
  ]

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-orange-100 flex items-center justify-center">
            <GitPullRequest className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Toutes les Pull Requests</h1>
            <p className="text-sm text-gray-500">
              {isWaitingAuthorFilter
                ? "Filtrez les PRs par état, priorité et activité."
                : "Consultez et gérez toutes les pull requests de vos dépôts."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-sm">
            <Download className="h-4 w-4" />
            Exporter
          </Button>
          <Button size="sm" className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm">
            <Plus className="h-4 w-4" />
            Nouvelle Pull Request
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Stats cards */}
        <div className="grid grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{s.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{s.value}</p>
                <p className={cn("text-sm mt-1", s.subColor)}>{s.sub}</p>
              </div>
              <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", s.iconBg)}>
                {s.icon}
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          {/* Search + dropdowns row */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher par titre, ID, description..."
                className="pl-9 h-9 text-sm border-gray-200"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={refFilter} onValueChange={setRefFilter}>
              <SelectTrigger className="w-32 h-9 text-sm border-gray-200">
                <span className="text-xs text-gray-500 mr-1">Référentiel</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Tous">Tous</SelectItem>
                <SelectItem value="ai-review/web-app">ai-review/web-app</SelectItem>
                <SelectItem value="ai-review/backend">ai-review/backend</SelectItem>
                <SelectItem value="ai-review/ai-core">ai-review/ai-core</SelectItem>
              </SelectContent>
            </Select>
            <Select value={authorFilter} onValueChange={setAuthorFilter}>
              <SelectTrigger className="w-28 h-9 text-sm border-gray-200">
                <span className="text-xs text-gray-500 mr-1">Auteur</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Tous">Tous</SelectItem>
                <SelectItem value="Safa Bejaoui">Safa Bejaoui</SelectItem>
                <SelectItem value="Maher Bejaoui">Maher Bejaoui</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-28 h-9 text-sm border-gray-200">
                <span className="text-xs text-gray-500 mr-1">Priorité</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Toutes">Toutes</SelectItem>
                <SelectItem value="Haute">Haute</SelectItem>
                <SelectItem value="Moyenne">Moyenne</SelectItem>
                <SelectItem value="Basse">Basse</SelectItem>
              </SelectContent>
            </Select>
            {isWaitingAuthorFilter ? (
              <Select value={batFilter} onValueChange={setBatFilter}>
                <SelectTrigger className="w-28 h-9 text-sm border-gray-200">
                  <span className="text-xs text-gray-500 mr-1">Reviewers</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Toutes">Tous</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value={batFilter} onValueChange={setBatFilter}>
                <SelectTrigger className="w-24 h-9 text-sm border-gray-200">
                  <span className="text-xs text-gray-500 mr-1">Bat</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Toutes">Toutes</SelectItem>
                </SelectContent>
              </Select>
            )}
            {!isWaitingAuthorFilter && (
              <div className="flex items-center gap-1 ml-auto">
                {STATE_FILTERS.map(f => (
                  <button
                    key={f}
                    onClick={() => setStateFilter(f)}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded font-medium transition-colors",
                      stateFilter === f
                        ? "bg-orange-500 text-white"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* State filter row for waiting author view */}
          {isWaitingAuthorFilter && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 font-medium">Filtre d&apos;état</span>
                {STATE_FILTERS.map(f => (
                  <button
                    key={f}
                    onClick={() => setStateFilter(f)}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded font-medium transition-colors",
                      stateFilter === f
                        ? "bg-orange-500 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-sm h-8">
                  <Filter className="h-3.5 w-3.5" />
                  Filtres avancés
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-sm h-8">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Réinitialiser
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Results count + active filter */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitPullRequest className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {filteredPRs.length} PRs trouvées
              </span>
              {isWaitingAuthorFilter && (
                <span className="flex items-center gap-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                  État actif : Waiting for author
                  <button onClick={() => setStateFilter("Toutes")} className="ml-1 hover:text-gray-800">×</button>
                </span>
              )}
            </div>
            {isWaitingAuthorFilter && (
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <span className="text-gray-400">↕ trié par :</span>
                <button className="text-gray-700 font-medium hover:underline flex items-center gap-0.5">
                  Dernière activité ▾
                </button>
              </div>
            )}
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">PR</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">RÉFÉRENTIEL</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">AUTEUR</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">ÉTAT</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">PRIORITÉ</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">REVIEWERS</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">DERNIÈRE ACTIVITÉ</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">SCORE IA</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredPRs.map((pr, i) => (
                <PRTableRow
                  key={`${pr.id}-${i}`}
                  pr={pr as typeof MOCK_PRS[0]}
                  onClick={() => router.push(`/dashboard/pulls/${pr.id}`)}
                />
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Affichage de 1 à {filteredPRs.length} sur {isWaitingAuthorFilter ? 14 : 124} résultats
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-gray-200">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {[1, 2, 3].map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "h-8 w-8 text-sm rounded border font-medium transition-colors",
                    page === p ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {p}
                </button>
              ))}
              {!isWaitingAuthorFilter && (
                <>
                  <span className="text-gray-400 text-sm px-1">...</span>
                  <button className="h-8 w-8 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50">13</button>
                </>
              )}
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-gray-200">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Select defaultValue="10">
                <SelectTrigger className="w-24 h-8 text-sm border-gray-200 ml-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
