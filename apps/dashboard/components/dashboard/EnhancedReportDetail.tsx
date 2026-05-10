"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { generateAnalysisPdf } from "@/lib/pdf-report"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft,
  RefreshCw,
  Download,
  Share2,
  MoreVertical,
  Search,
  Filter,
  FileCode,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  GitPullRequest,
  GitCommit,
  BarChart3,
  Zap,
  Shield,
  Database,
  Server,
  Code2,
  Layout,
  Terminal,
  Layers,
  Package,
  Lightbulb,
  ArrowRight,
  Tag,
  MessageSquare,
  BookOpen,
  Cpu,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { PublishToGitHubButton } from "./PublishToGitHubButton"
import { ApplySuggestionButton } from "./ApplySuggestionButton"
import { CodeEditorPanel } from "./CodeEditorPanel"

// Types
export type FindingSeverity = "BLOCKER" | "WARN" | "INFO"
export type FindingCategory =
  | "security"
  | "performance"
  | "best-practice"
  | "style"
  | "logic"
  | "documentation"

export interface Finding {
  id: string
  severity: FindingSeverity
  category: FindingCategory
  message: string
  description?: string
  filePath: string
  lineNumber?: number
  lineStart?: number | null
  lineEnd?: number | null
  ruleId: string
  codeSnippet?: string
  cwe?: string
  owasp?: string
  suggestion?: string
  runbook?: string
}

export interface FileAnalysis {
  path: string
  changeType: "added" | "modified" | "deleted"
  additions: number
  deletions: number
  findings: Finding[]
  language?: string
}

export interface ReportDetails {
  id: string
  repo: string
  prLabel: string
  prNumber?: number
  commitSha: string
  status: string
  createdAt: string
  completedAt?: string
  duration: string
  author: string
  branch?: string
  files: FileAnalysis[]
  summary: {
    totalFindings: number
    blocker: number
    warn: number
    info: number
    securityScore: number
    codeQuality: number
  }
  metadata?: Record<string, unknown>
}

// Colors for severity
const severityStyles = {
  BLOCKER: {
    color: "#ef4444",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: AlertTriangle,
  },
  WARN: {
    color: "#f59e0b",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: AlertCircle,
  },
  INFO: {
    color: "#3b82f6",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    icon: Info,
  },
}

