"use client"

import {
  Suspense, useCallback, useEffect, useMemo, useRef, useState,
} from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search, Eye, Trash2, GitCompare, AlertTriangle, XCircle,
  Clock, CheckCircle2, Loader2, CalendarDays, FolderGit2,
  BarChart3, Activity, ArrowUpDown, ArrowUp, ArrowDown,
  RefreshCw, Terminal, ChevronUp, ChevronDown, ChevronLeft,
  ChevronRight, Filter, Plus,
} from "lucide-react"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator }  from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  deleteDashboardAnalysis,
  fetchDashboardAnalyses,
  hasActiveDashboardAnalysis,
  type DashboardAnalysisItem,
} from "@/lib/dashboard-analyses"
import { normalizeAnalysisStatus as norm } from "@/lib/domain/analysis-status"
import { AnalysesPageHeader } from "@/components/dashboard/AnalysesPageHeader"
import AgentPlan from "@/components/ui/agent-plan"

// ─── Design tokens ────────────────────────────────────────────────────────────
const ORANGE = "#E8713A"
const PAGE_SIZE = 6

// ─── Date formatter ───────────────────────────────────────────────────────────
function fmtDate(v: string) {
  if (!v) return "—"
  const d = new Date(v)
  if (isNaN(d.getTime())) return "—"
  // e.g. "19 avr. 2025\n05:34"
  const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  return { date, time }
}

type SortField = "created_at" | "status" | "repo" | "findings"
type SortDir   = "asc" | "desc"

// ─── Status config ────────────────────────────────────────────────────────────
const S: Record<string, {
  label: string
  dot: string          // tailwind bg class for dot
  text: string         // tailwind text class
  pill: string         // tailwind classes for pill bg + border
  icon: React.ElementType
}> = {
  COMPLETED: {
    label: "Terminé",
    dot:  "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    pill: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/25",
    icon: CheckCircle2,
  },
  RUNNING: {
    label: "En cours",
    dot:  "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
    pill: "bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/25",
    icon: Loader2,
  },
  QUEUED: {
    label: "En attente",
    dot:  "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    pill: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25",
    icon: Clock,
  },
  FAILED: {
    label: "Échouée",
    dot:  "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    pill: "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/25",
    icon: XCircle,
  },
  RECEIVED: {
    label: "Reçu",
    dot:  "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    pill: "bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/25",
    icon: Activity,
  },
}
const SFALLBACK = S["QUEUED"]
function sm(raw: string) {
  const k = norm(raw)?.toUpperCase() ?? raw?.toUpperCase() ?? ""
  return S[k] ?? SFALLBACK
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ raw }: { raw: string }) {
  const m = sm(raw)
  const active = ["RUNNING","QUEUED","RECEIVED"].includes(norm(raw)?.toUpperCase() ?? "")
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold",
      m.pill, m.text,
    )}>
      <span className={cn("h-2 w-2 rounded-full flex-shrink-0", m.dot, active && "animate-pulse")} />
      {m.label}
    </span>
  )
}

// ─── Findings badge ───────────────────────────────────────────────────────────
function FindingsBadge({ b = 0, w = 0 }: { b?: number; w?: number }) {
  if (b === 0 && w === 0) return <span className="text-xs text-muted-foreground/40">—</span>
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500">
        <XCircle className="h-3.5 w-3.5" />
        {b > 0 ? b : "—"}
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500">
        <AlertTriangle className="h-3.5 w-3.5" />
        {w > 0 ? w : "—"}
      </span>
    </div>
  )
}

