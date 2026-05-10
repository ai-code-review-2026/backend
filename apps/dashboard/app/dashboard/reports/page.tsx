"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  FileText, Download, RefreshCw, Clock, CheckCircle2,
  XCircle, Loader2, AlertCircle, AlertTriangle, Info,
  GitPullRequest, GitCommit, User, Search, Calendar,
  TrendingUp, TrendingDown, Minus, BarChart3, Activity,
  Eye, Trash2, FileDown, ChevronRight, Shield, Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  generateSummaryPdf,
  generateAnalysisPdf,
  type PdfReportSummary,
} from "@/lib/pdf-report"

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportStatus = "completed" | "running" | "failed" | "queued" | "received"

interface Report {
  id: string
  repo: string
  prLabel: string
  commitSha: string | null
  author: string
  status: ReportStatus
  createdAt: string
  updatedAt: string
  durationLabel: string
  blockerCount: number
  warnCount: number
  infoCount: number
  score?: number
}

type Period = "24h" | "week" | "month" | "all"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return "—"
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return "—"
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60)     return "à l'instant"
  if (s < 3600)   return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400)  return `il y a ${Math.floor(s / 3600)} h`
  if (s < 604800) return `il y a ${Math.floor(s / 86400)} j`
  return date.toLocaleDateString("fr-FR", { month: "short", day: "numeric" })
}

function computeScore(r: Report): number {
  return r.score ?? Math.max(0, 100 - r.blockerCount * 10 - r.warnCount * 3 - r.infoCount)
}

const STATUS_META: Record<string, { label: string; color: string; dot: string; Icon: React.ElementType }> = {
  completed: { label: "Terminé",    color: "text-emerald-400", dot: "bg-emerald-500", Icon: CheckCircle2 },
  running:   { label: "En cours",   color: "text-violet-400",  dot: "bg-violet-500 animate-pulse", Icon: Loader2 },
  failed:    { label: "Échoué",     color: "text-red-400",     dot: "bg-red-500",     Icon: XCircle },
  queued:    { label: "En attente", color: "text-amber-400",   dot: "bg-amber-500",   Icon: Clock },
  received:  { label: "Reçu",       color: "text-blue-400",    dot: "bg-blue-500",    Icon: Activity },
}

function getStatus(s: string) {
  return STATUS_META[s.toLowerCase()] ?? STATUS_META["queued"]
}

// ─── Period tab config ─────────────────────────────────────────────────────────

const PERIOD_TABS: Array<{ value: Period; label: string; icon: React.ElementType; msWindow?: number }> = [
  { value: "24h",   label: "Dernières 24h",  icon: Clock,     msWindow: 86_400_000 },
  { value: "week",  label: "Cette semaine",  icon: Calendar,  msWindow: 7 * 86_400_000 },
  { value: "month", label: "Ce mois",        icon: BarChart3, msWindow: 30 * 86_400_000 },
  { value: "all",   label: "Tout",           icon: FileText },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number }) {
  const color = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400"
  const bg    = score >= 80 ? "bg-emerald-500/10 border-emerald-500/20" :
                score >= 60 ? "bg-amber-500/10  border-amber-500/20"  :
                              "bg-red-500/10    border-red-500/20"
  const Icon  = score >= 80 ? TrendingUp : score >= 60 ? Minus : TrendingDown
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border", bg, color)}>
      <Icon className="h-3 w-3" />
      {score}
    </span>
  )
}

function FindingsPill({ blockers, warns, infos }: { blockers: number; warns: number; infos: number }) {
  if (blockers === 0 && warns === 0 && infos === 0)
    return <span className="text-xs text-zinc-600">—</span>
  return (
    <div className="flex items-center gap-1.5">
      {blockers > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-400">
          <AlertCircle className="h-3 w-3" />{blockers}
        </span>
      )}
      {warns > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-400">
          <AlertTriangle className="h-3 w-3" />{warns}
        </span>
      )}
      {infos > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-400">
          <Info className="h-3 w-3" />{infos}
        </span>
      )}
    </div>
  )
}

