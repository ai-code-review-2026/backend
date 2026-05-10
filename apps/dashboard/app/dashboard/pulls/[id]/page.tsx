"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2, AlertCircle, MessageSquare, ChevronRight,
  Clock, Check, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ── Mock PR Detail Data ───────────────────────────────────────────────────────

const PR_DETAIL = {
  id: 1287,
  title: "Ajout du filtrage avancé des utilisateurs",
  state: "En attente",
  branch: "feature/advanced-filters",
  target: "main",
  author: { name: "Safa Bejaoui", initials: "SB", color: "bg-blue-500" },
  reviewers: [
    { initials: "MB", color: "bg-orange-500", name: "Maher Bejaoui", status: "En cours" },
    { initials: "SB", color: "bg-blue-500", name: "Safa Bejaoui", status: "En attente" },
    { initials: "AA", color: "bg-orange-400", name: "Ahmed Amin Bejaoui", status: "En attente" },
  ],
  lastUpdate: "il y a 39 min",
  tabs: ["Aperçu", "Fichiers modifiés", "Conversation", "Checks", "Analyse IA"],
  tabCounts: [null, 12, 8, 6, null],
  summary: `Cette PR introduit un filtrage avancé des utilisateurs dans la page d'administration. Les filtres permettent de rechercher par rôle, statut, date de création et activité. Le changement inclut un nouveau composant d'UI réutilisable, des paramètres de requête et des tests unitaires.`,
  changeType: "Feature",
  components: "UI, API, Tests",
  prSize: "+412 -78 lignes",
  reviewTime: "~ 25 min",
  labels: ["feature", "ui", "backend", "filters"],
  files: [
    { name: "src/components/filters/UserFilters.tsx", ext: "TSX", additions: 142, deletions: 12 },
    { name: "src/components/filters/DateRangePicker.tsx", ext: "TSX", additions: 86, deletions: 6 },
    { name: "src/hooks/useUserFilters.ts", ext: "TS", additions: 64, deletions: 4 },
    { name: "src/api/users/params.ts", ext: "TS", additions: 38, deletions: 2 },
    { name: "src/services/users.service.ts", ext: "TS", additions: 45, deletions: 8 },
    { name: "src/pages/admin/UsersPage.tsx", ext: "TSX", additions: 21, deletions: 3 },
    { name: "src/styles/filters.module.css", ext: "CSS", additions: 16, deletions: 0 },
    { name: "tests/unit/filters/UserFilters.test.tsx", ext: "TSX", additions: 22, deletions: 10 },
  ],
  aiScore: 82,
  aiLabel: "Bon",
  aiObservations: [
    "La logique est bien découplée et testable",
    "Bonne gestion des états de chargement",
    "Certaines validations côté client manquantes",
    "Optimisation possible des requêtes",
  ],
  recommendations: [
    { text: "Ajouter des limites sur la pagination côté API", level: "Moyenne" },
    { text: "Gérer le debounce sur les filtres texte", level: "Faible" },
    { text: "Étendre les tests sur les cas de filtres combinés", level: "Faible" },
  ],
  checks: [
    { name: "CI / Build", status: "success", time: "il y a 42 min" },
    { name: "Tests unitaires", status: "success", time: "il y a 42 min" },
    { name: "Lint (ESLint)", status: "success", time: "il y a 42 min" },
    { name: "TypeScript", status: "success", time: "il y a 42 min" },
    { name: "Tests E2E", status: "success", time: "il y a 1 h" },
    { name: "Sécurité (SAST)", status: "success", time: "il y a 1 h" },
  ],
  timeline: [
    { actor: { initials: "SB", color: "bg-blue-500" }, text: "Safa Bejaoui a ouvert cette PR", time: "il y a 2 jours" },
    { actor: { initials: "MB", color: "bg-orange-500" }, text: "Maher Bejaoui a été ajouté comme reviewer", time: "il y a 2 jours" },
    {
      actor: { initials: "SB", color: "bg-blue-500" }, text: "Safa Bejaoui a poussé 3 commits", time: "il y a 1 jour",
      commits: [
        { hash: "a1b2c3d", message: "feat(filters): composant UserFilters" },
        { hash: "d4e5f6g", message: "feat(api): paramètres de recherche" },
        { hash: "f7g8h9i", message: "test(filters): cas limites" },
      ],
    },
    { actor: { initials: "MB", color: "bg-orange-500" }, text: "Maher Bejaoui a ajouté un commentaire", time: "il y a 39 min", highlight: true },
    { actor: { initials: "SB", color: "bg-blue-500" }, text: "Safa Bejaoui a mis à jour la PR", time: "il y a 39 min", note: "Rebase sur main et corrections mineures.", highlight: true },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function AIScoreCircle({ score, label }: { score: number; label: string }) {
  const color = score >= 90 ? "#22c55e" : score >= 75 ? "#3b82f6" : score >= 60 ? "#f59e0b" : "#ef4444"
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const strokeDash = (score / 100) * circumference
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-16 w-16">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="4" />
          <circle
            cx="32" cy="32" r={radius} fill="none" stroke={color} strokeWidth="4"
            strokeDasharray={`${strokeDash} ${circumference}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold" style={{ color }}>
          {score}
        </span>
      </div>
      <span className="text-sm font-medium mt-1" style={{ color }}>{label}</span>
    </div>
  )
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span className={cn(
      "text-[11px] px-2 py-0.5 rounded font-medium",
      level === "Haute" ? "bg-red-100 text-red-600" :
      level === "Moyenne" ? "bg-orange-100 text-orange-600" :
      "bg-blue-100 text-blue-600"
    )}>
      {level}
    </span>
  )
}

// ── Page Component ────────────────────────────────────────────────────────────

export default function PRDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(0)
  const pr = PR_DETAIL

  return (
    <div className="flex flex-col h-full bg-gray-50/30">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 px-6 py-2 text-sm text-gray-500 border-b border-gray-200 bg-white">
        <button onClick={() => router.push("/dashboard/repositories")} className="hover:text-gray-700">Dépôts</button>
        <ChevronRight className="h-3.5 w-3.5" />
        <button className="hover:text-gray-700">air-review</button>
        <ChevronRight className="h-3.5 w-3.5" />
        <button className="hover:text-gray-700">air-review/web-app</button>
        <ChevronRight className="h-3.5 w-3.5" />
        <button onClick={() => router.push("/dashboard/pulls")} className="hover:text-gray-700">Pull Requests</button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-gray-700">#{pr.id}</span>
      </div>

      {/* PR Title + Actions */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-bold text-gray-900">#{pr.id} — {pr.title}</h1>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <Button className="bg-green-600 hover:bg-green-700 text-white gap-1.5 text-sm">
              <Check className="h-4 w-4" />
              Approuver
            </Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5 text-sm">
              <AlertCircle className="h-4 w-4" />
              Demander des changements
            </Button>
            <Button variant="outline" className="gap-1.5 text-sm border-gray-200">
              <MessageSquare className="h-4 w-4" />
              Commenter
            </Button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 mt-3 flex-wrap text-sm text-gray-600">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-600 text-xs font-medium">
            En attente
          </span>
          <span className="flex items-center gap-1">
            branche :
            <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700 ml-1">
              feature/advanced-filters
            </span>
            <span className="mx-1">→</span>
            cible :
            <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700 ml-1">main</span>
          </span>
          <span className="flex items-center gap-1.5">
            Auteur
            <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-medium", pr.author.color)}>
              {pr.author.initials}
            </span>
            <span>{pr.author.name}</span>
          </span>
          <span className="flex items-center gap-1.5">
            Reviewers
            {pr.reviewers.map((r, i) => (
              <span key={i} className={cn("h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-medium", r.color)}>
                {r.initials}
              </span>
            ))}
            <span className="text-xs text-gray-500">+1</span>
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
            <span className="font-medium text-gray-600">Dernière mise à jour</span>
            <Clock className="h-3.5 w-3.5" />
            {pr.lastUpdate}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 mt-4 border-b border-gray-200 -mb-px">
          {pr.tabs.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5",
                activeTab === i
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {tab}
              {pr.tabCounts[i] !== null && (
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full font-medium",
                  activeTab === i ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-500"
                )}>
                  {pr.tabCounts[i]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 0 && (
          <div className="px-6 py-4 grid grid-cols-3 gap-4">
            {/* Left col */}
            <div className="col-span-2 space-y-4">
              {/* Résumé */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 mb-3">Résumé</h2>
                <p className="text-sm text-gray-600 leading-relaxed">{pr.summary}</p>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-40">⊙ Type de changement</span>
                    <span className="text-gray-700">{pr.changeType}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-40">⊞ Composants</span>
                    <span className="text-gray-700">{pr.components}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-40">≡ Taille de la PR</span>
                    <span className="text-green-600 font-medium">+412</span>
                    <span className="text-red-500 font-medium">-78 lignes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-40">⊙ Temps estimé de revue</span>
                    <span className="text-gray-700">{pr.reviewTime}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-400 w-40 mt-0.5">⊘ Étiquettes</span>
                    <div className="flex flex-wrap gap-1.5">
                      {pr.labels.map(l => (
                        <span key={l} className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          l === "feature" ? "bg-blue-100 text-blue-700" :
                          l === "ui" ? "bg-purple-100 text-purple-700" :
                          l === "backend" ? "bg-indigo-100 text-indigo-700" :
                          "bg-gray-100 text-gray-600"
                        )}>
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Analyse IA */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 mb-4">Analyse IA</h2>
                <div className="flex items-start gap-6">
                  <div className="shrink-0">
                    <p className="text-xs text-gray-500 mb-2 text-center">Score global</p>
                    <AIScoreCircle score={pr.aiScore} label={pr.aiLabel} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700 mb-2">Principales observations</p>
                    <ul className="space-y-1.5">
                      {pr.aiObservations.map((obs, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-gray-400 mt-0.5">•</span>
                          {obs}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Recommandations</p>
                  <div className="space-y-2">
                    {pr.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-orange-500" readOnly />
                        <span className="text-sm text-gray-700 flex-1">{rec.text}</span>
                        <LevelBadge level={rec.level} />
                      </div>
                    ))}
                  </div>
                </div>
                <button className="mt-3 text-sm text-orange-500 hover:underline">Voir l&apos;analyse complète</button>
              </div>
            </div>

            {/* Middle col */}
            <div className="space-y-4">
              {/* Fichiers modifiés */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="font-semibold text-gray-900 mb-3">Fichiers modifiés ({pr.files.length})</h2>
                <div className="space-y-1.5">
                  {pr.files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-gray-700 flex-1 truncate">{f.name}</span>
                      <span className="text-gray-400 shrink-0">{f.ext}</span>
                      <span className="text-green-600 shrink-0">+{f.additions}</span>
                      <span className="text-red-500 shrink-0">-{f.deletions}</span>
                    </div>
                  ))}
                </div>
                <button className="mt-3 text-sm text-orange-500 hover:underline">Voir les 4 autres fichiers</button>
              </div>

              {/* Checks */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900">Checks</h2>
                  <span className="text-sm font-medium text-green-600">6 / 6 réussis</span>
                </div>
                <div className="space-y-2">
                  {pr.checks.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <span className="flex-1 text-gray-700">{c.name}</span>
                      <span className="text-green-500 text-xs shrink-0">a réussi</span>
                      <span className="text-gray-400 text-xs shrink-0">{c.time}</span>
                    </div>
                  ))}
                </div>
                <button className="mt-3 text-sm text-orange-500 hover:underline">Voir tous les checks</button>
              </div>

              {/* Chronologie */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="font-semibold text-gray-900 mb-3">Chronologie</h2>
                <div className="space-y-3">
                  {pr.timeline.map((event, i) => (
                    <div key={i} className={cn("flex gap-2.5", event.highlight && "border-l-2 border-orange-400 pl-2 -ml-2")}>
                      <span className={cn("h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0 mt-0.5", event.actor.color)}>
                        {event.actor.initials}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-gray-700 leading-relaxed">{event.text}</p>
                          <span className="text-[10px] text-gray-400 shrink-0">{event.time}</span>
                        </div>
                        {event.commits && (
                          <div className="mt-1.5 space-y-1">
                            {event.commits.map((c, j) => (
                              <div key={j} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                <span className="font-mono bg-gray-100 px-1 rounded text-gray-600">{c.hash}</span>
                                <span>{c.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {event.note && <p className="text-xs text-gray-500 mt-1">{event.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                <button className="mt-3 text-sm text-orange-500 hover:underline w-full text-center border border-gray-200 rounded py-1.5 hover:bg-gray-50">
                  Voir toute l&apos;activité
                </button>
              </div>

              {/* Reviewers */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900">Reviewers</h2>
                </div>
                <div className="space-y-3">
                  {pr.reviewers.map((r, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className={cn("h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0", r.color)}>
                        {r.initials}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-800">{r.name}</p>
                        <p className="text-[11px] text-gray-400">Reviewer</p>
                      </div>
                      <span className="text-sm text-gray-500">{r.status}</span>
                      <Clock className="h-4 w-4 text-orange-400 shrink-0" />
                    </div>
                  ))}
                </div>
                <button className="mt-3 text-sm text-orange-500 hover:underline">Gérer les reviewers</button>
              </div>
            </div>
          </div>
        )}

        {activeTab !== 0 && (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
            Contenu de l&apos;onglet &quot;{pr.tabs[activeTab]}&quot; — à implémenter
          </div>
        )}
      </div>
    </div>
  )
}
