"use client"
/* eslint-disable react/no-unescaped-entities */

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Database, FileText, Globe, RefreshCw, Trash2, Edit, Search, Upload, Plus, Sparkles, Code2, FileCode2, Link2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { emptyDashboardInsights, fetchDashboardInsights } from "@/lib/dashboard-insights"

type RepoProfileItem = {
  repo_id: string
  repo_path?: string | null
  indexed_commit?: string | null
  default_branch?: string | null
  profile?: Record<string, unknown>
  updated_at?: string | null
}

type RepoProfilesPayload = {
  items?: RepoProfileItem[]
}

type ApiErrorPayload = {
  error?: unknown
  detail?: unknown
  message?: unknown
}

type PdfImportResponse = ApiErrorPayload & {
  importedCount?: number
  items?: Array<{
    docId?: string
    title?: string
    chunks?: number
  }>
}

type DocumentIngestResponse = ApiErrorPayload & {
  doc_id?: string
  title?: string
  chunks?: number
  source_type?: string
  source_uri?: string
  page?: number | null
  section_title?: string | null
  tags?: string[]
}

type QueryChunk = {
  path?: string
  source_type?: string
  source_uri?: string
  title?: string
  section_title?: string | null
  heading_path?: string[] | string | null
  page?: number | null
  entity_type?: string | null
  entity_name?: string | null
  line_start?: number | null
  line_end?: number | null
  domain?: string | null
  document_version?: string | null
  score?: number
  chunk_index?: number
  start_line?: number | null
  end_line?: number | null
  content?: string
}

type QueryResponse = {
  chunks?: QueryChunk[]
}

type SearchCitation = {
  doc_id?: string
  title?: string
  source_type?: string
  excerpt?: string
  score?: number
  path_or_url?: string | null
  chunk_index?: number
  source_uri?: string | null
  page?: number | null
  section_title?: string | null
  heading_path?: string[] | string | null
  entity_type?: string | null
  entity_name?: string | null
  line_start?: number | null
  line_end?: number | null
  domain?: string | null
  document_version?: string | null
  crawl_timestamp?: string | null
  tags?: string[]
}

type SearchResponse = {
  citations?: SearchCitation[]
}

type SourceType = "pdf" | "web" | "markdown" | "code" | "sql"
type RetrievalSource = "auto" | SourceType

const SOURCE_TYPES: Array<{
  value: SourceType
  label: string
  hint: string
  pathLabel: string
  pathPlaceholder: string
  notesPlaceholder: string
  submitLabel: string
}> = [
  {
    value: "pdf",
    label: "PDF",
    hint: "Importer un ou plusieurs fichiers PDF",
    pathLabel: "Chemin source / contexte",
    pathPlaceholder: "ex: dossier, titre documentaire ou archive",
    notesPlaceholder: "Ajoutez un contexte metier, une version documentaire ou des notes de cadrage.",
    submitLabel: "Indexer les PDF",
  },
  {
    value: "web",
    label: "Pages web",
    hint: "Indexer du HTML ou du texte de page web",
    pathLabel: "URL de page ou domaine",
    pathPlaceholder: "ex: https://docs.exemple.com/auth/login",
    notesPlaceholder: "Collez le contenu de la page, un extrait HTML nettoye ou les notes de capture.",
    submitLabel: "Indexer la page web",
  },
  {
    value: "markdown",
    label: "Documentation markdown",
    hint: "Indexer des fichiers .md/.mdx ou du texte colle",
    pathLabel: "Chemin du fichier ou dossier",
    pathPlaceholder: "ex: docs/auth/login.md",
    notesPlaceholder: "Collez le markdown nettoye ou decrivez la section a indexer.",
    submitLabel: "Indexer la documentation",
  },
  {
    value: "code",
    label: "Code source",
    hint: "Repository local ou distant",
    pathLabel: "Chemin du repo",
    pathPlaceholder: "ex: /srv/repos/mon-repo ou org/repo",
    notesPlaceholder: "Ajoutez un commentaire de contexte ou une instruction de reindexation.",
    submitLabel: "Indexer le code",
  },
  {
    value: "sql",
    label: "Base SQL",
    hint: "Indexer un dump SQL ou une description de schema",
    pathLabel: "Schema, dump ou source SQL",
    pathPlaceholder: "ex: migrations/001_init.sql",
    notesPlaceholder: "Collez le schema, les migrations ou la documentation des tables.",
    submitLabel: "Indexer le SQL",
  },
]

