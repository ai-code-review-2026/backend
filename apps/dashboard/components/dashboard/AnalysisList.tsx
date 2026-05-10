"use client"
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  Search,
  Download,
  RotateCw,
  Eye,
  GitCompare,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Info,
  Filter,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { BANNER_INFO, CARD_GLASS_CLASS, INPUT_STANDARD } from "@/lib/design-tokens"
import { StatusIndicator } from "@/components/ui/status-indicator"
import { EmptyState } from "@/components/ui/empty-state"
import { emptyDashboardInsights, fetchDashboardInsights } from "@/lib/dashboard-insights"
import {
  deleteDashboardAnalysis,
  fetchDashboardAnalyses,
  hasActiveDashboardAnalysis,
  type DashboardAnalysisItem,
} from "@/lib/dashboard-analyses"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { normalizeAnalysisStatus as normalizeStatus } from "@/lib/domain/analysis-status"

function formatCreatedAt(value: string): string {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }
  return date.toLocaleString("fr-FR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AnalysisList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [analysesLoading, setAnalysesLoading] = useState(true)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [insights, setInsights] = useState(() => emptyDashboardInsights())
  const [analyses, setAnalyses] = useState<DashboardAnalysisItem[]>([])
  
  // Use ref to track analyses for polling interval without causing re-renders
  const analysesRef = useRef<DashboardAnalysisItem[]>(analyses)
  analysesRef.current = analyses

  const handleDeleteAnalysis = async (analysisId: string) => {
    const confirmed = window.confirm("Voulez-vous vraiment supprimer cette analyse ?")
    if (!confirmed) {
      return
    }

    setDeleteBusyId(analysisId)
    setActionMessage(null)
    try {
      await deleteDashboardAnalysis(analysisId)
      setAnalyses((previous) => previous.filter((item) => item.id !== analysisId))
      setActionMessage("Analyse supprimee.")
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Suppression de l'analyse impossible.")
    } finally {
      setDeleteBusyId(null)
    }
  }

  const filteredAnalyses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return analyses
    }
    return analyses.filter((analysis) => {
      const repo = analysis.repo.toLowerCase()
      const prLabel = analysis.prLabel.toLowerCase()
      const author = analysis.author.toLowerCase()
      const commitSha = (analysis.commitSha ?? "").toLowerCase()
      return (
        repo.includes(query) ||
        prLabel.includes(query) ||
        author.includes(query) ||
        commitSha.includes(query)
      )
    })
  }, [analyses, searchQuery])

  const getStatusBadge = (status: string) => {
    const normalized = normalizeStatus(status)
    return <StatusIndicator status={normalized} size="md" />
  }

  useEffect(() => {
    let cancelled = false

    setInsightsLoading(true)
    setAnalysesLoading(true)

    Promise.all([fetchDashboardInsights(), fetchDashboardAnalyses({ force: true, size: 100 })])
      .then(([insightsPayload, analysesPayload]) => {
        if (cancelled) {
          return
        }
        setInsights(insightsPayload)
        setAnalyses(analysesPayload)
      })
      .finally(() => {
        if (!cancelled) {
          setInsightsLoading(false)
          setAnalysesLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const refreshAnalyses = async () => {
      if (cancelled) {
        return
      }
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        timeoutId = setTimeout(() => {
          void refreshAnalyses()
        }, 30_000)
        return
      }

      const analysesPayload = await fetchDashboardAnalyses({ force: true, size: 100 })
      if (!cancelled) {
        setAnalyses(analysesPayload)
        timeoutId = setTimeout(() => {
          void refreshAnalyses()
        }, hasActiveDashboardAnalysis(analysesPayload) ? 8_000 : 30_000)
      }
    }

    // Use ref to get current analyses without adding to dependencies
    timeoutId = setTimeout(() => {
      void refreshAnalyses()
    }, hasActiveDashboardAnalysis(analysesRef.current) ? 8_000 : 30_000)

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, []) // Empty dependency array - polling starts once on mount

  return (
    <motion.div className="max-w-7xl mx-auto space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="card-heading text-foreground mb-2">
          Liste des analyses
        </h1>
        <p className="body-text text-muted-foreground">Retrouvez toutes les analyses associees aux PRs et commits</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Descriptions PR generees par Ollama</CardTitle>
          </CardHeader>
          <CardContent>
            {insightsLoading ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : insights.prSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune description PR disponible.</p>
            ) : (
              <div className="space-y-3">
                {insights.prSummaries.map((item) => (
                  <div
                    key={item.analysisId}
                    className={`rounded-xl p-4 ${CARD_GLASS_CLASS}`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{item.repo}</Badge>
                      <Badge variant="secondary">{item.prNumber ? `PR #${item.prNumber}` : item.commitSha ?? "Commit"}</Badge>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <p className="text-sm text-secondary-foreground">{item.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-4">
              <Filter className="h-5 w-5 text-purple-500" />
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par repo, PR, commit ou auteur..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className={`pl-10 ${INPUT_STANDARD}`}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {actionMessage && (
              <div className={`mb-3 ${BANNER_INFO}`}>
                {actionMessage}
              </div>
            )}
            <div className="rounded-xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card-inner hover:bg-card-inner">
                    <TableHead>Repository</TableHead>
                    <TableHead>PR / Commit</TableHead>
                    <TableHead>Auteur</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Duree</TableHead>
                    <TableHead>Findings</TableHead>
                    <TableHead>Distribution</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysesLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                        Chargement des analyses...
                      </TableCell>
                    </TableRow>
                  ) : filteredAnalyses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-6">
                        <EmptyState
                          title="Aucune analyse trouvée"
                          description={searchQuery ? "Aucun résultat pour cette recherche. Essayez d'autres termes." : "Lancez votre première analyse via POST /v1/analyze."}
                          icons={[
                            <Search key="s" className="h-5 w-5" />,
                            <GitCompare key="g" className="h-5 w-5" />,
                            <AlertCircle key="a" className="h-5 w-5" />,
                          ]}
                          variant="subtle"
                          size="sm"
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAnalyses.map((analysis, index) => {
                      const findingsTotal = analysis.blockerCount + analysis.warnCount + analysis.infoCount
                      const isCompleted = normalizeStatus(analysis.status) === "COMPLETED"
                      return (
                        <motion.tr
                          key={analysis.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="group hover:bg-card-hover transition-colors"
                        >
                          <TableCell className="font-medium text-foreground">{analysis.repo}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-teal-400 font-medium">{analysis.prLabel}</span>
                              <span className="text-xs text-muted-foreground font-mono">{analysis.commitSha ?? "-"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-secondary-foreground">{analysis.author}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatCreatedAt(analysis.createdAt)}</TableCell>
                          <TableCell>{getStatusBadge(analysis.status)}</TableCell>
                          <TableCell className="text-muted-foreground">{analysis.durationLabel}</TableCell>
                          <TableCell>
                            <span className="font-semibold text-foreground">{findingsTotal}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {analysis.blockerCount > 0 && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  {analysis.blockerCount}
                                </Badge>
                              )}
                              {analysis.warnCount > 0 && (
                                <Badge variant="warning" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {analysis.warnCount}
                                </Badge>
                              )}
                              {analysis.infoCount > 0 && (
                                <Badge variant="outline" className="gap-1">
                                  <Info className="h-3 w-3" />
                                  {analysis.infoCount}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {isCompleted && findingsTotal > 0 && (
                                <>
                                  <Link href={`/dashboard/report/${analysis.id}`}>
                                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                      <Button variant="ghost" size="icon" title="View report">
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </motion.div>
                                  </Link>
                                  <Link href={`/dashboard/diff/${analysis.id}`}>
                                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                      <Button variant="ghost" size="icon" title="View diff">
                                        <GitCompare className="h-4 w-4" />
                                      </Button>
                                    </motion.div>
                                  </Link>
                                </>
                              )}
                              <motion.div whileHover={{ scale: 1.1, rotate: 180 }} whileTap={{ scale: 0.9 }}>
                                <Button variant="ghost" size="icon" title="Re-run analysis">
                                  <RotateCw className="h-4 w-4" />
                                </Button>
                              </motion.div>
                              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                <Button variant="ghost" size="icon" title="Download JSON">
                                  <Download className="h-4 w-4" />
                                </Button>
                              </motion.div>
                              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Supprimer"
                                  className="text-destructive hover:text-destructive"
                                  disabled={deleteBusyId === analysis.id}
                                  onClick={() => {
                                    void handleDeleteAnalysis(analysis.id)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </motion.div>
                            </div>
                          </TableCell>
                        </motion.tr>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