// ─── Sort header ──────────────────────────────────────────────────────────────
function SortTh({
  field, label, cur, dir, onSort,
}: {
  field: SortField; label: string; cur: SortField; dir: SortDir
  onSort: (f: SortField) => void
}) {
  const active = field === cur
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-colors select-none",
        active ? "text-[#E8713A]" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active
        ? dir === "asc"
          ? <ArrowUp className="h-3 w-3" />
          : <ArrowDown className="h-3 w-3" style={{ color: ORANGE }} />
        : <ArrowUpDown className="h-3 w-3 opacity-30" />
      }
    </button>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  value, label, icon: Icon, iconBg, iconFg,
}: {
  value: number; label: string; icon: React.ElementType
  iconBg: string; iconFg: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <div className={cn("flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl", iconBg)}>
        <Icon className={cn("h-5 w-5", iconFg)} />
      </div>
      <div>
        <p className="text-3xl font-bold leading-tight text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const PERIODS = [
  { v: "today", l: "Aujourd'hui" },
  { v: "week",  l: "Cette semaine" },
  { v: "month", l: "Ce mois" },
  { v: "all",   l: "Tout" },
]
const STATUSES = [
  { v: "COMPLETED", l: "Terminé",    dot: "bg-emerald-500" },
  { v: "RUNNING",   l: "En cours",   dot: "bg-orange-500" },
  { v: "QUEUED",    l: "En attente", dot: "bg-amber-500" },
  { v: "FAILED",    l: "Échouée",    dot: "bg-red-500" },
]