function filesIndexed(item: RepoProfileItem): number {
  const profile = item.profile ?? {}
  const raw = profile.files_indexed
  if (typeof raw === "number") {
    return raw
  }
  if (typeof raw === "string") {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return 0
}

function repoStatus(item: RepoProfileItem): "indexed" | "outdated" {
  if (!item.updated_at) {
    return "outdated"
  }
  const updatedAt = new Date(item.updated_at)
  if (Number.isNaN(updatedAt.getTime())) {
    return "outdated"
  }
  const ageMs = Date.now() - updatedAt.getTime()
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000
  return ageMs <= fourteenDaysMs ? "indexed" : "outdated"
}

function displaySource(item: RepoProfileItem): string {
  if (item.repo_path && item.repo_path.trim().length > 0) {
    return item.repo_path
  }
  if (item.default_branch && item.default_branch.trim().length > 0) {
    return `branch:${item.default_branch}`
  }
  return "unknown"
}

function extractErrorText(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = extractErrorText(item)
      if (candidate) {
        return candidate
      }
    }
    return null
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return (
      extractErrorText(record.message) ??
      extractErrorText(record.detail) ??
      extractErrorText(record.error) ??
      null
    )
  }
  return null
}

function resolveApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback
  }
  const record = payload as Record<string, unknown>
  return (
    extractErrorText(record.error) ??
    extractErrorText(record.detail) ??
    extractErrorText(record.message) ??
    fallback
  )
}

function sourceTypeDetails(sourceType: SourceType) {
  return SOURCE_TYPES.find((item) => item.value === sourceType) ?? SOURCE_TYPES[0]
}

function formatChunkLineRange(chunk: QueryChunk): string | null {
  const start = typeof chunk.line_start === "number" ? chunk.line_start : chunk.start_line ?? null
  const end = typeof chunk.line_end === "number" ? chunk.line_end : chunk.end_line ?? null
  if (start !== null && end !== null && start !== end) {
    return `L${start}-${end}`
  }
  if (start !== null) {
    return `L${start}`
  }
  return end !== null ? `L${end}` : null
}

function formatHeadingPath(value: QueryChunk["heading_path"]): string | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(" > ") : null
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value
  }
  return null
}

function formatSourceMeta(chunk: QueryChunk): string | null {
  const pieces = [
    chunk.source_type ? chunk.source_type.replaceAll("_", " ") : null,
    chunk.page !== null && typeof chunk.page === "number" ? `page ${chunk.page}` : null,
    chunk.section_title?.trim() || null,
    formatChunkLineRange(chunk),
  ].filter((piece): piece is string => typeof piece === "string" && piece.trim().length > 0)

  return pieces.length > 0 ? pieces.join(" | ") : null
}

