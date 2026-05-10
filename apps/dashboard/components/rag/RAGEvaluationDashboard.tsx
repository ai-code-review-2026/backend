"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Brain,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  BarChart3,
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
} from "lucide-react"
import { EnhancedStatCard, GradientStatCard } from "@/components/statistics/EnhancedStatCard"
import { GlowingScore } from "@/components/statistics/AnimatedComponents"

interface RAGMetric {
  name: string
  value: number
  unit: string
  description: string
  threshold: number | null
  status: "good" | "warning" | "critical"
}

interface RAGEvaluation {
  repo_id: string
  evaluation_timestamp: string
  metrics: RAGMetric[]
  overall_score: number
  test_queries_count: number
  avg_latency_ms: number
  error_rate: number
  context_quality_score: number
}

interface RAGTestResult {
  query: string
  expected_context: string | null
  retrieved_context: string | null
  latency_ms: number
  success: boolean
  relevance_score: number | null
  bleu_score: number | null
  rouge_score: number | null
}

interface RAGBenchmark {
  repo_id: string
  benchmark_id: string
  test_results: RAGTestResult[]
  summary: RAGEvaluation
}

interface RAGEvaluationDashboardProps {
  repoId?: string
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "good":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-orange-500" />
    case "critical":
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <Activity className="h-4 w-4 text-gray-500" />
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "good":
      return "bg-green-100 text-green-800 border-green-200"
    case "warning":
      return "bg-orange-100 text-orange-800 border-orange-200"
    case "critical":
      return "bg-red-100 text-red-800 border-red-200"
    default:
      return "bg-gray-100 text-gray-800 border-gray-200"
  }
}

