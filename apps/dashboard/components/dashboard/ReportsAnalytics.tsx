"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"
import {
  BarChart3,
  LineChart,
  PieChart,
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Shield,
  AlertTriangle,
  Filter,
  Calendar,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  MousePointer2,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface AnalyticsData {
  totalAnalyses: number
  completedAnalyses: number
  failedAnalyses: number
  runningAnalyses: number
  avgDuration: string
  avgScore: number
  trend: "up" | "down" | "stable"
  trendPercentage: number
  dailyData: { date: string; completed: number; failed: number }[]
  categoryBreakdown: { category: string; count: number; color: string }[]
  severityBreakdown: { severity: string; count: number; color: string }[]
  languageBreakdown: { language: string; count: number }[]
}

// Mock data generator
function generateMockData(): AnalyticsData {
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (13 - i))
    return {
      date: date.toISOString().split("T")[0],
      completed: Math.floor(Math.random() * 20) + 5,
      failed: Math.floor(Math.random() * 3),
    }
  })

  return {
    totalAnalyses: 234,
    completedAnalyses: 198,
    failedAnalyses: 12,
    runningAnalyses: 24,
    avgDuration: "2m 34s",
    avgScore: 78,
    trend: "up",
    trendPercentage: 12.5,
    dailyData: days,
    categoryBreakdown: [
      { category: "Security", count: 45, color: "#ef4444" },
      { category: "Performance", count: 32, color: "#8b5cf6" },
      { category: "Best Practice", count: 68, color: "#3b82f6" },
      { category: "Style", count: 42, color: "#6b7280" },
      { category: "Documentation", count: 18, color: "#10b981" },
    ],
    severityBreakdown: [
      { severity: "Blocker", count: 12, color: "#ef4444" },
      { severity: "Warning", count: 45, color: "#f59e0b" },
      { severity: "Info", count: 89, color: "#3b82f6" },
    ],
    languageBreakdown: [
      { language: "TypeScript", count: 89 },
      { language: "Python", count: 45 },
      { language: "Go", count: 32 },
      { language: "Rust", count: 18 },
      { language: "Other", count: 14 },
    ],
  }
}

// Simple Bar Chart Component
function BarChart({
  data,
  height = 200,
}: {
  data: { label: string; value: number; color: string }[]
  height?: number
}) {
  const maxValue = Math.max(...data.map((d) => d.value))

  return (
    <div className="flex items-end justify-between gap-1" style={{ height }}>
      {data.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{ height: 0 }}
          animate={{ height: `${(item.value / maxValue) * 100}%` }}
          transition={{ duration: 0.6, delay: index * 0.05 }}
          className="flex-1 rounded-t-md relative group"
          style={{ background: item.color }}
        >
          <div
            className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity
                   bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap"
          >
            {item.label}: {item.value}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// Line Chart Component
function LineChartComponent({
  data,
  height = 200,
}: {
  data: { date: string; completed: number; failed: number }[]
  height?: number
}) {
  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.completed, d.failed))
  )

  const completedPath = useMemo(() => {
    return data
      .map((d, i) => {
        const x = (i / (data.length - 1)) * 100
        const y = 100 - (d.completed / maxValue) * 100
        return `${i === 0 ? "M" : "L"} ${x} ${y}`
      })
      .join(" ")
  }, [data, maxValue])

  return (
    <div className="relative" style={{ height }}>
      {/* Grid lines */}
      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-full h-px bg-border/30"
          />
        ))}
      </div>

      {/* Line */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        <motion.path
          d={completedPath}
          fill="none"
          stroke="url(#completedGradient)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
        <defs>
          <linearGradient id="completedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
      </svg>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        {data.length > 0 && (
          <>
            <span>{data[0].date.slice(5)}</span>
            <span>{data[Math.floor(data.length / 2)].date.slice(5)}</span>
            <span>{data[data.length - 1].date.slice(5)}</span>
          </>
        )}
      </div>
    </div>
  )
}

// Donut Chart Component
function DonutChart({
  data,
  size = 160,
}: {
  data: { label: string; value: number; color: string }[]
  size?: number
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  let cumulative = 0

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        {data.map((item, index) => {
          const startAngle = (cumulative / total) * 360
          const endAngle = ((cumulative + item.value) / total) * 360
          cumulative += item.value

          const startRad = (startAngle * Math.PI) / 180
          const endRad = (endAngle * Math.PI) / 180

          const x1 = 50 + 40 * Math.cos(startRad)
          const y1 = 50 + 40 * Math.sin(startRad)
          const x2 = 50 + 40 * Math.cos(endRad)
          const y2 = 50 + 40 * Math.sin(endRad)

          const largeArc = item.value / total > 0.5 ? 1 : 0

          return (
            <motion.path
              key={item.label}
              d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={item.color}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.1, type: "spring" }}
              className="cursor-pointer hover:opacity-80 transition-opacity"
            />
          )
        })}
        <circle
          cx="50"
          cy="50"
          r="28"
          className="fill-background"
        />
      </svg>

      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span className="text-2xl font-bold">{total}</span>
          <br />
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
      </div>
    </div>
  )
}