export function KnowledgeBase() {
  const [searchQuery, setSearchQuery] = useState("")
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [repoOverviews, setRepoOverviews] = useState(() => emptyDashboardInsights("admin").repoOverviews)

  const [repos, setRepos] = useState<RepoProfileItem[]>([])
  const [loadingRepos, setLoadingRepos] = useState(true)
  const [selectedRepoId, setSelectedRepoId] = useState<string>("")
  const [retrievalQuery, setRetrievalQuery] = useState("")
  const [retrievalSource, setRetrievalSource] = useState<RetrievalSource>("auto")
  const [queryResults, setQueryResults] = useState<QueryChunk[]>([])
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [showSourceForm, setShowSourceForm] = useState(false)
  const [sourceType, setSourceType] = useState<SourceType>("code")
  const [sourceName, setSourceName] = useState("")
  const [sourceLocation, setSourceLocation] = useState("")
  const [sourceNotes, setSourceNotes] = useState("")
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const selectedSourceDetails = useMemo(() => sourceTypeDetails(sourceType), [sourceType])

  const loadRepos = useCallback(async () => {
    setLoadingRepos(true)
    setActionMessage(null)
    try {
      const response = await fetch("/api/dashboard/admin/knowledge-base/repos?limit=200", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as RepoProfilesPayload & ApiErrorPayload
      if (!response.ok) {
        throw new Error(resolveApiErrorMessage(payload, "Impossible de charger les sources KB."))
      }
      const items = Array.isArray(payload.items) ? payload.items : []
      setRepos(items)
      setSelectedRepoId((previous) => previous || items[0]?.repo_id || "")
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Impossible de charger les sources KB.")
    } finally {
      setLoadingRepos(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setInsightsLoading(true)
    fetchDashboardInsights()
      .then((payload) => {
        if (cancelled) {
          return
        }
        setRepoOverviews(payload.repoOverviews)
      })
      .finally(() => {
        if (!cancelled) {
          setInsightsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void loadRepos()
  }, [loadRepos])

  const filteredRepos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return repos
    }
    return repos.filter((item) => {
      const source = displaySource(item).toLowerCase()
      return item.repo_id.toLowerCase().includes(query) || source.includes(query)
    })
  }, [repos, searchQuery])

  const stats = useMemo(() => {
    const total = repos.length
    const totalFiles = repos.reduce((accumulator, item) => accumulator + filesIndexed(item), 0)
    const indexedCount = repos.filter((item) => repoStatus(item) === "indexed").length
    const outdatedCount = repos.filter((item) => repoStatus(item) === "outdated").length
    return [
      { label: "Sources", value: total, icon: Database, gradient: "from-blue-500 to-cyan-500" },
      { label: "Fichiers indexes", value: totalFiles, icon: Database, gradient: "from-green-500 to-emerald-500" },
      { label: "A jour", value: indexedCount, icon: Database, gradient: "from-purple-500 to-pink-500" },
      { label: "A reindexer", value: outdatedCount, icon: Database, gradient: "from-orange-500 to-red-500" },
    ]
  }, [repos])

  const queueReindex = async (repoId: string, repoPath?: string | null) => {
    setBusyAction(`reindex:${repoId}`)
    setActionMessage(null)
    try {
      const response = await fetch("/api/dashboard/admin/knowledge-base/reindex", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          repoId,
          repoPath: repoPath ?? undefined,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as { taskId?: string } & ApiErrorPayload
      if (!response.ok) {
        throw new Error(resolveApiErrorMessage(payload, "Reindexation impossible."))
      }
      setActionMessage(`Reindexation en file pour ${repoId} (task: ${payload.taskId ?? "n/a"}).`)
      await loadRepos()
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Reindexation impossible.")
    } finally {
      setBusyAction(null)
    }
  }

  const deleteRepo = async (repoId: string) => {
    setBusyAction(`delete:${repoId}`)
    setActionMessage(null)
    try {
      const response = await fetch(`/api/dashboard/admin/knowledge-base/repos/${encodeURIComponent(repoId)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload
      if (!response.ok) {
        throw new Error(resolveApiErrorMessage(payload, "Suppression source impossible."))
      }
      setActionMessage(`Source ${repoId} supprimee.`)
      setQueryResults([])
      if (selectedRepoId === repoId) {
        setSelectedRepoId("")
      }
      await loadRepos()
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Suppression source impossible.")
    } finally {
      setBusyAction(null)
    }
  }

  const resetSourceForm = () => {
    setSourceName("")
    setSourceLocation("")
    setSourceNotes("")
    setDroppedFiles([])
  }

  const openSourceForm = (kind: SourceType = "code") => {
    setSourceType(kind)
    setShowSourceForm(true)
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) {
      return
    }
    const accepted = Array.from(files)
    setDroppedFiles((previous) => [...previous, ...accepted].slice(0, 10))
  }

  const ingestDocument = async ({
    repoId,
    title,
    sourceType: kind,
    pathOrUrl,
    content,
    tags,
  }: {
    repoId: string
    title: string
    sourceType: Exclude<SourceType, "code" | "pdf">
    pathOrUrl?: string
    content: string
    tags: string[]
  }) => {
    const response = await fetch("/api/dashboard/admin/knowledge-base/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        repo_id: repoId,
        title,
        source_type: kind,
        path_or_url: pathOrUrl || undefined,
        source_uri: pathOrUrl || undefined,
        content,
        tags,
        doc_version: 1,
        metadata: {
          imported_from: "dashboard",
        },
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as DocumentIngestResponse
    if (!response.ok) {
      throw new Error(resolveApiErrorMessage(payload, "Ingestion impossible."))
    }
    return payload
  }

  const createSource = async () => {
    const normalizedName = sourceName.trim()
    const normalizedLocation = sourceLocation.trim()
    const normalizedNotes = sourceNotes.trim()

    if (!normalizedName) {
      setActionMessage("Donnez un identifiant de source.")
      return
    }

    if (sourceType === "code") {
      await queueReindex(normalizedName, normalizedLocation || undefined)
      setShowSourceForm(false)
      resetSourceForm()
      return
    }

    if (sourceType === "pdf") {
      if (droppedFiles.length === 0) {
        setActionMessage("Ajoutez au moins un fichier PDF.")
        return
      }

      setBusyAction("import:pdf")
      setActionMessage(null)
      try {
        const formData = new FormData()
        formData.set("repoId", normalizedName)
        if (normalizedLocation) {
          formData.set("pathOrUrl", normalizedLocation)
        }
        if (sourceNotes.trim()) {
          formData.set("notes", sourceNotes.trim())
        }
        for (const file of droppedFiles) {
          formData.append("files", file)
        }

        const response = await fetch("/api/dashboard/admin/knowledge-base/import-pdf", {
          method: "POST",
          body: formData,
          headers: { Accept: "application/json" },
        })
        const payload = (await response.json().catch(() => ({}))) as PdfImportResponse
        if (!response.ok) {
          throw new Error(resolveApiErrorMessage(payload, "Import PDF impossible."))
        }

        const importedCount = Number(payload.importedCount ?? 0) || 0
        const totalChunks = Array.isArray(payload.items)
          ? payload.items.reduce((sum, item) => sum + (Number(item.chunks ?? 0) || 0), 0)
          : 0

        setActionMessage(
          `${importedCount} PDF ingere(s) pour ${normalizedName}${totalChunks > 0 ? ` (${totalChunks} chunks)` : ""}.`,
        )
        setShowSourceForm(false)
        resetSourceForm()
        await loadRepos()
        setSelectedRepoId(normalizedName)
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : "Import PDF impossible.")
      } finally {
        setBusyAction(null)
      }
      return
    }

    if (droppedFiles.length === 0 && !normalizedNotes) {
      setActionMessage("Ajoutez au moins un fichier texte ou collez du contenu a indexer.")
      return
    }

    setBusyAction(`import:${sourceType}`)
    setActionMessage(null)
    try {
      const importedItems: Array<{ title: string; chunks: number }> = []
      const baseTags = [sourceType, `source:${sourceType}`, droppedFiles.length > 0 ? "dashboard_upload" : "dashboard_manual"]

      if (droppedFiles.length > 0) {
        for (const file of droppedFiles) {
          const extractedText = (await file.text()).trim()
          if (!extractedText) {
            throw new Error(`Le fichier '${file.name}' est vide ou illisible.`)
          }
          const combinedContent = normalizedNotes ? `${normalizedNotes}\n\n${extractedText}` : extractedText
          const payload = await ingestDocument({
            repoId: normalizedName,
            title: file.name.trim() || normalizedName,
            sourceType,
            pathOrUrl: normalizedLocation || file.name,
            content: combinedContent,
            tags: baseTags,
          })
          importedItems.push({
            title: String(payload.title ?? file.name),
            chunks: Number(payload.chunks ?? 0) || 0,
          })
        }
      } else {
        const payload = await ingestDocument({
          repoId: normalizedName,
          title: normalizedLocation || normalizedName,
          sourceType,
          pathOrUrl: normalizedLocation || undefined,
          content: normalizedNotes,
          tags: baseTags,
        })
        importedItems.push({
          title: String(payload.title ?? normalizedName),
          chunks: Number(payload.chunks ?? 0) || 0,
        })
      }

      const totalChunks = importedItems.reduce((sum, item) => sum + item.chunks, 0)
      setActionMessage(
        `${importedItems.length} source(s) ${sourceType} indexee(s) pour ${normalizedName}${totalChunks > 0 ? ` (${totalChunks} chunks)` : ""}.`,
      )
      setShowSourceForm(false)
      resetSourceForm()
      await loadRepos()
      setSelectedRepoId(normalizedName)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Ingestion impossible.")
    } finally {
      setBusyAction(null)
    }
  }

  const editSource = async (item: RepoProfileItem) => {
    const repoPath = window.prompt("Nouveau chemin local du repo:", item.repo_path ?? "")
    if (repoPath === null) {
      return
    }
    await queueReindex(item.repo_id, repoPath.trim())
  }

  const runRetrievalTest = async () => {
    if (!selectedRepoId) {
      setActionMessage("Selectionnez une source avant le test retrieval.")
      return
    }
    if (!retrievalQuery.trim()) {
      setActionMessage("Entrez une requete de retrieval.")
      return
    }
    setBusyAction("retrieval")
    setActionMessage(null)
    try {
      const isDocumentRetrieval = retrievalSource !== "auto" && retrievalSource !== "code"
      const response = await fetch(
        isDocumentRetrieval
          ? "/api/dashboard/admin/knowledge-base/search"
          : "/api/dashboard/admin/knowledge-base/query",
        {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
            repo_id: selectedRepoId,
            query: retrievalQuery.trim(),
            limit: 8,
            ...(isDocumentRetrieval
              ? { source_type: retrievalSource }
              : { route_hint: retrievalSource === "code" ? "code_query" : "auto" }),
          }),
        },
      )
      const payload = (await response.json().catch(() => ({}))) as QueryResponse & SearchResponse & ApiErrorPayload
      if (!response.ok) {
        throw new Error(resolveApiErrorMessage(payload, "Test retrieval impossible."))
      }
      if (Array.isArray(payload.chunks)) {
        setQueryResults(payload.chunks)
      } else if (Array.isArray(payload.citations)) {
        setQueryResults(
          payload.citations.map((item) => ({
            path: item.path_or_url ?? item.source_uri ?? item.title ?? "unknown",
            source_type: item.source_type,
            source_uri: item.source_uri ?? undefined,
            title: item.title,
            section_title: item.section_title ?? undefined,
            heading_path: item.heading_path ?? undefined,
            page: item.page ?? undefined,
            entity_type: item.entity_type ?? undefined,
            entity_name: item.entity_name ?? undefined,
            line_start: item.line_start ?? undefined,
            line_end: item.line_end ?? undefined,
            domain: item.domain ?? undefined,
            document_version: item.document_version ?? undefined,
            chunk_index: item.chunk_index,
            score: item.score,
            content: item.excerpt,
          })),
        )
      } else {
        setQueryResults([])
      }
      setActionMessage(`Retrieval termine sur ${selectedRepoId}.`)
    } catch (error) {
      setQueryResults([])
      setActionMessage(error instanceof Error ? error.message : "Test retrieval impossible.")
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <motion.div className="max-w-6xl mx-auto space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="flex justify-between items-start" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <h1 className="card-heading text-foreground mb-2 flex items-center gap-3">
            <Database className="h-10 w-10 text-emerald-500" />
            Base de Connaissance
          </h1>
          <p className="text-muted-foreground">Gestion des sources indexees pour le RAG</p>
        </div>
        <div className="flex gap-3">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button type="button" variant="outline" className="gap-2" onClick={() => openSourceForm("pdf")} disabled={busyAction !== null}>
              <Upload className="h-4 w-4" />
              Importer
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button type="button" className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700" onClick={() => openSourceForm("code")} disabled={busyAction !== null}>
              <Plus className="h-4 w-4" />
              Ajouter source
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {actionMessage && (
        <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          {actionMessage}
        </div>
      )}

      {showSourceForm && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card variant="glass" className="border-[color:var(--green-status)]/40">
            <CardHeader>
              <CardTitle>Zone d'insertion des sources KB</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-muted-foreground dark:text-gray-300">Type de source</label>
                  <Select value={sourceType} onValueChange={(value: SourceType) => setSourceType(value)}>
                    <SelectTrigger className="bg-white dark:bg-gray-800">
                      <SelectValue placeholder="Selectionner un type" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {SOURCE_TYPES.find((item) => item.value === sourceType)?.hint}
                  </p>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-muted-foreground dark:text-gray-300">Identifiant source</label>
                  <Input
                    value={sourceName}
                    onChange={(event) => setSourceName(event.target.value)}
                    placeholder="ex: org/repo, docs-interne, sql-prod"
                    className="bg-white dark:bg-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-muted-foreground dark:text-gray-300">{selectedSourceDetails.pathLabel}</label>
                <Input
                  value={sourceLocation}
                  onChange={(event) => setSourceLocation(event.target.value)}
                  placeholder={selectedSourceDetails.pathPlaceholder}
                  className="bg-white dark:bg-gray-800"
                />
              </div>

              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4 text-sm text-muted-foreground dark:text-gray-300">
                <div className="font-medium text-emerald-700 dark:text-emerald-300">{selectedSourceDetails.label}</div>
                <p className="mt-1 text-xs text-muted-foreground">{selectedSourceDetails.hint}</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border border-emerald-400/20 bg-white/60 p-3 dark:bg-gray-900/40">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Attendu</div>
                    <div className="mt-1">{selectedSourceDetails.pathLabel}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-400/20 bg-white/60 p-3 dark:bg-gray-900/40">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Action</div>
                    <div className="mt-1">{selectedSourceDetails.submitLabel}</div>
                  </div>
                </div>
              </div>

              <div
                className="rounded-xl border border-dashed border-emerald-400/40 bg-emerald-500/5 p-4"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  handleFiles(event.dataTransfer.files)
                }}
              >
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
                  <Upload className="h-4 w-4" />
                  Drag & drop des fichiers
                </div>
                <p className="text-xs text-muted-foreground">Sources possibles : PDF, pages web, documentation markdown, code source, base SQL.</p>
                <Input
                  className="mt-3 bg-white dark:bg-gray-800"
                  type="file"
                  multiple
                  onChange={(event) => handleFiles(event.target.files)}
                />
                {droppedFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {droppedFiles.map((file) => (
                      <Badge key={`${file.name}-${file.lastModified}`} variant="secondary">
                        {file.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm text-muted-foreground dark:text-gray-300">Notes / contexte</label>
                <Textarea
                  value={sourceNotes}
                  onChange={(event) => setSourceNotes(event.target.value)}
                  placeholder={selectedSourceDetails.notesPlaceholder}
                  className="bg-white dark:bg-gray-800"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600" onClick={() => void createSource()} disabled={busyAction !== null}>
                  {sourceType === "code" ? <Code2 className="h-4 w-4" /> : sourceType === "pdf" ? <FileText className="h-4 w-4" /> : sourceType === "markdown" ? <FileCode2 className="h-4 w-4" /> : sourceType === "web" ? <Globe className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                  {selectedSourceDetails.submitLabel}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowSourceForm(false)
                    resetSourceForm()
                  }}
                >
                  Annuler
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + index * 0.05 }} whileHover={{ y: -4, scale: 1.02 }}>
            <Card variant="glass" className="relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${stat.gradient} opacity-20 rounded-full blur-2xl`} />
              <CardContent className="pt-6 relative z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                    <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                  </div>
                  <motion.div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient}`} whileHover={{ scale: 1.1, rotate: 360 }} transition={{ duration: 0.5 }}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 backdrop-blur-xl border-emerald-200/50 dark:border-emerald-800/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              Operations d'ingestion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button type="button" className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700" onClick={() => void (selectedRepoId ? queueReindex(selectedRepoId) : openSourceForm("code"))} disabled={busyAction !== null}>
                <RefreshCw className="h-4 w-4" />
                Lancer re-indexation
              </Button>
              <Button type="button" variant="outline" onClick={() => void loadRepos()} disabled={busyAction !== null || loadingRepos}>
                Actualiser liste
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Apercu initial des repos (Ollama)</CardTitle>
          </CardHeader>
          <CardContent>
            {insightsLoading ? (
              <p className="text-sm text-muted-foreground">Chargement des apercus...</p>
            ) : repoOverviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun apercu de repo disponible.</p>
            ) : (
              <div className="space-y-3">
                {repoOverviews.slice(0, 8).map((overview) => (
                  <div key={overview.repoId} className="rounded-xl border border-gray-200/60 bg-white/70 p-4 dark:border-gray-700/60 dark:bg-gray-900/60">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{overview.repoId}</Badge>
                      <Badge variant={overview.fallbackUsed ? "secondary" : "default"}>{overview.source}</Badge>
                    </div>
                    <p className="text-sm text-secondary-foreground">{overview.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-4">
              <CardTitle className="flex-1">Sources indexees</CardTitle>
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Rechercher une source..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="pl-10 bg-white dark:bg-gray-800" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 dark:bg-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                    <TableHead>Source</TableHead>
                    <TableHead>Chemin/branche</TableHead>
                    <TableHead>Derniere indexation</TableHead>
                    <TableHead>Fichiers</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingRepos ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Chargement des sources...
                      </TableCell>
                    </TableRow>
                  ) : filteredRepos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Aucune source indexee.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRepos.map((item, index) => {
                      const status = repoStatus(item)
                      const rowBusy = busyAction === `reindex:${item.repo_id}` || busyAction === `delete:${item.repo_id}`
                      return (
                        <motion.tr key={item.repo_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + index * 0.03 }} className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                          <TableCell className="font-medium text-foreground">{item.repo_id}</TableCell>
                          <TableCell className="text-secondary-foreground">{displaySource(item)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{item.updated_at ? new Date(item.updated_at).toLocaleDateString("fr-FR") : "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{filesIndexed(item)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={status === "indexed" ? "default" : "secondary"}>{status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <motion.div whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}>
                                <Button type="button" variant="ghost" size="icon" onClick={() => void editSource(item)} disabled={rowBusy}>
                                  <Edit className="h-4 w-4 text-teal-400" />
                                </Button>
                              </motion.div>
                              <motion.div whileHover={{ scale: 1.2, rotate: 180 }} whileTap={{ scale: 0.9 }}>
                                <Button type="button" variant="ghost" size="icon" onClick={() => void queueReindex(item.repo_id, item.repo_path)} disabled={rowBusy}>
                                  <RefreshCw className="h-4 w-4 text-purple-600" />
                                </Button>
                              </motion.div>
                              <motion.div whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}>
                                <Button type="button" variant="ghost" size="icon" onClick={() => setSelectedRepoId(item.repo_id)} disabled={rowBusy}>
                                  <Search className="h-4 w-4 text-emerald-600" />
                                </Button>
                              </motion.div>
                              <motion.div whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}>
                                <Button type="button" variant="ghost" size="icon" onClick={() => void deleteRepo(item.repo_id)} disabled={rowBusy}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
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

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Tester le retrieval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Source</label>
                <Select value={selectedRepoId} onValueChange={setSelectedRepoId}>
                  <SelectTrigger className="bg-white dark:bg-gray-800">
                    <SelectValue placeholder="Selectionner un repo indexe" />
                  </SelectTrigger>
                  <SelectContent>
                    {repos.map((item) => (
                      <SelectItem key={item.repo_id} value={item.repo_id}>
                        {item.repo_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Requete</label>
                <Input placeholder="Ex: SQL injection prevention" value={retrievalQuery} onChange={(event) => setRetrievalQuery(event.target.value)} className="bg-white dark:bg-gray-800" />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Canal de retrieval</label>
                <Select value={retrievalSource} onValueChange={(value: RetrievalSource) => setRetrievalSource(value)}>
                  <SelectTrigger className="bg-white dark:bg-gray-800">
                    <SelectValue placeholder="Selectionner un mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    {SOURCE_TYPES.map((item) => (
                      <SelectItem key={`retrieval-${item.value}`} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-xl border border-blue-200/50 bg-blue-50/70 p-3 text-sm text-blue-900 dark:border-blue-800/50 dark:bg-blue-950/20 dark:text-blue-100">
                <div className="font-medium">Scope de recherche</div>
                <p className="mt-1 text-xs text-blue-700 dark:text-blue-200">
                  {retrievalSource === "auto" || retrievalSource === "code"
                    ? "Le test utilise /context/query pour le code et le routing hybride."
                    : `Le test utilise /search avec un filtre source_type=${retrievalSource}.`}
                </p>
              </div>
            </div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button type="button" className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700" onClick={() => void runRetrievalTest()} disabled={busyAction === "retrieval"}>
                <Search className="h-4 w-4" />
                Tester
              </Button>
            </motion.div>
            {queryResults.length > 0 && (
              <div className="space-y-2 rounded-xl border border-gray-200/60 bg-white/70 p-4 dark:border-gray-700/60 dark:bg-gray-900/60">
                {queryResults.slice(0, 6).map((chunk, index) => (
                  <div key={`${chunk.path ?? "chunk"}-${index}`} className="rounded-lg border border-gray-200/50 p-3 dark:border-gray-700/50">
                    {chunk.title ? (
                      <div className="mb-1 text-xs font-medium text-foreground dark:text-gray-200">{chunk.title}</div>
                    ) : null}
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <Badge variant="outline">{chunk.path ?? chunk.title ?? "unknown"}</Badge>
                      {chunk.source_type ? <Badge variant="outline">{chunk.source_type.replaceAll("_", " ")}</Badge> : null}
                      {chunk.page !== null && typeof chunk.page === "number" ? <Badge variant="secondary">page {chunk.page}</Badge> : null}
                      {chunk.entity_name ? (
                        <Badge variant="secondary">
                          {chunk.entity_type ? `${chunk.entity_type}: ` : ""}
                          {chunk.entity_name}
                        </Badge>
                      ) : null}
                      {chunk.document_version ? <Badge variant="outline">{chunk.document_version}</Badge> : null}
                      {formatChunkLineRange(chunk) ? <Badge variant="outline">{formatChunkLineRange(chunk)}</Badge> : null}
                      <Badge variant="secondary">score {(chunk.score ?? 0).toFixed(2)}</Badge>
                    </div>
                    {formatSourceMeta(chunk) ? (
                      <div className="mb-2 text-[11px] text-muted-foreground">{formatSourceMeta(chunk)}</div>
                    ) : null}
                    {chunk.section_title ? (
                      <div className="mb-1 text-xs font-medium text-secondary-foreground">{chunk.section_title}</div>
                    ) : null}
                    {formatHeadingPath(chunk.heading_path) ? (
                      <div className="mb-1 text-[11px] text-muted-foreground">{formatHeadingPath(chunk.heading_path)}</div>
                    ) : null}
                    {chunk.source_uri ? (
                      <div className="mb-2 text-[11px] font-mono break-all text-muted-foreground">{chunk.source_uri}</div>
                    ) : null}
                    <p className="text-xs text-muted-foreground dark:text-gray-300 line-clamp-3">{chunk.content ?? ""}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