// Colors for category
const categoryStyles: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  security: { color: "#ef4444", bg: "bg-red-500/10", icon: Shield },
  performance: { color: "#8b5cf6", bg: "bg-violet-500/10", icon: Zap },
  "best-practice": { color: "#3b82f6", bg: "bg-blue-500/10", icon: CheckCircle2 },
  style: { color: "#6b7280", bg: "bg-gray-500/10", icon: Layout },
  logic: { color: "#f59e0b", bg: "bg-amber-500/10", icon: Cpu },
  documentation: { color: "#10b981", bg: "bg-emerald-500/10", icon: BookOpen },
}

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return "-"
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return "-"
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// Finding Card Component
function FindingCard({
  finding,
  index,
}: {
  finding: Finding
  index: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const style = severityStyles[finding.severity]
  const catStyle = categoryStyles[finding.category] || categoryStyles["style"]
  const Icon = style.icon
  const CatIcon = catStyle.icon

  const handleCopy = () => {
    navigator.clipboard.writeText(finding.codeSnippet || finding.message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className={cn(
        "rounded-lg border bg-card/50 backdrop-blur-sm transition-all",
        "hover:bg-card/80"
      )}
      style={{ borderColor: expanded ? style.color : "rgba(255,255,255,0.06)" }}
    >
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "p-2 rounded-lg",
              style.bg
            )}
            style={{ color: style.color }}
          >
            <Icon className="h-5 w-5" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                  style.bg
                )}
                style={{ color: style.color }}
              >
                {finding.severity}
              </span>
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1",
                  catStyle.bg
                )}
                style={{ color: catStyle.color }}
              >
                <CatIcon className="h-3 w-3" />
                {finding.category}
              </span>
            </div>
            
            <p className="text-sm font-medium mt-2 line-clamp-2">
              {finding.message}
            </p>
            
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="font-mono">{finding.filePath}</span>
              {finding.lineNumber && (
                <span className="font-mono">:{finding.lineNumber}</span>
              )}
            </div>
          </div>
          
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            className="text-muted-foreground/40"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.div>
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-4">
              {finding.description && (
                <p className="text-sm text-muted-foreground">
                  {finding.description}
                </p>
              )}

              {finding.codeSnippet && (
                <div className="relative">
                  <pre className="p-3 rounded-lg bg-muted/50 overflow-x-auto text-xs font-mono">
                    <code>{finding.codeSnippet}</code>
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopy()
                    }}
                  >
                    {copied ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {finding.cwe && (
                  <Badge variant="outline" className="gap-1">
                    <Shield className="h-3 w-3" />
                    CWE-{finding.cwe}
                  </Badge>
                )}
                {finding.owasp && (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="h-3 w-3" />
                    OWASP {finding.owasp}
                  </Badge>
                )}
              </div>

              {finding.suggestion && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
                      <Lightbulb className="h-3 w-3" />
                      Suggestion
                    </div>
                    <ApplySuggestionButton findingId={finding.id} />
                  </div>
                  <p className="text-sm text-emerald-700">
                    {finding.suggestion}
                  </p>
                </div>
              )}

              {finding.runbook && (
                <Button variant="outline" size="sm" className="gap-2">
                  <BookOpen className="h-4 w-4" />
                  View Runbook
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// File Row Component
function FileRow({
  file,
  index,
}: {
  file: FileAnalysis
  index: number
}) {
  const [expanded, setExpanded] = useState(false)
  const hasFindings = file.findings.length > 0

  return (
    <div className="rounded-lg border bg-card/50 overflow-hidden">
      <div
        className="p-3 cursor-pointer flex items-center gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                file.changeType === "added" &&
                  "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
                file.changeType === "deleted" &&
                  "text-red-500 border-red-500/30 bg-red-500/10",
                file.changeType === "modified" &&
                  "text-amber-500 border-amber-500/30 bg-amber-500/10"
              )}
            >
              {file.changeType === "added"
                ? "A"
                : file.changeType === "deleted"
                ? "D"
                : "M"}
            </Badge>
            <span className="font-mono text-sm truncate">{file.path}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 text-xs">
          {hasFindings && (
            <Badge variant="secondary" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {file.findings.length}
            </Badge>
          )}
          <span className="text-emerald-500">+{file.additions}</span>
          <span className="text-red-500">-{file.deletions}</span>
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            className="text-muted-foreground/40"
          >
            <ChevronRight className="h-4 w-4" />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="border-t border-border/50"
          >
            <div className="p-3 space-y-2">
              {file.findings.map((finding, i) => (
                <FindingCard key={finding.id} finding={finding} index={i} />
              ))}
              {file.findings.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No issues found in this file
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Main Report Detail Component
export function EnhancedReportDetail({ analysisId }: { analysisId?: string }) {
  const params = useParams()
  const id = analysisId || (Array.isArray(params.id) ? params.id[0] : params.id)

  const [report, setReport] = useState<ReportDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const [selectedFileForEditor, setSelectedFileForEditor] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState<string>("")

  // Fetch real analysis data from API
  useEffect(() => {
    if (!id) return

    setLoading(true)
    setError(null)

    fetch(`/api/dashboard/analyses/${id}`)
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `HTTP ${response.status}`)
        }
        return response.json()
      })
      .then((data) => {
        // Transform the backend data to match our component's expected format
        setReport({
          id: data.id,
          repo: data.repo,
          prLabel: data.prLabel || "Commit",
          prNumber: data.prNumber,
          commitSha: data.commitSha || "unknown",
          status: data.status || "completed",
          createdAt: data.createdAt,
          completedAt: data.updatedAt,
          duration: "N/A", // Backend doesn't provide duration
          author: data.author || "Unknown",
          branch: data.prNumber ? `PR #${data.prNumber}` : "main",
          files: data.files?.map((file: any) => ({
            path: file.pathNew,
            changeType: file.changeType,
            additions: file.additionsCount,
            deletions: file.deletionsCount,
            language: "unknown", // Backend doesn't provide language per file
            findings: data.findings?.filter((finding: any) => finding.filePath === file.pathNew) || [],
          })) || [],
          summary: {
            totalFindings: data.findings?.length || 0,
            blocker: data.findings?.filter((f: any) => f.severity === "BLOCKER").length || 0,
            warn: data.findings?.filter((f: any) => f.severity === "WARN").length || 0,
            info: data.findings?.filter((f: any) => f.severity === "INFO").length || 0,
            securityScore: 75, // Placeholder
            codeQuality: 80, // Placeholder
          },
        })
      })
      .catch((err) => {
        console.error("Failed to fetch analysis:", err)
        setError(err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [id])

  const handleExportPdf = async () => {
    if (!report) return
    const tid = toast.loading("Génération du PDF…")
    try {
      const allFindings = report.files.flatMap((f) => f.findings)
      await generateAnalysisPdf({
        id: report.id,
        repo: report.repo,
        prLabel: report.prLabel,
        commitSha: report.commitSha,
        author: report.author,
        status: report.status,
        createdAt: report.createdAt,
        durationLabel: report.duration,
        blockerCount: report.summary.blocker,
        warnCount: report.summary.warn,
        infoCount: report.summary.info,
        score: Math.max(
          0,
          100 - report.summary.blocker * 10 - report.summary.warn * 3 - report.summary.info
        ),
        findings: allFindings.map((f) => ({
          severity: f.severity,
          category: f.category,
          message: f.message,
          filePath: f.filePath,
          lineStart: f.lineStart ?? f.lineNumber,
          suggestion: f.suggestion,
        })),
        files: report.files.map((f) => ({
          path: f.path,
          changeType: f.changeType,
          additions: f.additions,
          deletions: f.deletions,
          findingsCount: f.findings.length,
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

  const stats = useMemo(() => {
    if (!report) return null

    const filesWithFindings = report.files.filter((f) => f.findings.length > 0)
    const totalFindings = report.files.reduce(
      (sum, f) => sum + f.findings.length,
      0
    )

    return {
      filesAnalyzed: report.files.length,
      filesWithFindings: filesWithFindings.length,
      totalFindings,
      blocker: report.summary.blocker,
      warn: report.summary.warn,
      info: report.summary.info,
      securityScore: report.summary.securityScore,
      codeQuality: report.summary.codeQuality,
      languages: [...new Set(report.files.map((f) => f.language).filter(Boolean))],
    }
  }, [report])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-lg font-medium">Failed to load analysis</p>
        <p className="text-sm text-muted-foreground mt-2">{error}</p>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-lg font-medium">Analysis not found</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="outline" className="gap-1">
              <GitPullRequest className="h-3 w-3" />
              {report.prLabel}
            </Badge>
            <Badge variant="outline" className="gap-1 font-mono">
              <GitCommit className="h-3 w-3" />
              {report.commitSha?.slice(0, 7)}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Completed
            </Badge>
          </div>
          <h1 className="text-2xl font-bold">{report.repo}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyzed {formatTimeAgo(report.createdAt)} · {report.duration}
          </p>
        </div>

        <div className="flex gap-2">
          <PublishToGitHubButton
            analysisId={id as string}
            repo={report.repo}
            prNumber={report.prNumber}
            variant="outline"
            size="sm"
          />
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Re-run
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      {stats && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs">Security Score</span>
              </div>
              <div className="text-3xl font-bold">{stats.securityScore}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileCode className="h-4 w-4" />
                <span className="text-xs">Files</span>
              </div>
              <div className="text-3xl font-bold">{stats.filesAnalyzed}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs">Findings</span>
              </div>
              <div className="text-3xl font-bold">{stats.totalFindings}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Code2 className="h-4 w-4" />
                <span className="text-xs">Quality</span>
              </div>
              <div className="text-3xl font-bold">{stats.codeQuality}</div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="findings">Findings ({stats?.totalFindings || 0})</TabsTrigger>
          <TabsTrigger value="files">Files ({report.files.length})</TabsTrigger>
          <TabsTrigger value="editor">Code Editor</TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Finding Summary */}
          {stats && (
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-red-500/30 bg-red-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-red-500 mb-2">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-semibold">Blockers</span>
                  </div>
                  <div className="text-3xl font-bold text-red-500">{stats.blocker}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Must fix before merge
                  </p>
                </CardContent>
              </Card>

              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-amber-500 mb-2">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-semibold">Warnings</span>
                  </div>
                  <div className="text-3xl font-bold text-amber-500">{stats.warn}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Should address
                  </p>
                </CardContent>
              </Card>

              <Card className="border-blue-500/30 bg-blue-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-blue-500 mb-2">
                    <Info className="h-5 w-5" />
                    <span className="font-semibold">Info</span>
                  </div>
                  <div className="text-3xl font-bold text-blue-500">{stats.info}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Suggestions
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Severity Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Finding Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {report.files.map((file) =>
                  file.findings.map((finding) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      index={0}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="space-y-2">
          <ScrollArea className="h-[600px]">
            {report.files.map((file, index) => (
              <FileRow key={file.path} file={file} index={index} />
            ))}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="findings" className="space-y-2">
          <ScrollArea className="h-[600px]">
            {report.files
              .flatMap((f) => f.findings)
              .map((finding, index) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  index={index}
                />
              ))}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="editor" className="space-y-4">
          {selectedFileForEditor ? (
            <CodeEditorPanel
              filePath={selectedFileForEditor}
              initialContent={editorContent}
              findings={
                report.files
                  .find((f) => f.path === selectedFileForEditor)
                  ?.findings.map((f) => ({
                    id: f.id,
                    line_start: f.lineStart,
                    line_end: f.lineEnd,
                    severity: f.severity,
                    message: f.message,
                    rule_id: f.ruleId,
                    category: f.category,
                  })) || []
              }
              onSave={async (content) => {
                // TODO: Implement save functionality (commit to GitHub)
                console.log("Saving content:", content)
              }}
              onContentChange={(content) => {
                setEditorContent(content)
              }}
            />
          ) : (
            <Card>
              <CardContent className="p-8">
                <div className="text-center space-y-4">
                  <Code2 className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Sélectionnez un fichier</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      Choisissez un fichier ci-dessous pour le modifier dans l'éditeur
                    </p>
                  </div>
                  <ScrollArea className="h-[400px] rounded-lg border border-border">
                    <div className="p-4 space-y-2">
                      {report.files.map((file) => (
                        <Button
                          key={file.path}
                          variant="outline"
                          className="w-full justify-start gap-2 h-auto py-3"
                          onClick={async () => {
                            setSelectedFileForEditor(file.path)
                            setActiveTab("editor")
                            
                            // Fetch file content from GitHub
                            try {
                              const response = await fetch(
                                `/api/dashboard/files/content?repo=${encodeURIComponent(
                                  report.repo
                                )}&path=${encodeURIComponent(file.path)}&branch=${encodeURIComponent(
                                  report.branch
                                )}`
                              )
                              if (response.ok) {
                                const data = await response.json()
                                setEditorContent(data.content || "// Unable to fetch file content")
                              } else {
                                setEditorContent("// Error fetching file content")
                              }
                            } catch (error) {
                              console.error("Error fetching file:", error)
                              setEditorContent("// Error fetching file content")
                            }
                          }}
                        >
                          <FileCode className="h-4 w-4" />
                          <div className="flex-1 text-left">
                            <div className="font-medium">{file.path}</div>
                            <div className="text-xs text-muted-foreground">
                              {file.findings.length} finding{file.findings.length !== 1 ? "s" : ""}
                            </div>
                          </div>
                          {file.findings.length > 0 && (
                            <Badge variant="destructive" className="ml-auto">
                              {file.findings.length}
                            </Badge>
                          )}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="changes">
          <Card>
            <CardContent className="p-8 text-center">
              <Code2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                Full diff view coming soon
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}