// Gauge Component
function GaugeChart({
  value,
  max = 100,
  label,
  color = "#10b981",
}: {
  value: number
  max?: number
  label: string
  color?: string
}) {
  const percentage = (value / max) * 100
  const angle = (percentage / 100) * 180

  return (
    <div className="relative w-32 h-16 overflow-hidden">
      {/* Background arc */}
      <div className="absolute w-32 h-32 rounded-full border-[12px] border-muted/20" />

      {/* Progress arc */}
      <motion.div
        className="absolute w-32 h-32 rounded-full border-[12px] border-transparent"
        style={{
          borderTopColor: color,
          borderRightColor: percentage > 25 ? color : "transparent",
          borderBottomColor: percentage > 50 ? color : "transparent",
          borderLeftColor: percentage > 75 ? color : "transparent",
          transform: "rotate(-45deg)",
        }}
        initial={{ rotate: -225 }}
        animate={{ rotate: -45 + (percentage / 100) * 180 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />

      {/* Value */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
        <span className="text-2xl font-bold" style={{ color }}>
          {value}
        </span>
        <span className="text-xs text-muted-foreground ml-1">%</span>
        <br />
        <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
      </div>
    </div>
  )
}

// Main Analytics Component
export function ReportsAnalytics() {
  const data = useMemo(() => generateMockData(), [])

  const dailyChartData = useMemo(() => {
    return data.dailyData.map((d) => ({
      label: d.date.slice(5),
      value: d.completed,
      color: "#10b981",
    }))
  }, [data])

  const categoryChartData = useMemo(() => {
    return data.categoryBreakdown.map((d) => ({
      label: d.category,
      value: d.count,
      color: d.color,
    }))
  }, [data])

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-card border"
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Total Analyses</span>
          </div>
          <div className="text-2xl font-bold">{data.totalAnalyses}</div>
          <div className="flex items-center gap-1 text-xs text-emerald-500 mt-1">
            <ArrowUpRight className="h-3 w-3" />
            {data.trendPercentage}% from last week
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-4 rounded-xl bg-card border"
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">Completed</span>
          </div>
          <div className="text-2xl font-bold text-emerald-500">{data.completedAnalyses}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {Math.round((data.completedAnalyses / data.totalAnalyses) * 100)}% success rate
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-4 rounded-xl bg-card border"
        >
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Running</span>
          </div>
          <div className="text-2xl font-bold text-blue-500">{data.runningAnalyses}</div>
          <div className="text-xs text-muted-foreground mt-1">In progress</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-4 rounded-xl bg-card border"
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Avg Duration</span>
          </div>
          <div className="text-2xl font-bold">{data.avgDuration}</div>
          <div className="text-xs text-muted-foreground mt-1">Per analysis</div>
        </motion.div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Analysis Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LineChartComponent data={data.dailyData} height={220} />
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              Findings by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <DonutChart data={categoryChartData} size={140} />
              <div className="flex-1 space-y-2">
                {data.categoryBreakdown.map((item) => (
                  <div
                    key={item.category}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: item.color }}
                      />
                      <span className="text-xs">{item.category}</span>
                    </div>
                    <span className="text-xs font-mono">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Severity & Languages */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Severity Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Severity Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.severityBreakdown.map((item, index) => (
                <div key={item.severity} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ background: item.color }}
                      />
                      <span>{item.severity}</span>
                    </div>
                    <span className="font-mono font-bold" style={{ color: item.color }}>
                      {item.count}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/20 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(item.count / data.severityBreakdown[0].count) * 100}%`,
                      }}
                      transition={{ delay: index * 0.1, duration: 0.8 }}
                      className="h-full rounded-full"
                      style={{ background: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Languages */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Code2Icon className="h-5 w-5 text-primary" />
              Most Analyzed Languages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.languageBreakdown.map((item, index) => (
                <motion.div
                  key={item.language}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm font-medium">{item.language}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 rounded-full bg-muted/20 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${(item.count / data.languageBreakdown[0].count) * 100}%`,
                        }}
                        transition={{ delay: index * 0.1 + 0.2, duration: 0.5 }}
                        className="h-full rounded-full bg-primary/60"
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                      {item.count}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Bar */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-lg font-bold">{data.avgScore}%</div>
                  <div className="text-xs text-muted-foreground">Avg Score</div>
                </div>
              </div>
              <div className="w-px h-8 bg-border/50" />
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-emerald-500" />
                <div>
                  <div className="text-lg font-bold">{data.trendPercentage}%</div>
                  <div className="text-xs text-muted-foreground">Improvement</div>
                </div>
              </div>
              <div className="w-px h-8 bg-border/50" />
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                <div>
                  <div className="text-lg font-bold">{data.avgDuration}</div>
                  <div className="text-xs text-muted-foreground">Avg Time</div>
                </div>
              </div>
            </div>

            <Badge variant="outline" className="gap-1">
              {data.trend === "up" ? (
                <TrendingUp className="h-3 w-3 text-emerald-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
              {data.trend === "up" ? "+" : "-"}
              {data.trendPercentage}% this week
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Missing icon
function Code2Icon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}