function ReportRow({
  report,
  index,
  onExportPdf,
  onDelete,
}: {
  report: Report
  index: number
  onExportPdf: (r: Report) => void
  onDelete: (id: string) => void
}) {
  const st = getStatus(report.status)
  const score = computeScore(report)
  const isActive = ["running", "queued", "received"].includes(report.status)

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.025 }}
      className="group border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors"
    >
      {/* Status */}
      <td className="py-3 pl-4 pr-3 w-28">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", st.dot)} />
          <st.Icon
            className={cn("h-3.5 w-3.5 flex-shrink-0", st.color, isActive && "animate-spin")}
          />
          <span className={cn("text-xs font-medium", st.color)}>{st.label}</span>
        </div>
      </td>

      {/* Repo + PR */}
      <td className="py-3 pr-4 min-w-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-zinc-100 truncate">{report.repo}</span>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            {report.prLabel.includes("PR") ? (
              <GitPullRequest className="h-3 w-3" />
            ) : (
              <GitCommit className="h-3 w-3" />
            )}
            {report.prLabel}
            {report.commitSha && (
              <span className="font-mono">{report.commitSha.slice(0, 8)}</span>
            )}
          </div>
        </div>
      </td>

      {/* Findings */}
      <td className="py-3 pr-4 w-32">
        <FindingsPill blockers={report.blockerCount} warns={report.warnCount} infos={report.infoCount} />
      </td>

      {/* Score */}
      <td className="py-3 pr-4 w-20">
        <ScorePill score={score} />
      </td>

      {/* Author */}
      <td className="py-3 pr-4 w-32 hidden md:table-cell">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <User className="h-3 w-3" />
          {report.author}
        </div>
      </td>

      {/* Date */}
      <td className="py-3 pr-4 w-28">
        <span className="text-xs text-zinc-500">{formatTimeAgo(report.createdAt)}</span>
      </td>

      {/* Actions */}
      <td className="py-3 pr-4 w-28">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link href={`/dashboard/report/${report.id}`}>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-zinc-400 hover:text-violet-400 hover:bg-violet-500/10"
              title="Voir le rapport"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10"
            title="Télécharger PDF"
            onClick={() => onExportPdf(report)}
          >
            <FileDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
            title="Supprimer"
            onClick={() => onDelete(report.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </motion.tr>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color, glow,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
  glow: string
}) {
  return (
    <motion.div
      className={cn("flex items-center gap-3 rounded-xl border bg-zinc-900/60 px-4 py-3", glow)}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.15 }}
    >
      <Icon className={cn("h-4 w-4", color)} />
      <div>
        <p className="text-xl font-bold text-zinc-100">{value}</p>
        <p className="text-[11px] text-zinc-500">{label}</p>
      </div>
    </motion.div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyReports({ period }: { period: Period }) {
  const label = PERIOD_TABS.find((t) => t.value === period)?.label ?? "cette période"
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-20 gap-4 text-center"
    >
      <div className="rounded-full bg-zinc-800/60 p-5">
        <FileText className="h-9 w-9 text-zinc-600" />
      </div>
      <p className="text-sm font-medium text-zinc-400">Aucun rapport pour {label}</p>
      <p className="text-xs text-zinc-600">Les analyses apparaîtront ici dès qu'elles seront terminées.</p>
    </motion.div>
  )
}

// ─── Main content ─────────────────────────────────────────────────────────────

function ReportsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialPeriod = (searchParams.get("period") as Period) || "24h"

  const [period, setPeriod]     = useState<Period>(initialPeriod)
  const [reports, setReports]   = useState<Report[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState("")
  const [exporting, setExporting] = useState(false)

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const load = useCallback(async (p: Period) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ size: "200" })
      if (p !== "all") qs.set("period", p)
      const res = await fetch(`/api/dashboard/analyses?${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setReports((data.items as Report[]) || [])
    } catch (err) {
      toast.error("Impossible de charger les rapports", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(period) }, [period, load])

  // Update URL when period changes
  const changePeriod = (p: Period) => {
    setPeriod(p)
    router.replace(`/dashboard/reports?period=${p}`, { scroll: false })
  }

  // ── Filtering ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search.trim()) return reports
    const q = search.toLowerCase()
    return reports.filter(
      (r) =>
        r.repo.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.prLabel.toLowerCase().includes(q) ||
        r.commitSha?.toLowerCase().includes(q)
    )
  }, [reports, search])

  // ── Stats ─────────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:     reports.length,
    completed: reports.filter((r) => r.status === "completed").length,
    running:   reports.filter((r) => ["running","queued","received"].includes(r.status)).length,
    failed:    reports.filter((r) => r.status === "failed").length,
    avgScore:  reports.length
      ? Math.round(reports.reduce((s, r) => s + computeScore(r), 0) / reports.length)
      : 0,
  }), [reports])

  // ── Export handlers ───────────────────────────────────────────────────────────

  const handleExportAll = async () => {
    if (filtered.length === 0) return
    setExporting(true)
    const tid = toast.loading("Génération du PDF en cours…")
    try {
      await generateSummaryPdf(filtered as PdfReportSummary[])
      toast.dismiss(tid)
      toast.success("PDF téléchargé !", { duration: 3000 })
    } catch (err) {
      toast.dismiss(tid)
      toast.error("Échec de l'export PDF", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      })
    } finally {
      setExporting(false)
    }
  }

  const handleExportSingle = async (r: Report) => {
    const tid = toast.loading(`Génération du rapport PDF pour ${r.repo}…`)
    try {
      // Fetch full details for richer PDF
      const res = await fetch(`/api/dashboard/analyses/${r.id}`)
      let data = r as Record<string, unknown>
      if (res.ok) {
        const full = await res.json()
        data = full
      }
      await generateAnalysisPdf({
        id: r.id,
        repo: r.repo,
        prLabel: r.prLabel,
        commitSha: r.commitSha,
        author: r.author,
        status: r.status,
        createdAt: r.createdAt,
        durationLabel: r.durationLabel,
        blockerCount: r.blockerCount,
        warnCount: r.warnCount,
        infoCount: r.infoCount,
        score: computeScore(r),
        findings: (data.findings as any[])?.map((f: any) => ({
          severity: f.severity,
          category: f.category ?? "style",
          message: f.message,
          filePath: f.filePath ?? "",
          lineStart: f.lineStart,
          suggestion: f.suggestion,
        })),
        files: (data.files as any[])?.map((f: any) => ({
          path: f.pathNew ?? f.path ?? "",
          changeType: f.changeType ?? "modified",
          additions: f.additionsCount ?? f.additions ?? 0,
          deletions: f.deletionsCount ?? f.deletions ?? 0,
          findingsCount: 0,
        })),
      })
      toast.dismiss(tid)
      toast.success("PDF téléchargé !", { duration: 3000 })
    } catch (err) {
      toast.dismiss(tid)
      toast.error("Échec de l'export PDF", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce rapport ?")) return
    try {
      await fetch(`/api/dashboard/analyses/${id}`, { method: "DELETE" })
      setReports((p) => p.filter((r) => r.id !== id))
      toast.success("Rapport supprimé")
    } catch {
      toast.error("Échec de la suppression")
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full space-y-0">

      {/* ── Top header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800/60 bg-zinc-950/60 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ boxShadow: ["0 0 20px rgba(99,102,241,0.3)", "0 0 40px rgba(99,102,241,0.1)", "0 0 20px rgba(99,102,241,0.3)"] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="p-2.5 rounded-xl bg-primary/10"
            >
              <FileText className="h-5 w-5 text-primary" />
            </motion.div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Rapports</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                {stats.total} analyse{stats.total !== 1 ? "s" : ""} ·{" "}
                <span className="text-emerald-400">{stats.completed} terminée{stats.completed !== 1 ? "s" : ""}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(period)}
              className="h-8 gap-1.5 text-xs border-zinc-700/60 text-zinc-400 hover:text-zinc-200"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Actualiser
            </Button>
            <Button
              size="sm"
              onClick={handleExportAll}
              disabled={exporting || filtered.length === 0}
              className="h-8 gap-1.5 text-xs bg-primary/90 hover:bg-primary"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Exporter PDF
            </Button>
          </div>
        </div>

        {/* Period tabs */}
        <div className="flex items-center gap-1 mt-5">
          {PERIOD_TABS.map((tab) => {
            const active = period === tab.value
            return (
              <button
                key={tab.value}
                onClick={() => changePeriod(tab.value)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  active
                    ? "bg-violet-500/15 text-violet-300 border border-violet-500/30"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 border border-transparent"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
                {active && !loading && (
                  <span className="ml-0.5 rounded-full bg-violet-500/30 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">
                    {stats.total}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4">
        <StatCard label="Total"     value={stats.total}     icon={BarChart3}    color="text-zinc-400"   glow="border-zinc-700/50" />
        <StatCard label="Terminées" value={stats.completed} icon={CheckCircle2} color="text-emerald-400" glow="border-emerald-500/20" />
        <StatCard label="En cours"  value={stats.running}   icon={Activity}     color="text-violet-400" glow="border-violet-500/20" />
        <StatCard label="Échouées"  value={stats.failed}    icon={XCircle}      color="text-red-400"    glow="border-red-500/20" />
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────────────── */}
      <div className="px-6 pb-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            placeholder="Rechercher par repo, auteur, PR…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-9 text-sm bg-zinc-900/60 border-zinc-700/60 placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyReports period={period} />
        ) : (
          <div className="rounded-xl border border-zinc-800/60 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800/60 bg-zinc-950/60">
                  <th className="py-2.5 pl-4 pr-3 text-left w-28">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Statut</span>
                  </th>
                  <th className="py-2.5 pr-4 text-left">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Repo / PR</span>
                  </th>
                  <th className="py-2.5 pr-4 text-left w-32">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Findings</span>
                  </th>
                  <th className="py-2.5 pr-4 text-left w-20">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Score</span>
                  </th>
                  <th className="py-2.5 pr-4 text-left w-32 hidden md:table-cell">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Auteur</span>
                  </th>
                  <th className="py-2.5 pr-4 text-left w-28">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Date</span>
                  </th>
                  <th className="py-2.5 pr-4 w-28" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {filtered.map((r, i) => (
                    <ReportRow
                      key={r.id}
                      report={r}
                      index={i}
                      onExportPdf={handleExportSingle}
                      onDelete={handleDelete}
                    />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Footer count ───────────────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div className="border-t border-zinc-800/60 px-6 py-2 text-xs text-zinc-600">
          {filtered.length} rapport{filtered.length !== 1 ? "s" : ""} affiché{filtered.length !== 1 ? "s" : ""}
          {search && ` · filtrés sur "${search}"`}
        </div>
      )}
    </div>
  )
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      }
    >
      <ReportsContent />
    </Suspense>
  )
}
