"use client"
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Download,
  ExternalLink,
  RotateCw,
  Shield,
  Zap,
  Code2,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Sparkles,
  Loader2,
} from "lucide-react"
import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider"
import { isReviewer as isReviewerRole } from "@/lib/roles"
import { fetchDashboardAnalysisDetails, type DashboardAnalysisDetails } from "@/lib/dashboard-analysis-details"
import { RagContextPanel } from "@/components/dashboard/RagContextPanel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { extractApiErrorMessage } from "@/lib/display"
import { resolveProjectIdForRepo } from "@/lib/project-lookup"

type LaunchAnalysisResponse = {
  analysis_id?: string
  error?: string
  backend_response?: {
    detail?: string
    message?: string
    error?: {
      details?: {
        existing_id?: string
      }
    }
  }
}

type ReviewDecisionValue = "APPROVE" | "WARN" | "BLOCK"

type ReviewDecisionApiResponse = {
  error?: string
  detail?: string
  message?: string
}

function severityVariant(severity: string): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "BLOCKER") {
    return "destructive"
  }
  if (severity === "WARN") {
    return "secondary"
  }
  return "outline"
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildGithubUrl(analysis: DashboardAnalysisDetails): string | null {
  if (!analysis.repo || analysis.repo.startsWith("local/")) {
    return null
  }
  const [owner, repo] = analysis.repo.split("/")
  if (!owner || !repo) {
    return null
  }
  if (typeof analysis.prNumber === "number") {
    return `https://github.com/${owner}/${repo}/pull/${analysis.prNumber}`
  }
  if (analysis.commitSha && analysis.commitSha.trim().length > 0) {
    return `https://github.com/${owner}/${repo}/commit/${analysis.commitSha}`
  }
  return null
}

function toDiffPrefixedLine(
  lineType: "context" | "add" | "remove" | "header",
  content: string,
): string {
  if (lineType === "header") {
    return content
  }
  if (content.startsWith("+") || content.startsWith("-") || content.startsWith(" ")) {
    return content
  }
  if (lineType === "add") {
    return `+${content}`
  }
  if (lineType === "remove") {
    return `-${content}`
  }
  return ` ${content}`
}

function buildUnifiedDiffFromFiles(files: DashboardAnalysisDetails["files"]): string {
  const chunks: string[] = []
  for (const file of files) {
    const oldPath = (file.pathOld && file.pathOld.trim().length > 0 ? file.pathOld : file.pathNew).replace(
      /^\/+/,
      "",
    )
    const newPath = file.pathNew.replace(/^\/+/, "")

    chunks.push(`diff --git a/${oldPath} b/${newPath}`)
    if (file.changeType === "added") {
      chunks.push("new file mode 100644")
      chunks.push("--- /dev/null")
      chunks.push(`+++ b/${newPath}`)
    } else if (file.changeType === "deleted") {
      chunks.push(`--- a/${oldPath}`)
      chunks.push("+++ /dev/null")
    } else {
      chunks.push(`--- a/${oldPath}`)
      chunks.push(`+++ b/${newPath}`)
    }

    if (!file.lines.some((line) => line.lineType === "header")) {
      const oldLines = Math.max(file.deletionsCount, 1)
      const newLines = Math.max(file.additionsCount, 1)
      chunks.push(`@@ -1,${oldLines} +1,${newLines} @@`)
    }

    for (const line of file.lines) {
      chunks.push(toDiffPrefixedLine(line.lineType, line.content))
    }

    if (file.lines.length === 0) {
      chunks.push("@@ -0,0 +0,0 @@")
    }
    chunks.push("")
  }
  return chunks.join("\n")
}