export function RAGEvaluationDashboard({ repoId: initialRepoId }: RAGEvaluationDashboardProps) {
  const [repoId, setRepoId] = useState(initialRepoId || "")
  const [evaluation, setEvaluation] = useState<RAGEvaluation | null>(null)
  const [benchmark, setBenchmark] = useState<RAGBenchmark | null>(null)
  const [loading, setLoading] = useState(false)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testQueries, setTestQueries] = useState("10")

  const runEvaluation = useCallback(async () => {
    if (!repoId.trim()) return

    try {
      setLoading(true)
      setError(null)
      const response = await fetch(
        `/api/dashboard/rag-evaluation/${encodeURIComponent(repoId)}?testQueries=${testQueries}`
      )

      if (!response.ok) {
        throw new Error(`Failed to evaluate RAG: ${response.statusText}`)
      }

      const data: RAGEvaluation = await response.json()
      setEvaluation(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [repoId, testQueries])

  const runBenchmark = useCallback(async () => {
    if (!repoId.trim()) return

    try {
      setBenchmarkLoading(true)
      setError(null)
      const response = await fetch(
        `/api/dashboard/rag-evaluation/${encodeURIComponent(repoId)}`,
        { method: "POST" }
      )

      if (!response.ok) {
        throw new Error(`Failed to run benchmark: ${response.statusText}`)
      }

      const data: RAGBenchmark = await response.json()
      setBenchmark(data)
      setEvaluation(data.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setBenchmarkLoading(false)
    }
  }, [repoId])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="card-heading text-foreground">RAG Evaluation Pro</h1>
        <p className="text-muted-foreground mt-1">
          Advanced RAG performance monitoring and benchmarking
        </p>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Configuration
          </CardTitle>
          <CardDescription>Set up your RAG evaluation parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="repoId">Repository ID</Label>
              <Input
                id="repoId"
                placeholder="e.g., my-org/my-repo"
                value={repoId}
                onChange={(e) => setRepoId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="testQueries">Test Queries</Label>
              <Select value={testQueries} onValueChange={setTestQueries}>
                <SelectTrigger>
                  <SelectValue placeholder="Select query count" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 queries (Quick)</SelectItem>
                  <SelectItem value="10">10 queries (Standard)</SelectItem>
                  <SelectItem value="15">15 queries (Thorough)</SelectItem>
                  <SelectItem value="20">20 queries (Comprehensive)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Actions</Label>
              <div className="flex gap-2">
                <Button
                  onClick={runEvaluation}
                  disabled={!repoId.trim() || loading}
                  className="gap-2"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Quick Eval
                </Button>
                <Button
                  onClick={runBenchmark}
                  disabled={!repoId.trim() || benchmarkLoading}
                  variant="outline"
                  className="gap-2"
                >
                  {benchmarkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                  Full Benchmark
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-700">{error}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {evaluation && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <GradientStatCard
                title="Overall Score"
                value={Math.round(evaluation.overall_score)}
                icon={Target}
                gradient="linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.2))"
                iconBg="rgba(34, 197, 94, 0.3)"
              />
              <EnhancedStatCard
                title="Avg Latency"
                value={Math.round(evaluation.avg_latency_ms)}
                suffix="ms"
                icon={Clock}
                description="Average response time"
              />
              <EnhancedStatCard
                title="Success Rate"
                value={Math.round((1 - evaluation.error_rate) * 100)}
                suffix="%"
                icon={CheckCircle2}
                description="Queries with valid context"
              />
              <EnhancedStatCard
                title="Context Quality"
                value={Math.round(evaluation.context_quality_score * 100)}
                suffix="%"
                icon={Brain}
                description="Relevance of retrieved context"
              />
            </div>

            {/* Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Detailed Metrics</CardTitle>
                <CardDescription>
                  Performance metrics from {evaluation.test_queries_count} test queries
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {evaluation.metrics.map((metric, index) => (
                    <motion.div
                      key={metric.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(metric.status)}
                        <div>
                          <h4 className="font-medium">{metric.name}</h4>
                          <p className="text-sm text-muted-foreground">{metric.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">
                          {metric.value.toFixed(metric.name.includes("Latency") ? 0 : 1)}
                          <span className="text-sm font-normal text-muted-foreground ml-1">
                            {metric.unit}
                          </span>
                        </div>
                        <Badge className={getStatusColor(metric.status)} variant="outline">
                          {metric.status}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Benchmark Results */}
            {benchmark && (
              <Tabs defaultValue="summary" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="queries">Query Results</TabsTrigger>
                </TabsList>

                <TabsContent value="summary">
                  <Card>
                    <CardHeader>
                      <CardTitle>Benchmark Summary</CardTitle>
                      <CardDescription>ID: {benchmark.benchmark_id}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-center">
                        <GlowingScore score={evaluation.overall_score} size={200} />
                      </div>
                      <div className="text-center space-y-1">
                        <h3 className="text-lg font-semibold">Overall Performance Score</h3>
                        <p className="text-muted-foreground">
                          Based on {benchmark.test_results.length} comprehensive test queries
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="queries">
                  <Card>
                    <CardHeader>
                      <CardTitle>Individual Query Results</CardTitle>
                      <CardDescription>Detailed analysis of each test query</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {benchmark.test_results.map((result, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="border rounded-lg p-4"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <h4 className="font-medium text-sm flex-1">{result.query}</h4>
                              <div className="flex items-center gap-2">
                                <Badge variant={result.success ? "default" : "destructive"}>
                                  {result.success ? "Success" : "Failed"}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(result.latency_ms)}ms
                                </span>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4 text-xs">
                              <div>
                                <span className="text-muted-foreground">Relevance:</span>
                                <div className="font-medium">
                                  {result.relevance_score ? `${Math.round(result.relevance_score * 100)}%` : "N/A"}
                                </div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">BLEU:</span>
                                <div className="font-medium">
                                  {result.bleu_score ? `${Math.round(result.bleu_score * 100)}%` : "N/A"}
                                </div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">ROUGE:</span>
                                <div className="font-medium">
                                  {result.rouge_score ? `${Math.round(result.rouge_score * 100)}%` : "N/A"}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}