"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { motion } from "framer-motion"
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
  Star,
} from "lucide-react"
import {
  fetchDashboardAnalysisDetails,
  type DashboardAnalysisDetails,
  type DashboardReviewContextReference,
} from "@/lib/dashboard-analysis-details"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

function normalizeScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score * 100)))
}

function formatSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    file_exact: "Code exact",
    symbol_exact: "Symbole exact",
    test_related: "Tests lies",
    lexical_code: "Code lexical",
    lexical_document: "Doc lexical",
    lexical_global_document: "Doc global",
    semantic_code: "Code vectoriel",
    semantic_document: "Doc vectoriel",
    semantic_global_document: "Doc global vectoriel",
    repo_bootstrap: "Profil repo",
  }
  return labels[source] ?? source.replaceAll("_", " ")
}

function formatTypeLabel(value: string | null): string | null {
  if (!value) {
    return null
  }
  return value.replaceAll("_", " ")
}

function formatLineRange(start: number | null, end: number | null): string | null {
  if (typeof start !== "number" && typeof end !== "number") {
    return null
  }
  if (typeof start === "number" && typeof end === "number" && start !== end) {
    return `L${start}-${end}`
  }
  if (typeof start === "number") {
    return `L${start}`
  }
  return typeof end === "number" ? `L${end}` : null
}

function formatHeadingPath(path: string[] | null | undefined): string | null {
  if (!Array.isArray(path) || path.length === 0) {
    return null
  }
  return path.join(" > ")
}

function formatReferenceLocation(reference: DashboardReviewContextReference): string | null {
  const parts = [
    reference.page !== null ? `Page ${reference.page}` : null,
    reference.sectionTitle?.trim() || null,
    formatLineRange(reference.lineStart, reference.lineEnd),
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0)

  return parts.length > 0 ? parts.join(" | ") : null
}

function formatReferenceEntity(reference: DashboardReviewContextReference): string | null {
  if (reference.entityName && reference.entityType) {
    return `${reference.entityType}: ${reference.entityName}`
  }
  return reference.entityName ?? reference.entityType
}

function formatReferenceSource(reference: DashboardReviewContextReference): string {
  return reference.sourceUri?.trim().length ? reference.sourceUri : reference.path
}

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function referenceKey(reference: DashboardReviewContextReference, index: number): string {
  return [
    reference.path,
    reference.source,
    reference.sourceType ?? "source",
    reference.chunkType ?? "chunk",
    reference.page ?? "page",
    reference.entityName ?? "entity",
    index,
  ].join("-")
}

