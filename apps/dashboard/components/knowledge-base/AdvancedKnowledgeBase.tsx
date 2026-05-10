"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Database,
  Upload,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  BookOpen,
  Shield,
  Code2,
  ChevronRight,
  Brain,
  Network,
  BarChart3,
  Eye,
  Settings,
  Download,
  RefreshCw,
  Layers3,
  Map
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KnowledgeGraph3D } from "@/components/knowledge-base/KnowledgeGraph3D"
import { KnowledgeAnalytics } from "@/components/knowledge-base/KnowledgeAnalytics"
import { KnowledgeSearch } from "@/components/knowledge-base/KnowledgeSearch"

type DocType = "markdown" | "policy" | "documentation" | "code"

interface DocTypeOption {
  id: DocType
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  tags: string[]
}

const DOC_TYPES: DocTypeOption[] = [
  {
    id: "policy",
    label: "Bonnes pratiques / Politique",
    description: "Règles de code, conventions d'équipe, checklist sécurité",
    icon: Shield,
    tags: ["policy", "security"],
  },
  {
    id: "documentation",
    label: "Documentation technique",
    description: "Architecture, guides d'intégration, ADR (Architecture Decision Records)",
    icon: BookOpen,
    tags: ["documentation"],
  },
  {
    id: "markdown",
    label: "Fichier Markdown",
    description: "README, notes de release, wiki interne",
    icon: FileText,
    tags: ["markdown"],
  },
  {
    id: "code",
    label: "Extrait de code",
    description: "Exemples de code de référence, patterns approuvés",
    icon: Code2,
    tags: ["code"],
  },
]

interface KbRepo {
  repo_id: string
  chunks_count?: number
  files_indexed?: number
  last_indexed?: string
}

interface KnowledgeBaseStats {
  totalNodes: number
  totalConnections: number
  documentTypes: Record<string, number>
  recentActivity: Array<{
    action: string
    document: string
    timestamp: string
    user?: string
  }>
  topConcepts: Array<{
    name: string
    connections: number
    relevance: number
  }>
}

type WizardStep = 1 | 2 | 3

