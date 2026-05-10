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
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Activity,
  Server,
  Database,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Loader2,
  Bell,
  TrendingUp,
  Zap,
} from "lucide-react"
import { EnhancedStatCard, GradientStatCard } from "@/components/statistics/EnhancedStatCard"
import { QualityTrendChart } from "@/components/statistics/AdvancedCharts"

interface SystemMetric {
  name: string
  value: number
  unit: string
  timestamp: string
  status: "healthy" | "warning" | "critical"
}

interface ServiceHealth {
  service: string
  status: "healthy" | "warning" | "critical"
  response_time_ms?: number
  error?: string
  details?: Record<string, any>
}

interface LogEntry {
  timestamp: string
  level: string
  service: string
  message: string
  trace_id?: string
  metadata?: Record<string, any>
}

interface ObservabilityData {
  timestamp: string
  system_metrics: SystemMetric[]
  service_health: ServiceHealth[]
  alerts: Array<{
    severity: string
    title: string
    description: string
    timestamp: string
  }>
  recent_logs: LogEntry[]
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "healthy":
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
    case "healthy":
      return "bg-green-100 text-green-800 border-green-200"
    case "warning":
      return "bg-orange-100 text-orange-800 border-orange-200"
    case "critical":
      return "bg-red-100 text-red-800 border-red-200"
    default:
      return "bg-gray-100 text-gray-800 border-gray-200"
  }
}

const getMetricIcon = (metricName: string) => {
  switch (metricName.toLowerCase()) {
    case "cpu_usage":
      return Cpu
    case "memory_usage":
    case "memory_available":
      return MemoryStick
    case "disk_usage":
      return HardDrive
    default:
      return Activity
  }
}

export function ObservabilityMonitor() {
  const [data, setData] = useState<ObservabilityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch("/api/dashboard/observability")

      if (!response.ok) {
        throw new Error(`Failed to fetch observability data: ${response.statusText}`)
      }

      const observabilityData: ObservabilityData = await response.json()
      setData(observabilityData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  const handleRefresh = () => {
    setLoading(true)
    fetchData()
  }

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="p-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading system status...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="p-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <XCircle className="h-12 w-12 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={handleRefresh}>Retry</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  // Prepare chart data for system metrics over time (mock for now)
  const chartData = data.system_metrics.map((metric, index) => ({
    date: new Date(Date.now() - (data.system_metrics.length - index) * 60000).toISOString(),
    value: metric.value,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="card-heading text-foreground">System Observability</h1>
          <p className="text-muted-foreground mt-1">
            Real-time monitoring and alerting
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="gap-2"
          >
            {autoRefresh ? (
              <>
                <Activity className="h-4 w-4 text-green-500" />
                Auto Refresh
              </>
            ) : (
              <>
                <Activity className="h-4 w-4" />
                Manual
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {data.system_metrics.map((metric, index) => {
          const Icon = getMetricIcon(metric.name)
          return (
            <EnhancedStatCard
              key={metric.name}
              title={metric.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
              value={Math.round(metric.value * 100) / 100}
              suffix={metric.unit}
              icon={Icon}
              description={`Status: ${metric.status}`}
              delay={index * 0.1}
            />
          )
        })}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="h-4 w-4" />
            Alerts
            {data.alerts.length > 0 && (
              <Badge variant="destructive" className="text-xs px-1 py-0 min-w-[1rem] h-4">
                {data.alerts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            {/* System Metrics Chart */}
            <Card>
              <CardHeader>
                <CardTitle>System Metrics Trend</CardTitle>
                <CardDescription>Real-time system performance</CardDescription>
              </CardHeader>
              <CardContent>
                <QualityTrendChart data={chartData} height={300} />
              </CardContent>
            </Card>

            {/* Service Health Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Service Health</CardTitle>
                <CardDescription>Status of critical services</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.service_health.map((service, index) => (
                    <motion.div
                      key={service.service}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(service.status)}
                        <div>
                          <h4 className="font-medium capitalize">{service.service}</h4>
                          {service.response_time_ms && (
                            <p className="text-sm text-muted-foreground">
                              {Math.round(service.response_time_ms)}ms
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge className={getStatusColor(service.status)} variant="outline">
                        {service.status}
                      </Badge>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="services">
          <div className="grid gap-4">
            {data.service_health.map((service, index) => (
              <motion.div
                key={service.service}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 capitalize">
                        {service.service === "postgresql" ? <Database className="h-5 w-5" /> : <Server className="h-5 w-5" />}
                        {service.service}
                      </CardTitle>
                      <Badge className={getStatusColor(service.status)} variant="outline">
                        {service.status}
                      </Badge>
                    </div>
                    {service.response_time_ms && (
                      <CardDescription>Response time: {Math.round(service.response_time_ms)}ms</CardDescription>
                    )}
                  </CardHeader>
                  {(service.details || service.error) && (
                    <CardContent>
                      {service.error && (
                        <div className="text-sm text-destructive mb-2">
                          Error: {service.error}
                        </div>
                      )}
                      {service.details && (
                        <div className="text-sm space-y-1">
                          {Object.entries(service.details).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-muted-foreground">{key}:</span>
                              <span className="font-medium">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Active Alerts</CardTitle>
              <CardDescription>
                {data.alerts.length} alert{data.alerts.length !== 1 ? "s" : ""} requiring attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.alerts.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No active alerts</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.alerts.map((alert, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-start gap-3 p-4 border rounded-lg"
                    >
                      {alert.severity === "critical" ? (
                        <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{alert.title}</h4>
                          <Badge 
                            variant="outline" 
                            className={alert.severity === "critical" ? "border-red-200 text-red-700" : "border-orange-200 text-orange-700"}
                          >
                            {alert.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{alert.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(alert.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Recent Logs</CardTitle>
              <CardDescription>Latest system logs and events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {data.recent_logs.map((log, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-start gap-3 p-3 border rounded text-sm"
                  >
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="outline" 
                          className={
                            log.level === "ERROR" ? "border-red-200 text-red-700" :
                            log.level === "WARNING" ? "border-orange-200 text-orange-700" :
                            "border-blue-200 text-blue-700"
                          }
                        >
                          {log.level}
                        </Badge>
                        <span className="text-muted-foreground">{log.service}</span>
                        {log.trace_id && (
                          <span className="font-mono text-xs bg-muted px-1 rounded">{log.trace_id}</span>
                        )}
                      </div>
                      <p>{log.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}