function Sidebar({
  period, statuses,
  onPeriod, onStatus, onReset,
}: {
  period: string; statuses: string[]
  onPeriod: (v: string) => void
  onStatus: (v: string) => void
  onReset: () => void
}) {
  const [pOpen, setPOpen] = useState(true)
  const [sOpen, setSOpen] = useState(true)

  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-border bg-card/50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2" style={{ color: ORANGE }}>
          <Filter className="h-4 w-4" />
          <span className="text-xs font-extrabold uppercase tracking-widest">FILTRES</span>
        </div>
        <button
          onClick={onReset}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Réinitialiser
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 py-2 space-y-0.5">

          {/* Période */}
          <div>
            <button
              onClick={() => setPOpen(p => !p)}
              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Période
              </div>
              {pOpen
                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              }
            </button>
            <AnimatePresence initial={false}>
              {pOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="pb-1 pt-0.5 space-y-0.5">
                    {PERIODS.map(opt => {
                      const active = period === opt.v
                      return (
                        <button
                          key={opt.v}
                          onClick={() => onPeriod(opt.v)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-all",
                            active
                              ? "font-semibold"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                          style={active ? {
                            background: `${ORANGE}15`,
                            color: ORANGE,
                          } : undefined}
                        >
                          {/* Radio */}
                          <span className={cn(
                            "flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 flex-shrink-0 transition-colors",
                          )}
                          style={{
                            borderColor: active ? ORANGE : undefined,
                          }}
                          >
                            {active && (
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: ORANGE }}
                              />
                            )}
                          </span>
                          {opt.l}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Separator className="my-1" />

          {/* Statut */}
          <div>
            <button
              onClick={() => setSOpen(p => !p)}
              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Statut
              </div>
              {sOpen
                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              }
            </button>
            <AnimatePresence initial={false}>
              {sOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="pb-1 pt-0.5 space-y-0.5">
                    {STATUSES.map(opt => {
                      const active = statuses.includes(opt.v)
                      return (
                        <button
                          key={opt.v}
                          onClick={() => onStatus(opt.v)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-all",
                            active
                              ? "font-semibold"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                          style={active ? { color: ORANGE } : undefined}
                        >
                          <span className={cn("h-2 w-2 rounded-full flex-shrink-0", opt.dot)} />
                          {opt.l}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </ScrollArea>
    </aside>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────
function Row({
  item, sel, onSel, onDel, idx,
}: {
  item: DashboardAnalysisItem
  sel: boolean
  onSel: () => void
  onDel: () => void
  idx: number
}) {
  const fmt = fmtDate(item.createdAt)
  const projectId = item.projectId?.trim().length ? item.projectId : item.id

  return (
    <motion.tr
      key={item.id}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: idx * 0.02 }}
      className={cn(
        "group border-b border-border transition-colors",
        sel ? "bg-orange-500/5" : "hover:bg-accent/40",
      )}
    >
      {/* Checkbox */}
      <td className="w-10 pl-5 pr-2 py-3.5">
        <Checkbox
          checked={sel}
          onCheckedChange={onSel}
          className="border-border data-[state=checked]:bg-[#E8713A] data-[state=checked]:border-[#E8713A]"
        />
      </td>

      {/* Status */}
      <td className="py-3.5 pr-4 w-[130px]">
        <StatusPill raw={item.status} />
      </td>

      {/* Repo */}
      <td className="py-3.5 pr-6 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <FolderGit2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">
            {item.repo || "—"}
          </span>
        </div>
      </td>

      {/* Findings */}
      <td className="py-3.5 pr-6 w-[160px]">
        <FindingsBadge b={item.blockerCount} w={item.warnCount} />
      </td>

      {/* Date */}
      <td className="py-3.5 pr-4 w-[140px]">
        {typeof fmt === "object" ? (
          <div className="flex flex-col leading-tight">
            <span className="text-sm text-foreground">{fmt.date}</span>
            <span className="text-xs text-muted-foreground">{fmt.time}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">{fmt}</span>
        )}
      </td>

      {/* Actions */}
      <td className="py-3.5 pr-5 w-[110px]">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
          <Link href={`/dashboard/report/${item.id}`}>
            <Button size="icon" variant="ghost"
              className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Voir"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          <Link href={`/dashboard/diff/${encodeURIComponent(item.id)}`}>
            <Button size="icon" variant="ghost"
              className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Voir diff"
            >
              <GitCompare className="h-4 w-4" />
            </Button>
          </Link>
          <Button size="icon" variant="ghost"
            className="h-8 w-8 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
            title="Supprimer"
            onClick={onDel}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </motion.tr>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function Pages({
  page, total, size, go,
}: {
  page: number; total: number; size: number; go: (p: number) => void
}) {
  const count = Math.max(1, Math.ceil(total / size))
  if (count <= 1) return null
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-7 w-7 rounded"
        disabled={page === 1} onClick={() => go(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {Array.from({ length: count }, (_, i) => i + 1).map(p => (
        <button
          key={p}
          onClick={() => go(p)}
          className={cn(
            "h-7 w-7 rounded text-xs font-semibold transition-colors",
            p === page
              ? "text-white"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          style={p === page ? { background: ORANGE } : undefined}
        >
          {p}
        </button>
      ))}
      <Button variant="ghost" size="icon" className="h-7 w-7 rounded"
        disabled={page === count} onClick={() => go(page + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function AnalysesContent() {
  const sp      = useSearchParams()
  const filter  = sp.get("filter") ?? "all"
  const status  = sp.get("status") ?? ""
  const action  = sp.get("action") ?? ""

  const [items, setItems]         = useState<DashboardAnalysisItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState("")
  const [sortF, setSortF]         = useState<SortField>("created_at")
  const [sortD, setSortD]         = useState<SortDir>("desc")
  const [sel, setSel]             = useState<Set<string>>(new Set())
  const [period, setPeriod]       = useState("all")
  const [statuses, setStatuses]   = useState<string[]>([])
  const [pipeline, setPipeline]   = useState(false)
  const [hasActive, setHasActive] = useState(false)
  const [page, setPage]           = useState(1)
  const ref = useRef<DashboardAnalysisItem[]>(items)
  ref.current = items

  const load = useCallback(async () => {
    try {
      const d = await fetchDashboardAnalyses({ size: 200 })
      setItems(d)
      setHasActive(hasActiveDashboardAnalysis(d))
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!hasActive) return
    const id = setInterval(async () => {
      const d = await fetchDashboardAnalyses({ size: 200 }).catch(() => ref.current)
      setItems(d)
      setHasActive(hasActiveDashboardAnalysis(d))
    }, 8_000)
    return () => clearInterval(id)
  }, [hasActive])

  useEffect(() => { setPipeline(hasActive) }, [hasActive])

  const handleSort = (f: SortField) => {
    if (f === sortF) setSortD(d => d === "asc" ? "desc" : "asc")
    else { setSortF(f); setSortD("desc") }
  }

  const handleDel = async (id: string) => {
    if (!confirm("Supprimer cette analyse ?")) return
    await deleteDashboardAnalysis(id).catch(() => {})
    setItems(p => p.filter(a => a.id !== id))
  }

  const reset = () => {
    setPeriod("all"); setStatuses([]); setSearch(""); setPage(1)
  }

  const filtered = useMemo(() => {
    let l = [...items]
    if (search.trim()) {
      const q = search.toLowerCase()
      l = l.filter(a =>
        (a.repo ?? "").toLowerCase().includes(q) ||
        (a.prLabel ?? "").toLowerCase().includes(q) ||
        (a.author ?? "").toLowerCase().includes(q),
      )
    }
    const now = Date.now()
    if (period === "today") l = l.filter(a => now - new Date(a.createdAt).getTime() < 86_400_000)
    if (period === "week")  l = l.filter(a => now - new Date(a.createdAt).getTime() < 7 * 86_400_000)
    if (period === "month") l = l.filter(a => now - new Date(a.createdAt).getTime() < 30 * 86_400_000)
    if (statuses.length)
      l = l.filter(a => statuses.includes(norm(a.status)?.toUpperCase() ?? ""))
    l.sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0
      if (sortF === "created_at") { av = a.createdAt ?? ""; bv = b.createdAt ?? "" }
      if (sortF === "status")     { av = a.status ?? ""; bv = b.status ?? "" }
      if (sortF === "repo")       { av = a.repo ?? ""; bv = b.repo ?? "" }
      if (sortF === "findings")   {
        av = (a.blockerCount ?? 0) * 100 + (a.warnCount ?? 0)
        bv = (b.blockerCount ?? 0) * 100 + (b.warnCount ?? 0)
      }
      return (av < bv ? -1 : av > bv ? 1 : 0) * (sortD === "asc" ? 1 : -1)
    })
    return l
  }, [items, search, period, statuses, sortF, sortD])

  useEffect(() => { setPage(1) }, [search, period, statuses])

  const paged = useMemo(() => {
    const s = (page - 1) * PAGE_SIZE
    return filtered.slice(s, s + PAGE_SIZE)
  }, [filtered, page])

  const stats = useMemo(() => ({
    total:     items.length,
    completed: items.filter(a => norm(a.status)?.toUpperCase() === "COMPLETED").length,
    running:   items.filter(a => ["RUNNING","QUEUED","RECEIVED"].includes(norm(a.status)?.toUpperCase() ?? "")).length,
    failed:    items.filter(a => norm(a.status)?.toUpperCase() === "FAILED").length,
  }), [items])

  const allSel  = paged.length > 0 && paged.every(a => sel.has(a.id))
  const togAll  = () => {
    if (allSel) setSel(new Set())
    else setSel(new Set(paged.map(a => a.id)))
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">

      {/* ── TOP HEADER ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border bg-background px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: `${ORANGE}18` }}
          >
            <Filter className="h-5 w-5" style={{ color: ORANGE }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">Analyses IA</h1>
            <p className="text-xs text-muted-foreground">
              Consulter et gérer toutes les analyses de revue de code
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status quick-filter dropdown */}
          <div className="relative">
            <select
              className="h-9 rounded-lg border border-border bg-background px-3 pr-7 text-sm text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{ focusRingColor: ORANGE } as React.CSSProperties}
              value={statuses[0] ?? "all"}
              onChange={e => {
                const v = e.target.value
                setStatuses(v === "all" ? [] : [v])
              }}
            >
              <option value="all">Tout</option>
              <option value="COMPLETED">Terminé</option>
              <option value="RUNNING">En cours</option>
              <option value="QUEUED">En attente</option>
              <option value="FAILED">Échouée</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          </div>

          {/* + Nouvelle analyse (reuses existing dialog) */}
          <AnalysesPageHeader
            filter={filter}
            status={status}
            view={null}
            action={action}
            buttonOnly
          />
        </div>
      </div>

      {/* ── STAT CARDS ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 flex-shrink-0">
        <StatCard value={stats.total}
          label="Total"
          icon={BarChart3}
          iconBg="bg-blue-50 dark:bg-blue-500/10"
          iconFg="text-blue-500"
        />
        <StatCard value={stats.completed}
          label="Terminées"
          icon={CheckCircle2}
          iconBg="bg-emerald-50 dark:bg-emerald-500/10"
          iconFg="text-emerald-500"
        />
        <StatCard value={stats.running}
          label="En cours"
          icon={Activity}
          iconBg="bg-orange-50 dark:bg-orange-500/10"
          iconFg="text-orange-500"
        />
        <StatCard value={stats.failed}
          label="Échouées"
          icon={XCircle}
          iconBg="bg-red-50 dark:bg-red-500/10"
          iconFg="text-red-500"
        />
      </div>

      {/* ── BODY ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden border-t border-border">

        {/* Sidebar */}
        <Sidebar
          period={period}
          statuses={statuses}
          onPeriod={p => { setPeriod(p); setPage(1) }}
          onStatus={v => {
            setStatuses(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])
            setPage(1)
          }}
          onReset={reset}
        />

        {/* Main */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center gap-3 border-b border-border bg-background/60 px-4 py-2.5 flex-shrink-0">
            <div className="relative flex-1 max-w-[360px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher une analyse..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 pl-9 text-sm bg-background border-border placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="flex items-center gap-1 ml-auto">
              {hasActive && (
                <Button size="sm" variant="outline"
                  onClick={() => setPipeline(p => !p)}
                  className={cn(
                    "h-8 gap-1.5 text-xs border-border",
                    pipeline ? "text-orange-500 border-orange-500/30 bg-orange-500/10" : "text-muted-foreground",
                  )}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  Pipeline
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                </Button>
              )}
              <Button size="icon" variant="ghost"
                onClick={load}
                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {sel.size > 0 && (
                <Button size="sm" variant="ghost"
                  className="h-8 gap-1.5 text-xs text-red-500 hover:bg-red-500/10"
                  onClick={async () => {
                    if (!confirm(`Supprimer ${sel.size} analyses ?`)) return
                    for (const id of Array.from(sel)) await deleteDashboardAnalysis(id).catch(() => {})
                    setItems(p => p.filter(a => !sel.has(a.id)))
                    setSel(new Set())
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> {sel.size}
                </Button>
              )}
            </div>
          </div>

          {/* Pipeline */}
          <AnimatePresence>
            {pipeline && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 280, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.2, 0.65, 0.3, 0.9] }}
                className="overflow-hidden border-b border-border flex-shrink-0"
              >
                <AgentPlan />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <Loader2 className="h-9 w-9 animate-spin" style={{ color: ORANGE }} />
                <p className="text-sm text-muted-foreground">Chargement des analyses…</p>
              </div>
            ) : filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-64 gap-4"
              >
                <div className="rounded-full bg-muted p-4">
                  <GitCompare className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Aucune analyse trouvée</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {search
                      ? "Essayez d'autres termes de recherche"
                      : "Lancez votre première analyse avec le bouton +"}
                  </p>
                </div>
              </motion.div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/20 sticky top-0">
                    <th className="w-10 pl-5 pr-2 py-3">
                      <Checkbox
                        checked={allSel}
                        onCheckedChange={togAll}
                        className="border-border data-[state=checked]:bg-[#E8713A] data-[state=checked]:border-[#E8713A]"
                      />
                    </th>
                    <th className="py-3 pr-4 text-left w-[130px]">
                      <SortTh field="status"     label="STATUT"     cur={sortF} dir={sortD} onSort={handleSort} />
                    </th>
                    <th className="py-3 pr-6 text-left">
                      <SortTh field="repo"       label="REPO / PR"  cur={sortF} dir={sortD} onSort={handleSort} />
                    </th>
                    <th className="py-3 pr-6 text-left w-[160px]">
                      <SortTh field="findings"   label="FINDINGS"   cur={sortF} dir={sortD} onSort={handleSort} />
                    </th>
                    <th className="py-3 pr-4 text-left w-[140px]">
                      <SortTh field="created_at" label="DATE"       cur={sortF} dir={sortD} onSort={handleSort} />
                    </th>
                    <th className="py-3 pr-5 text-right w-[110px]">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        ACTIONS
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {paged.map((item, i) => (
                      <Row
                        key={item.id}
                        item={item}
                        idx={i}
                        sel={sel.has(item.id)}
                        onSel={() => setSel(p => {
                          const n = new Set(p)
                          n.has(item.id) ? n.delete(item.id) : n.add(item.id)
                          return n
                        })}
                        onDel={() => handleDel(item.id)}
                      />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-border bg-background/60 px-5 py-2.5 flex-shrink-0">
              <span className="text-sm text-muted-foreground">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} sur {filtered.length} analyse{filtered.length > 1 ? "s" : ""}
              </span>
              <Pages page={page} total={filtered.length} size={PAGE_SIZE} go={setPage} />
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default function AnalysesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: ORANGE }} />
      </div>
    }>
      <AnalysesContent />
    </Suspense>
  )
}