export default function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState("overview")
  const [step, setStep] = useState<WizardStep>(1)
  const [repos, setRepos] = useState<KbRepo[]>([])
  const [reposLoading, setReposLoading] = useState(true)
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null)

  // Step 1 state
  const [selectedDocType, setSelectedDocType] = useState<DocType | null>(null)

  // Step 2 state
  const [repoId, setRepoId] = useState("")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")

  // Step 3 state
  const [ingestLoading, setIngestLoading] = useState(false)
  const [ingestResult, setIngestResult] = useState<{ success: boolean; message: string; chunksCount?: number } | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Array<{ title: string; score: number; content: string; chunk_type: string | null }>>([])
  const [searchLoading, setSearchLoading] = useState(false)

  useEffect(() => {
    fetchRepos()
    fetchStats()
  }, [])

  async function fetchRepos() {
    setReposLoading(true)
    try {
      const res = await fetch("/api/dashboard/admin/knowledge-base/repos?limit=50", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json() as { repos?: KbRepo[] }
        setRepos(Array.isArray(data.repos) ? data.repos : [])
      }
    } catch {
      // ignore — repos panel degrades gracefully
    } finally {
      setReposLoading(false)
    }
  }

  async function fetchStats() {
    try {
      // Mock stats for now - in real implementation would fetch from backend
      const mockStats: KnowledgeBaseStats = {
        totalNodes: 847,
        totalConnections: 1264,
        documentTypes: {
          policy: 45,
          documentation: 156,
          code: 234,
          markdown: 412
        },
        recentActivity: [
          { action: "Added", document: "Authentication Best Practices", timestamp: "2024-01-15T10:30:00Z", user: "John Doe" },
          { action: "Updated", document: "React Component Guidelines", timestamp: "2024-01-15T09:15:00Z", user: "Jane Smith" },
          { action: "Indexed", document: "API Security Patterns", timestamp: "2024-01-14T16:45:00Z", user: "System" },
          { action: "Connected", document: "Error Handling Strategy", timestamp: "2024-01-14T14:20:00Z", user: "Mike Johnson" }
        ],
        topConcepts: [
          { name: "Authentication", connections: 23, relevance: 0.94 },
          { name: "Error Handling", connections: 18, relevance: 0.87 },
          { name: "Component Architecture", connections: 15, relevance: 0.82 },
          { name: "Security Patterns", connections: 12, relevance: 0.78 },
          { name: "API Design", connections: 10, relevance: 0.73 }
        ]
      }
      setStats(mockStats)
    } catch {
      // ignore error
    }
  }

  async function handleIngest() {
    if (!repoId.trim() || !title.trim() || !content.trim() || !selectedDocType) return
    setIngestLoading(true)
    setIngestResult(null)
    const docTypeOption = DOC_TYPES.find((d) => d.id === selectedDocType)
    try {
      const res = await fetch("/api/dashboard/admin/knowledge-base/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_id: repoId.trim(),
          title: title.trim(),
          source_type: selectedDocType,
          content: content.trim(),
          tags: docTypeOption?.tags ?? [],
        }),
      })
      const data = await res.json() as { chunks_count?: number; error?: string }
      if (res.ok) {
        setIngestResult({
          success: true,
          message: "Document indexé avec succès dans la Knowledge Base.",
          chunksCount: data.chunks_count,
        })
        fetchRepos()
        fetchStats()
      } else {
        setIngestResult({ success: false, message: data.error ?? "Erreur lors de l'indexation." })
      }
    } catch {
      setIngestResult({ success: false, message: "Impossible de contacter le backend." })
    } finally {
      setIngestLoading(false)
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim() || !repoId.trim()) return
    setSearchLoading(true)
    setSearchResults([])
    try {
      const res = await fetch("/api/dashboard/admin/knowledge-base/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_id: repoId.trim(), query: searchQuery.trim(), limit: 5 }),
      })
      const data = await res.json() as { results?: Array<{ title: string; score: number; content: string; chunk_type: string | null }> }
      setSearchResults(Array.isArray(data.results) ? data.results : [])
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const canProceedStep2 = selectedDocType !== null
  const canIngest = repoId.trim().length > 0 && title.trim().length > 0 && content.trim().length > 10

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-foreground mb-1">
              Knowledge Base 3D
            </h1>
            <p className="text-muted-foreground">
              Explorez et gérez votre base de connaissances avec une visualisation 3D interactive
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchStats}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-primary">{stats.totalNodes}</p>
                      <p className="text-sm text-muted-foreground">Total Nodes</p>
                    </div>
                    <Brain className="h-8 w-8 text-primary" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-emerald-500">{stats.totalConnections}</p>
                      <p className="text-sm text-muted-foreground">Connections</p>
                    </div>
                    <Network className="h-8 w-8 text-emerald-500" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-amber-500">{Object.keys(stats.documentTypes).length}</p>
                      <p className="text-sm text-muted-foreground">Doc Types</p>
                    </div>
                    <FileText className="h-8 w-8 text-amber-500" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-violet-500">{repos.length}</p>
                      <p className="text-sm text-muted-foreground">Repositories</p>
                    </div>
                    <Database className="h-8 w-8 text-violet-500" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </motion.div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="graph" className="flex items-center gap-2">
            <Layers3 className="h-4 w-4" />
            3D Graph
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Manage
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* KB Stats */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-border bg-card/80 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Database className="h-4 w-4 text-orange" />
                    Repos indexés
                    {reposLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {repos.length === 0 && !reposLoading ? (
                    <p className="text-sm text-muted-foreground">Aucun repo indexé pour l&apos;instant.</p>
                  ) : (
                    <div className="space-y-2">
                      {repos.slice(0, 6).map((repo) => (
                        <div
                          key={repo.repo_id}
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background/60 p-2.5 transition-colors hover:border-orange-accent"
                          onClick={() => setRepoId(repo.repo_id)}
                        >
                          <span className="truncate font-mono text-sm text-foreground">{repo.repo_id}</span>
                          {typeof repo.chunks_count === "number" && (
                            <Badge variant="outline" className="text-xs ml-2 shrink-0">
                              {repo.chunks_count} chunks
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Top Concepts */}
            {stats && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card className="border-border bg-card/80 backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Brain className="h-4 w-4 text-emerald-500" />
                      Top Concepts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.topConcepts.map((concept, idx) => (
                        <motion.div
                          key={concept.name}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                        >
                          <div>
                            <p className="font-medium text-sm">{concept.name}</p>
                            <p className="text-xs text-muted-foreground">{concept.connections} connections</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-emerald-500">
                              {(concept.relevance * 100).toFixed(0)}%
                            </p>
                            <div className="w-16 bg-muted rounded-full h-1.5 mt-1">
                              <div 
                                className="bg-emerald-500 rounded-full h-1.5 transition-all"
                                style={{ width: `${concept.relevance * 100}%` }}
                              />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Recent Activity */}
            {stats && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card className="border-border bg-card/80 backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <RefreshCw className="h-4 w-4 text-blue-500" />
                      Recent Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.recentActivity.map((activity, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50"
                        >
                          <div className={`w-2 h-2 rounded-full mt-2 ${
                            activity.action === 'Added' ? 'bg-green-500' :
                            activity.action === 'Updated' ? 'bg-blue-500' :
                            activity.action === 'Indexed' ? 'bg-amber-500' :
                            'bg-violet-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">
                              <span className="font-medium">{activity.action}</span>{" "}
                              <span className="text-muted-foreground">{activity.document}</span>
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {activity.user && (
                                <span className="text-xs text-muted-foreground">by {activity.user}</span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(activity.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          {/* Quick Search */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <KnowledgeSearch 
              onSearch={handleSearch}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchResults={searchResults}
              searchLoading={searchLoading}
              repoId={repoId}
            />
          </motion.div>
        </TabsContent>

        {/* 3D Graph Tab */}
        <TabsContent value="graph" className="space-y-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="h-[80vh]"
          >
            <KnowledgeGraph3D />
          </motion.div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <KnowledgeAnalytics stats={stats} />
          </motion.div>
        </TabsContent>

        {/* Management Tab */}
        <TabsContent value="manage" className="space-y-6">
          {/* Document Ingestion Wizard */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            {/* Step indicators */}
            <div className="flex items-center gap-2 mb-4">
              {([1, 2, 3] as WizardStep[]).map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                      step === s
                        ? "bg-orange text-white"
                        : step > s
                        ? "bg-green-status text-white"
                        : "bg-background text-muted-foreground"
                    }`}
                  >
                    {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
                  </div>
                  <span className={`text-sm ${step === s ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {s === 1 ? "Type de doc" : s === 2 ? "Contenu" : "Indexation"}
                  </span>
                  {s < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              ))}
            </div>

            {/* Wizard Steps */}
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <Card className="border-border bg-card/80 backdrop-blur-xl">
                    <CardHeader>
                      <CardTitle className="text-base">Étape 1 — Choisissez le type de document</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {DOC_TYPES.map((docType) => (
                          <motion.div
                            key={docType.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                              selectedDocType === docType.id
                                ? "border-orange-accent bg-orange/10"
                                : "border-border hover:border-orange-accent/70"
                            }`}
                            onClick={() => setSelectedDocType(docType.id)}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`rounded-lg p-2 ${selectedDocType === docType.id ? "bg-orange text-white" : "bg-background text-muted-foreground"}`}>
                                <docType.icon className={`h-4 w-4 ${selectedDocType === docType.id ? "text-white" : "text-muted-foreground"}`} />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-foreground">{docType.label}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">{docType.description}</div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                      <div className="flex justify-end pt-2">
                        <Button onClick={() => setStep(2)} disabled={!canProceedStep2} className="gap-2">
                          Suivant <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <Card className="border-border bg-card/80 backdrop-blur-xl">
                    <CardHeader>
                      <CardTitle className="text-base">Étape 2 — Renseignez le document</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1 block">
                          Repo ID <span className="text-destructive">*</span>
                        </label>
                        <Input
                          placeholder="ex: myorg/myrepo"
                          value={repoId}
                          onChange={(e) => setRepoId(e.target.value)}
                          className="font-mono"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">Identifiant du repository concerné par ce document.</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1 block">
                          Titre du document <span className="text-destructive">*</span>
                        </label>
                        <Input
                          placeholder="ex: Guide de sécurité API, Convention de nommage..."
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1 block">
                          Contenu <span className="text-destructive">*</span>
                        </label>
                        <Textarea
                          placeholder="Collez ici le contenu du document (Markdown, texte, code...)..."
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                          rows={10}
                          className="font-mono text-sm"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {content.length} caractères — Le document sera découpé en chunks et vectorisé.
                        </p>
                      </div>
                      <div className="flex justify-between pt-2">
                        <Button variant="outline" onClick={() => setStep(1)}>
                          Retour
                        </Button>
                        <Button onClick={() => setStep(3)} disabled={!canIngest} className="gap-2">
                          Suivant <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <Card className="border-border bg-card/80 backdrop-blur-xl">
                    <CardHeader>
                      <CardTitle className="text-base">Étape 3 — Indexation dans la Knowledge Base</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Summary */}
                      <div className="space-y-2 rounded-xl border border-border bg-background/60 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Repo</span>
                          <span className="font-mono text-sm text-foreground">{repoId}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Titre</span>
                          <span className="text-sm text-foreground">{title}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Type</span>
                          <Badge variant="outline" className="text-xs">{selectedDocType}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Taille</span>
                          <span className="text-sm text-foreground">{content.length} caractères</span>
                        </div>
                      </div>

                      {ingestLoading && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-teal">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Découpage en chunks et vectorisation en cours...
                          </div>
                          <Progress value={undefined} className="h-1.5 animate-pulse" />
                        </div>
                      )}

                      {ingestResult && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={`flex items-start gap-3 rounded-xl border p-4 ${
                            ingestResult.success
                              ? "border-green-status/20 bg-green-status/10"
                              : "border-red-500/20 bg-red-500/10"
                          }`}
                        >
                          {ingestResult.success ? (
                            <CheckCircle2 className="flex-shrink-0 mt-0.5 h-5 w-5 text-green-status" />
                          ) : (
                            <AlertCircle className="flex-shrink-0 mt-0.5 h-5 w-5 text-destructive" />
                          )}
                          <div>
                            <p className={`text-sm font-medium ${ingestResult.success ? "text-green-status" : "text-destructive"}`}>
                              {ingestResult.message}
                            </p>
                            {ingestResult.chunksCount !== undefined && (
                              <p className="mt-0.5 text-xs text-green-status">
                                {ingestResult.chunksCount} chunk(s) indexé(s) dans Qdrant.
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}

                      <div className="flex justify-between pt-2">
                        <Button variant="outline" onClick={() => setStep(2)} disabled={ingestLoading}>
                          Retour
                        </Button>
                        <div className="flex gap-2">
                          {ingestResult?.success && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setStep(1)
                                setSelectedDocType(null)
                                setTitle("")
                                setContent("")
                                setIngestResult(null)
                              }}
                            >
                              Indexer un autre doc
                            </Button>
                          )}
                          {!ingestResult?.success && (
                            <Button onClick={handleIngest} disabled={ingestLoading} className="gap-2">
                              {ingestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                              Indexer dans la KB
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  )
}