export function GlobalReport() {
  const router = useRouter()
  const currentUser = useDashboardUser()
  const params = useParams<{ id: string | string[] }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id

  const [analysis, setAnalysis] = useState<DashboardAnalysisDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [isRerunning, setIsRerunning] = useState(false)
  const [isExporting, setIsExporting] = useState<"pdf" | "md" | null>(null)
  const [isSubmittingDecision, setIsSubmittingDecision] = useState<ReviewDecisionValue | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!id) {
      setAnalysis(null)
      setLoading(false)
      return () => {
        cancelled = true
      }
    }
    setLoading(true)
    fetchDashboardAnalysisDetails(id)
      .then((payload) => {
        if (!cancelled) {
          setAnalysis(payload)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const isReviewer = isReviewerRole(currentUser.role) || currentUser.role === "admin"

  const findings = useMemo(() => analysis?.findings ?? [], [analysis])
  const files = useMemo(() => analysis?.files ?? [], [analysis])
  const blockerCount = findings.filter((finding) => finding.severity === "BLOCKER").length
  const warnCount = findings.filter((finding) => finding.severity === "WARN").length
  const infoCount = findings.filter((finding) => finding.severity === "INFO").length
  const securityCount = findings.filter((finding) => finding.category.toLowerCase() === "security").length
  const performanceCount = findings.filter((finding) => finding.category.toLowerCase() === "performance").length
  const maintainabilityCount = findings.filter((finding) => finding.category.toLowerCase() === "maintainability").length

  const additionsTotal = useMemo(() => files.reduce((acc, file) => acc + file.additionsCount, 0), [files])
  const deletionsTotal = useMemo(() => files.reduce((acc, file) => acc + file.deletionsCount, 0), [files])

  const riskScore = blockerCount * 10 + warnCount * 3
  const maxRisk = 100
  const riskLevel = riskScore > 30 ? "Eleve" : riskScore > 10 ? "Moyen" : "Faible"
  const githubUrl = analysis ? buildGithubUrl(analysis) : null

  const downloadMarkdown = async () => {
    if (!analysis) {
      return
    }
    setActionError(null)
    setActionMessage(null)
    setIsExporting("md")
    try {
      const markdown = [
        `# Rapport d'analyse`,
        ``,
        `- Analyse ID: \`${analysis.id}\``,
        `- Repository: \`${analysis.repo}\``,
        `- Cible: ${analysis.prLabel}${analysis.commitSha ? ` (${analysis.commitSha})` : ""}`,
        `- Statut: **${analysis.status}**`,
        `- Auteur: ${analysis.author}`,
        `- Date: ${analysis.createdAt || "-"}`,
        ``,
        `## Resume`,
        ``,
        analysis.summary || "Aucun resume disponible.",
        ``,
        `## Stats`,
        ``,
        `- Fichiers modifies: ${files.length}`,
        `- Additions: ${additionsTotal}`,
        `- Suppressions: ${deletionsTotal}`,
        `- BLOCKER: ${blockerCount}`,
        `- WARN: ${warnCount}`,
        `- INFO: ${infoCount}`,
        ``,
        `## Findings`,
        ``,
        ...findings.map((finding, index) => {
          const location = `${finding.filePath}:${finding.lineStart ?? "-"}`
          const suggestion = finding.suggestion ? `\n  - Suggestion: ${finding.suggestion}` : ""
          return `${index + 1}. [${finding.severity}] (${finding.category}) ${finding.message}\n  - Fichier: ${location}${suggestion}`
        }),
      ].join("\n")

      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `analysis-${analysis.id}.md`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(link.href)
      setActionMessage("Export Markdown telecharge.")
    } catch {
      setActionError("Echec de l'export Markdown.")
    } finally {
      setIsExporting(null)
    }
  }

  const exportPdf = async () => {
    if (!analysis) {
      return
    }
    setActionError(null)
    setActionMessage(null)
    setIsExporting("pdf")
    try {
      const rows = findings
        .slice(0, 25)
        .map(
          (finding) =>
            `<tr><td>${escapeHtml(finding.severity)}</td><td>${escapeHtml(finding.category)}</td><td>${escapeHtml(
              `${finding.filePath}:${finding.lineStart ?? "-"}`,
            )}</td><td>${escapeHtml(finding.message)}</td></tr>`,
        )
        .join("")

      const html = `
        <html>
          <head>
            <title>analysis-${escapeHtml(analysis.id)}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
              h1, h2 { margin: 0 0 12px; }
              .muted { color: #666; font-size: 12px; margin-bottom: 16px; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; }
              th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; font-size: 12px; }
              th { background: #f5f5f5; text-align: left; }
            </style>
          </head>
          <body>
            <h1>Rapport d'analyse</h1>
            <div class="muted">ID: ${escapeHtml(analysis.id)} | Repo: ${escapeHtml(analysis.repo)} | Statut: ${escapeHtml(
              analysis.status,
            )}</div>
            <h2>Resume</h2>
            <p>${escapeHtml(analysis.summary || "Aucun resume disponible.")}</p>
            <h2>Stats</h2>
            <ul>
              <li>Fichiers modifies: ${files.length}</li>
              <li>Additions: ${additionsTotal}</li>
              <li>Suppressions: ${deletionsTotal}</li>
              <li>BLOCKER: ${blockerCount}</li>
              <li>WARN: ${warnCount}</li>
              <li>INFO: ${infoCount}</li>
            </ul>
            <h2>Findings</h2>
            <table>
              <thead><tr><th>Severite</th><th>Categorie</th><th>Fichier</th><th>Message</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </body>
        </html>
      `

      const printWindow = window.open("", "_blank", "width=1200,height=800")
      if (!printWindow) {
        throw new Error("popup_blocked")
      }
      printWindow.document.open()
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
      }, 400)
      setActionMessage("Fenetre PDF ouverte. Choisissez 'Save as PDF'.")
    } catch {
      setActionError("Echec de l'export PDF.")
    } finally {
      setIsExporting(null)
    }
  }

  const rerunAnalysis = async () => {
    if (!analysis) {
      return
    }
    const fallbackDiff = buildUnifiedDiffFromFiles(files)
    const rerunDiffText =
      analysis.diffText && analysis.diffText.trim().length > 0 ? analysis.diffText : fallbackDiff
    if (!rerunDiffText || rerunDiffText.trim().length === 0) {
      setActionError("Diff indisponible pour relancer cette analyse.")
      return
    }
    setActionError(null)
    setActionMessage(null)
    setIsRerunning(true)
    try {
      const resolvedProjectId = await resolveProjectIdForRepo(analysis.repo)
      if (!resolvedProjectId) {
        throw new Error("Projet introuvable pour relancer cette analyse. Importez le repository avant de relancer.")
      }
      const response = await fetch("/api/dashboard/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          repo: analysis.repo,
          // Reuse the canonical project_profiles.id so the rerun respects the current backend FK.
          project_id: resolvedProjectId,
          pr_number: analysis.prNumber,
          commit_sha: analysis.commitSha,
          diff_text: rerunDiffText,
          metadata: {
            triggered_from: "global_report_rerun",
            rerun_of: analysis.id,
            rerun_requested_by: currentUser.id,
            diff_reconstructed: !(analysis.diffText && analysis.diffText.trim().length > 0),
          },
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as LaunchAnalysisResponse
      if (response.ok && typeof payload.analysis_id === "string" && payload.analysis_id.trim().length > 0) {
        setActionMessage(`Nouvelle analyse lancee: ${payload.analysis_id}`)
        router.push(`/dashboard/report/${payload.analysis_id}`)
        return
      }

      const existingId =
        payload?.backend_response?.error?.details?.existing_id ??
        (payload as Record<string, unknown>)?.["analysis_id"]
      if (response.status === 409 && typeof existingId === "string" && existingId.trim().length > 0) {
        setActionMessage(`Analyse existante reutilisee: ${existingId}`)
        router.push(`/dashboard/report/${existingId}`)
        return
      }

      throw new Error(extractApiErrorMessage(payload.backend_response ?? payload, "Echec de relance."))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Echec de relance."
      setActionError(message)
    } finally {
      setIsRerunning(false)
    }
  }

  const openPr = () => {
    if (!githubUrl) {
      setActionError("Lien PR/commit indisponible pour cette analyse.")
      return
    }
    setActionError(null)
    setActionMessage(null)
    window.open(githubUrl, "_blank", "noopener,noreferrer")
  }

  const submitDecision = async (decision: ReviewDecisionValue) => {
    if (!analysis) {
      return
    }
    setActionError(null)
    setActionMessage(null)
    setIsSubmittingDecision(decision)
    try {
      const response = await fetch(`/api/dashboard/analyses/${analysis.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ decision }),
      })

      const payload = (await response.json().catch(() => ({}))) as ReviewDecisionApiResponse
      if (!response.ok) {
        throw new Error(
          extractApiErrorMessage(payload, "Echec d'enregistrement de la decision."),
        )
      }

      const refreshed = await fetchDashboardAnalysisDetails(analysis.id)
      if (refreshed) {
        setAnalysis(refreshed)
      }
      const labels: Record<ReviewDecisionValue, string> = {
        APPROVE: "Approve",
        WARN: "Approve with warnings",
        BLOCK: "Block",
      }
      setActionMessage(`Decision enregistree: ${labels[decision]}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Echec d'enregistrement de la decision."
      setActionError(message)
    } finally {
      setIsSubmittingDecision(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Chargement du rapport...
      </div>
    )
  }

  if (!analysis) {
    return <div>Analyse non trouvee</div>
  }

  return (
    <motion.div className="max-w-5xl mx-auto space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="flex justify-between items-start" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <h1 className="card-heading text-foreground mb-2">
            Rapport global
          </h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-medium">{analysis.repo}</span>
            <span>•</span>
            <span className="text-teal-400">{analysis.prLabel}</span>
            <span>•</span>
            <span className="font-mono text-sm">{analysis.commitSha ?? "-"}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.0 }}>
            <Button
              variant="outline"
              className="gap-2"
              onClick={exportPdf}
              disabled={isExporting !== null || isRerunning}
            >
              {isExporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PDF
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <Button
              variant="outline"
              className="gap-2"
              onClick={downloadMarkdown}
              disabled={isExporting !== null || isRerunning}
            >
              {isExporting === "md" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Markdown
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <Button
              variant="outline"
              className="gap-2"
              onClick={rerunAnalysis}
              disabled={isRerunning || isExporting !== null}
            >
              {isRerunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
              Re-run
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <Button
              className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              onClick={openPr}
              disabled={!githubUrl}
              title={!githubUrl ? "PR/commit GitHub indisponible" : "Ouvrir sur GitHub"}
            >
              <ExternalLink className="h-4 w-4" />
              Ouvrir PR
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {(actionError || actionMessage) && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={actionError ? "border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20" : "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20"}>
            <CardContent className="pt-4">
              {actionError ? (
                <p className="text-sm font-medium text-red-700 dark:text-red-300">{actionError}</p>
              ) : (
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{actionMessage}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 backdrop-blur-xl border-blue-200/50 dark:border-blue-800/50">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Resume automatique des changements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 relative z-10">
            <p className="text-secondary-foreground">{analysis.summary}</p>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { label: "Fichiers modifies", value: `${files.length}`, gradient: "from-blue-500 to-cyan-500" },
                { label: "Additions", value: `${additionsTotal} lignes`, gradient: "from-green-500 to-emerald-500" },
                { label: "Suppressions", value: `${deletionsTotal} lignes`, gradient: "from-red-500 to-orange-500" },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  whileHover={{ scale: 1.05, y: -4 }}
                  className={`p-4 rounded-xl bg-gradient-to-br ${stat.gradient} text-white shadow-lg`}
                >
                  <div className="text-sm opacity-90 mb-1">{stat.label}</div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[color:var(--orange)]" />
              Evaluation des risques
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-secondary-foreground">Niveau de risque global</span>
                <Badge variant={riskScore > 30 ? "destructive" : riskScore > 10 ? "secondary" : "default"}>
                  {riskLevel}
                </Badge>
              </div>
              <div className="relative">
                <Progress value={(riskScore / maxRisk) * 100} className="h-3" />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(riskScore / maxRisk) * 100}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                  className="absolute top-0 left-0 h-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
                />
              </div>
            </div>

            <Separator />

            <div className="grid md:grid-cols-3 gap-4">
              {[
                { icon: Shield, label: "Securite", count: securityCount, bg: "from-red-500 to-orange-500" },
                { icon: Zap, label: "Performance", count: performanceCount, bg: "from-orange-500 to-yellow-500" },
                { icon: Code2, label: "Maintenabilite", count: maintainabilityCount, bg: "from-blue-500 to-purple-500" },
              ].map((category, index) => (
                <motion.div
                  key={category.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  whileHover={{ y: -4 }}
                  className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-gray-50 to-transparent dark:from-gray-800/50 dark:to-transparent border border-gray-200/50 dark:border-gray-700/50"
                >
                  <motion.div className={`p-2 rounded-lg bg-gradient-to-br ${category.bg}`} whileHover={{ scale: 1.1, rotate: 5 }}>
                    <category.icon className="h-5 w-5 text-white" />
                  </motion.div>
                  <div>
                    <div className="font-semibold text-foreground">{category.label}</div>
                    <div className="text-sm text-muted-foreground">{category.count} probleme(s) detecte(s)</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              Top {Math.min(10, findings.length)} Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {findings.slice(0, 10).map((finding, idx) => (
                <motion.div
                  key={finding.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + idx * 0.05 }}
                  whileHover={{ x: 4, scale: 1.01 }}
                  className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-transparent dark:from-gray-800/50 dark:to-transparent border border-gray-200/50 dark:border-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all"
                >
                  <motion.div
                    className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-lg"
                    whileHover={{ scale: 1.2, rotate: 360 }}
                    transition={{ duration: 0.3 }}
                  >
                    {idx + 1}
                  </motion.div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-foreground">{finding.ruleId ?? "Finding"}</span>
                      <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
                      <Badge variant="outline" className="text-xs">
                        {finding.category}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mb-2">
                      {finding.filePath}:{finding.lineStart ?? "-"}
                    </div>
                    <p className="text-sm text-secondary-foreground">{finding.message}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Recommandations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  icon: AlertCircle,
                  title: "Critique - Action immediate",
                  desc: `Corrigez les ${blockerCount} problemes BLOCKER avant de merger.`,
                  bg: "from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30",
                  border: "border-red-200/50 dark:border-red-800/50",
                  text: "text-red-900 dark:text-red-100",
                  iconColor: "text-destructive",
                },
                {
                  icon: AlertTriangle,
                  title: "Recommande",
                  desc: `${warnCount} warning(s) detecte(s), ajoutez des tests ou corrections cibles.`,
                  bg: "from-orange-50 to-yellow-50 dark:from-orange-950/30 dark:to-yellow-950/30",
                  border: "border-orange-200/50 dark:border-orange-800/50",
                  text: "text-orange-900 dark:text-orange-100",
                  iconColor: "text-orange-600 dark:text-orange-400",
                },
                {
                  icon: Info,
                  title: "Amelioration",
                  desc: `${infoCount} info(s) peuvent etre adressees pour ameliorer la qualite globale.`,
                  bg: "from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30",
                  border: "border-blue-200/50 dark:border-blue-800/50",
                  text: "text-blue-900 dark:text-blue-100",
                  iconColor: "text-teal-400",
                },
              ].map((rec, index) => (
                <motion.div
                  key={rec.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  whileHover={{ x: 4 }}
                  className={`flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br ${rec.bg} border ${rec.border}`}
                >
                  <rec.icon className={`h-5 w-5 ${rec.iconColor} mt-0.5 flex-shrink-0`} />
                  <div>
                    <div className={`font-semibold ${rec.text} mb-1`}>{rec.title}</div>
                    <div className={`text-sm ${rec.text}`}>{rec.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <RagContextPanel
        ragContext={analysis.ragContext ?? []}
        ragContextChunksCount={analysis.ragContextChunksCount ?? 0}
        ragRetrievalMode={analysis.ragRetrievalMode ?? null}
      />

      {isReviewer && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }}>
          <Card className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 backdrop-blur-xl border-2 border-purple-200/50 dark:border-purple-800/50">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-full blur-3xl" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2 relative z-10">
                <Shield className="h-5 w-5 text-purple-500" />
                Decision Panel (Reviewer)
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              {analysis.reviewDecision && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-purple-200/50 bg-purple-50/60 p-2 text-xs dark:border-purple-800/50 dark:bg-purple-950/20">
                  <Badge variant="outline">Decision actuelle: {analysis.reviewDecision.value}</Badge>
                  {analysis.reviewDecision.decidedAt && (
                    <span className="text-muted-foreground">
                      {new Date(analysis.reviewDecision.decidedAt).toLocaleString("fr-FR")}
                    </span>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                {[
                  {
                    label: "Approve",
                    value: "APPROVE" as const,
                    icon: CheckCircle2,
                    gradient: "from-green-600 to-emerald-600",
                  },
                  {
                    label: "Approve with warnings",
                    value: "WARN" as const,
                    icon: AlertTriangle,
                    gradient: "from-orange-500 to-yellow-500",
                  },
                  { label: "Block", value: "BLOCK" as const, icon: XCircle, gradient: "from-red-600 to-orange-600" },
                ].map((action, index) => (
                  <motion.div
                    key={action.label}
                    className="flex-1"
                    whileHover={{ scale: 1.05, y: -4 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 + index * 0.1 }}
                  >
                    <Button
                      className={`w-full gap-2 bg-gradient-to-r ${action.gradient} hover:shadow-lg shadow-md`}
                      onClick={() => void submitDecision(action.value)}
                      disabled={
                        isSubmittingDecision !== null || isRerunning || isExporting !== null || loading
                      }
                    >
                      {isSubmittingDecision === action.value ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <action.icon className="h-4 w-4" />
                      )}
                      {action.label}
                    </Button>
                  </motion.div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Cette decision sera enregistree et notifiee a l'auteur de la PR
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}
