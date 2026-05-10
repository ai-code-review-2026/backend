"use client"
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Activity, Download, RotateCw, AlertCircle, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { extractApiErrorMessage, formatDisplayValue } from "@/lib/display"

type ObservabilityLog = {
  id: string
  timestamp?: string | null
  level: "info" | "warn" | "error" | string
  message: string
  details: string
}

type QueueJob = {
  analysisId: string
  repo: string
  prNumber?: number | null
  status: string
  createdAt?: string | null
}

type ObservabilityPayload = {
  metrics?: {
    failureRatePct?: number
    avgLatencySec?: number
    analysesToday?: number
    activeWorkers?: number
    totalWorkers?: number
    queuedJobs?: number
    runningJobs?: number
  }
  issues?: Array<{
    id: string
    title: string
    detail: string
    severity: "info" | "warn" | "error" | string
  }>
  logs?: {
    api?: ObservabilityLog[]
    workers?: ObservabilityLog[]
    ingestion?: ObservabilityLog[]
  }
  queue?: QueueJob[]
  generatedAt?: string
  error?: string
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "-"
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString("fr-FR")
}

function downloadTextFile(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function Observability() {
  const [activeTab, setActiveTab] = useState("api")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [payload, setPayload] = useState<ObservabilityPayload | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null)

  const loadObservability = async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setMessage(null)
    try {
      const response = await fetch("/api/dashboard/admin/observability", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      const data = (await response.json().catch(() => ({}))) as ObservabilityPayload
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(data, "Impossible de charger l'observabilite."))
      }
      setPayload(data)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de charger l'observabilite.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadObservability(false)
  }, [])

  const metrics = payload?.metrics ?? {}
  const issues = Array.isArray(payload?.issues) ? payload!.issues! : []
  const apiLogs = Array.isArray(payload?.logs?.api) ? payload!.logs!.api! : []
  const workerLogs = Array.isArray(payload?.logs?.workers) ? payload!.logs!.workers! : []
  const ingestionLogs = Array.isArray(payload?.logs?.ingestion) ? payload!.logs!.ingestion! : []
  const queueJobs = Array.isArray(payload?.queue) ? payload!.queue! : []

  const metricsCards = [
    {
      label: "Taux d'echec",
      value: Number(metrics.failureRatePct ?? 0),
      unit: "%",
      gradient: "from-red-500 to-orange-500",
      max: 100,
    },
    {
      label: "Latence moyenne",
      value: Number(metrics.avgLatencySec ?? 0),
      unit: "s",
      gradient: "from-blue-500 to-cyan-500",
      max: 10,
    },
    {
      label: "Analyses aujourd'hui",
      value: Number(metrics.analysesToday ?? 0),
      unit: "",
      gradient: "from-green-500 to-emerald-500",
      max: Math.max(Number(metrics.analysesToday ?? 0) + 20, 20),
    },
    {
      label: "Workers actifs",
      value: `${Number(metrics.activeWorkers ?? 0)}/${Number(metrics.totalWorkers ?? 0)}`,
      unit: "",
      gradient: "from-purple-500 to-pink-500",
      max: 100,
    },
  ]

  const exportLogs = () => {
    const sections = [
      ["API", apiLogs],
      ["WORKERS", workerLogs],
      ["INGESTION", ingestionLogs],
    ] as const
    const text = sections
      .map(([title, logs]) => {
        const lines = logs.map(
          (log) => `[${formatTimestamp(log.timestamp)}] [${formatDisplayValue(log.level)}] ${formatDisplayValue(log.message)} | ${formatDisplayValue(log.details)}`,
        )
        return [`## ${title}`, ...lines].join("\n")
      })
      .join("\n\n")
    downloadTextFile(`observability-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`, text)
  }

  const retryJob = async (analysisId: string) => {
    setRetryingJobId(analysisId)
    setMessage(null)
    try {
      const response = await fetch(`/api/dashboard/admin/observability/jobs/${encodeURIComponent(analysisId)}/retry`, {
        method: "POST",
        headers: { Accept: "application/json" },
      })
      const data = (await response.json().catch(() => ({}))) as { taskId?: string; error?: string }
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(data, "Relance job impossible."))
      }
      setMessage(`Job ${analysisId} relance (task: ${data.taskId ?? "n/a"}).`)
      await loadObservability(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Relance job impossible.")
    } finally {
      setRetryingJobId(null)
    }
  }

  const renderLogTable = (logs: ObservabilityLog[]) => (
    <div className="overflow-hidden rounded-xl border border-gray-200/50 dark:border-gray-700/50">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 dark:bg-gray-800/50 dark:hover:bg-gray-800/50">
            <TableHead>Timestamp</TableHead>
            <TableHead>Level</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                Aucun log disponible.
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log, index) => (
              <motion.tr
                key={`${log.id}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                className="transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/50"
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {formatTimestamp(log.timestamp)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={log.level === "error" ? "destructive" : log.level === "warn" ? "secondary" : "default"}
                  >
                    {formatDisplayValue(log.level)}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {formatDisplayValue(log.message)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDisplayValue(log.details)}
                </TableCell>
              </motion.tr>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )

  return (
    <motion.div className="max-w-6xl mx-auto space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="flex justify-between items-start" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <h1 className="card-heading text-foreground mb-2 flex items-center gap-3">
            <Activity className="h-10 w-10 text-pink-500" />
            Observabilite & Logs
          </h1>
          <p className="text-muted-foreground">Supervision reelle de la plateforme</p>
        </div>
        <div className="flex gap-3">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button variant="outline" className="gap-2" onClick={exportLogs} disabled={loading}>
              <Download className="h-4 w-4" />
              Telecharger logs
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02, rotate: 180 }} whileTap={{ scale: 0.98 }}>
            <Button variant="outline" className="gap-2" onClick={() => void loadObservability(true)} disabled={refreshing}>
              <RotateCw className="h-4 w-4" />
              Actualiser
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {message && (
        <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-200 whitespace-pre-wrap break-words">
          {formatDisplayValue(message)}
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-4">
        {metricsCards.map((metric, index) => (
          <motion.div key={metric.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + index * 0.05 }} whileHover={{ y: -4, scale: 1.02 }}>
            <Card variant="glass" className="relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${metric.gradient} opacity-20 rounded-full blur-2xl`} />
              <CardContent className="pt-6 relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{metric.label}</p>
                    <p className="text-3xl font-bold text-foreground">
                      {metric.value}
                      {metric.unit}
                    </p>
                  </div>
                  <motion.div className={`p-3 rounded-xl bg-gradient-to-br ${metric.gradient}`} whileHover={{ scale: 1.1, rotate: 360 }} transition={{ duration: 0.5 }}>
                    <Activity className="h-6 w-6 text-white" />
                  </motion.div>
                </div>
                {typeof metric.value === "number" && <Progress value={(metric.value / metric.max) * 100} className="h-2" />}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 backdrop-blur-xl border-orange-200/50 dark:border-orange-800/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </motion.div>
              Problemes actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : issues.length === 0 ? (
              <p className="text-sm text-emerald-300">Aucun probleme actif detecte.</p>
            ) : (
              <div className="space-y-3">
                {issues.map((issue) => (
                  <motion.div key={issue.id} className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-gray-900/50 border border-orange-300 dark:border-orange-700" whileHover={{ x: 4 }}>
                    <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="font-semibold text-orange-900 dark:text-orange-100 mb-1">{formatDisplayValue(issue.title)}</div>
                      <div className="text-sm text-orange-800 dark:text-orange-200">{formatDisplayValue(issue.detail)}</div>
                    </div>
                    <Button variant="outline" size="sm" className="bg-white dark:bg-gray-800" onClick={() => setActiveTab("workers")}>
                      Investiguer
                    </Button>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Logs systeme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 bg-gray-100 dark:bg-gray-800">
                <TabsTrigger value="api">API / Webhooks</TabsTrigger>
                <TabsTrigger value="workers">Workers</TabsTrigger>
                <TabsTrigger value="ingestion">Ingestion KB</TabsTrigger>
              </TabsList>
              <TabsContent value="api" className="mt-4">
                {renderLogTable(apiLogs)}
              </TabsContent>
              <TabsContent value="workers" className="mt-4">
                {renderLogTable(workerLogs)}
              </TabsContent>
              <TabsContent value="ingestion" className="mt-4">
                {renderLogTable(ingestionLogs)}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>File d'attente des jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {queueJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun job en attente.</p>
              ) : (
                queueJobs.map((job) => (
                  <motion.div key={job.analysisId} className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200/50 dark:border-blue-800/50" whileHover={{ x: 4 }}>
                    <div>
                      <span className="font-semibold text-foreground">{formatDisplayValue(job.analysisId)}</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatDisplayValue(job.repo)}
                        {job.prNumber ? ` PR #${formatDisplayValue(job.prNumber)}` : ""}
                        {" • "}
                        {formatDisplayValue(job.status)}
                        {" • "}
                        {formatTimestamp(job.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{formatDisplayValue(job.status).toLowerCase()}</Badge>
                      <motion.div whileHover={{ scale: 1.05, rotate: 180 }} whileTap={{ scale: 0.95 }}>
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => void retryJob(job.analysisId)} disabled={retryingJobId === job.analysisId}>
                          <RotateCw className="h-3 w-3" />
                          Relancer
                        </Button>
                      </motion.div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