export function RagCitations() {
  const params = useParams<{ id: string | string[] }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id

  const [analysis, setAnalysis] = useState<DashboardAnalysisDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedReference, setCopiedReference] = useState<string | null>(null)

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

  const references = useMemo(() => {
    const items = analysis?.reviewOutput?.contextReferences ?? []
    return [...items].sort((left, right) => right.score - left.score)
  }, [analysis])

  const topReferences = references.slice(0, 8)
  const secondaryReferences = references.slice(8)

  const copyReferencePath = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedReference(value)
      window.setTimeout(() => {
        setCopiedReference((current) => (current === value ? null : current))
      }, 1500)
    } catch {
      setCopiedReference(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Chargement des citations RAG...
      </div>
    )
  }

  if (!analysis) {
    return <div>Analyse non trouvee</div>
  }

  return (
    <motion.div className="max-w-5xl mx-auto space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div
        className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="card-heading text-foreground mb-2">
            Citations RAG
          </h1>
          <p className="text-muted-foreground">
            Sources reelles utilisees par l&apos;IA pour contextualiser cette analyse.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{analysis.repo}</Badge>
            <Badge variant="outline">{analysis.prLabel}</Badge>
            <Badge variant="outline">{references.length} reference(s)</Badge>
          </div>
        </div>

        <Link href={`/dashboard/diff/${analysis.id}`}>
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Retour au diff
          </Button>
        </Link>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 backdrop-blur-xl border-blue-200/50 dark:border-blue-800/50">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-full blur-3xl" />
          <CardContent className="pt-6 relative z-10">
            <div className="flex items-start gap-3">
              <BookOpen className="h-6 w-6 text-teal-400" />
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  A propos des citations RAG
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Ces references viennent du pipeline RAG de l&apos;analyse. Elles peuvent provenir du code indexe du repo,
                  des documents ajoutes dans la knowledge base et des sources globales disponibles pour le moteur.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {topReferences.length === 0 ? (
        <Card variant="glass">
          <CardContent className="py-10">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <AlertCircle className="h-10 w-10 text-[color:var(--orange)]" />
              <h2 className="text-lg font-semibold text-foreground">Aucune citation RAG disponible</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Cette analyse n&apos;a pas expose de `context_references`. Soit le fallback `rule_engine` a ete utilise,
                soit le retrieval grounded n&apos;a retourne aucun contexte exploitable.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {topReferences.map((reference, index) => {
            const score = normalizeScore(reference.score)
            const sourceTarget = formatReferenceSource(reference)
            const href = isExternalUrl(sourceTarget) ? sourceTarget : null
            const title = reference.title?.trim() || reference.path
            const subtitle = reference.title?.trim() ? reference.path : null
            const location = formatReferenceLocation(reference)
            const entity = formatReferenceEntity(reference)
            const headingPath = formatHeadingPath(reference.headingPath)

            return (
              <motion.div
                key={referenceKey(reference, index)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.05 }}
              >
                <Card variant="glass" className="group hover:border-teal-500/40 transition-all overflow-hidden">
                  <CardHeader>
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg flex items-start gap-3 group-hover:text-teal-400 dark:group-hover:text-teal-400 transition-colors">
                          <FileText className="h-5 w-5 mt-0.5 text-teal-400 shrink-0" />
                          <span className="break-all">{title}</span>
                        </CardTitle>
                        {subtitle ? (
                          <div className="mt-2 text-xs font-mono text-muted-foreground break-all">{subtitle}</div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-muted-foreground">
                          <Badge variant="outline" className="text-xs">
                            {formatSourceLabel(reference.source)}
                          </Badge>
                          {reference.sourceType ? (
                            <Badge variant="outline" className="text-xs">
                              {formatTypeLabel(reference.sourceType)}
                            </Badge>
                          ) : null}
                          {reference.chunkType ? (
                            <Badge variant="outline" className="text-xs">
                              {formatTypeLabel(reference.chunkType)}
                            </Badge>
                          ) : null}
                          {reference.domain ? (
                            <Badge variant="outline" className="text-xs">
                              {reference.domain}
                            </Badge>
                          ) : null}
                          {reference.documentVersion ? (
                            <Badge variant="outline" className="text-xs">
                              {reference.documentVersion}
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-col items-start gap-3 md:items-end">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30">
                          <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                          <span className="text-sm font-bold text-foreground">{score}%</span>
                        </div>
                        <div className="w-32">
                          <Progress value={score} className="h-2" />
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="rounded-xl border border-blue-200/50 dark:border-blue-800/50 bg-gradient-to-r from-gray-50 to-blue-50/50 dark:from-gray-800/50 dark:to-blue-950/30 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-300 mb-2">
                        Reference
                      </div>
                      <div className="text-sm font-mono leading-relaxed text-secondary-foreground break-all">
                        {sourceTarget}
                      </div>
                      {location ? <div className="mt-2 text-xs text-muted-foreground">{location}</div> : null}
                      {entity ? <div className="mt-1 text-xs text-muted-foreground">{entity}</div> : null}
                      {headingPath ? <div className="mt-1 text-xs text-muted-foreground">{headingPath}</div> : null}
                      {reference.crawlTimestamp ? (
                        <div className="mt-1 text-xs text-muted-foreground">{reference.crawlTimestamp}</div>
                      ) : null}
                    </div>

                    {reference.tags.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {reference.tags.map((tag) => (
                          <Badge key={`${reference.path}-${tag}`} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="gap-2">
                            <ExternalLink className="h-3 w-3" />
                            Ouvrir
                          </Button>
                        </a>
                      ) : null}

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => void copyReferencePath(sourceTarget)}
                      >
                        <Copy className="h-3 w-3" />
                        {copiedReference === sourceTarget ? "Copie" : "Copier la source"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      {secondaryReferences.length > 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="text-base">Autres references consultees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {secondaryReferences.map((reference, index) => (
                  <div
                    key={referenceKey(reference, index)}
                    className="flex flex-col gap-2 rounded-lg border border-gray-200/50 dark:border-gray-800/50 p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="text-foreground break-all">
                        {reference.title?.trim() || reference.path}
                      </div>
                      <div className="text-xs text-muted-foreground break-all">{reference.path}</div>
                      {formatReferenceLocation(reference) ? (
                        <div className="mt-1 text-xs text-muted-foreground">{formatReferenceLocation(reference)}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {formatSourceLabel(reference.source)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {normalizeScore(reference.score)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}
    </motion.div>
  )
}
