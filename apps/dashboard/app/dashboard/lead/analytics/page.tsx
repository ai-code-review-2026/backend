"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import {
  TrendingUp, TrendingDown, Clock, CheckCircle, AlertTriangle, Target,
  Award, MessageCircle, FileEdit, Calendar, Shield, Star, Crown
} from "lucide-react"
import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider"
import { motion } from "framer-motion"

interface PersonalMetrics {
  reviewer_id: string
  period: {
    start: string
    end: string
    days: number
  }
  current_period: {
    reviews_completed: number
    avg_review_time_minutes: number
    avg_comments_per_review: number
    sla_compliance_rate: number
    approvals: number
    warnings: number
    blocks: number
    findings_identified?: number
  }
  trends: {
    dates: string[]
    reviews_completed: number[]
    avg_review_time: number[]
    sla_compliance: number[]
    avg_comments: number[]
  } | []
  rankings: {
    reviews_count: number
    quality_score: number
    response_time: number
  }
}

const EMPTY_METRICS: PersonalMetrics = {
  reviewer_id: "",
  period: {
    start: new Date().toISOString(),
    end: new Date().toISOString(),
    days: 30,
  },
  current_period: {
    reviews_completed: 0,
    avg_review_time_minutes: 0,
    avg_comments_per_review: 0,
    sla_compliance_rate: 0,
    approvals: 0,
    warnings: 0,
    blocks: 0,
    findings_identified: 0,
  },
  trends: {
    dates: [],
    reviews_completed: [],
    avg_review_time: [],
    sla_compliance: [],
    avg_comments: [],
  },
  rankings: {
    reviews_count: 0,
    quality_score: 0,
    response_time: 0,
  },
}

export default function ReviewerAnalyticsPage() {
  const currentUser = useDashboardUser()
  const [metrics, setMetrics] = useState<PersonalMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState("30")
  const [error, setError] = useState<string | null>(null)

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/dashboard/reviewer/metrics?period_days=${period}`)
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        setMetrics({
          ...EMPTY_METRICS,
          reviewer_id: currentUser.userId ?? "",
          period: {
            ...EMPTY_METRICS.period,
            days: Number(period) || 30,
          },
        })
        throw new Error("Failed to fetch metrics")
      }

      setMetrics((data as PersonalMetrics) ?? EMPTY_METRICS)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  const formatTrendData = () => {
    if (!metrics) return []
    
    // Handle case where trends is an empty array or doesn't have the expected structure
    if (!metrics.trends || Array.isArray(metrics.trends) || !metrics.trends.dates || !Array.isArray(metrics.trends.dates)) {
      return []
    }

    return metrics.trends.dates.map((date, index) => ({
      date: new Date(date).toLocaleDateString("fr-FR", {
        month: "short",
        day: "numeric"
      }),
      reviews: metrics.trends.reviews_completed?.[index] || 0,
      avgTime: metrics.trends.avg_review_time?.[index] || 0,
      slaCompliance: metrics.trends.sla_compliance?.[index] || 0,
      avgComments: metrics.trends.avg_comments?.[index] || 0,
    }))
  }

  const decisionData = [
    { name: "Approvals", value: metrics?.current_period.approvals || 0, color: "#10b981" },
    { name: "Warnings", value: metrics?.current_period.warnings || 0, color: "#f59e0b" },
    { name: "Blocks", value: metrics?.current_period.blocks || 0, color: "#ef4444" },
  ]

  const getSLAStatus = (rate: number) => {
    if (rate >= 0.95) return { label: "Excellent", color: "bg-green-500", icon: TrendingUp }
    if (rate >= 0.90) return { label: "Good", color: "bg-blue-500", icon: CheckCircle }
    if (rate >= 0.80) return { label: "Average", color: "bg-yellow-500", icon: AlertTriangle }
    return { label: "Needs Improvement", color: "bg-red-500", icon: TrendingDown }
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 rounded"></div>
          <div className="h-10 w-32 bg-gray-200 rounded"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-gray-200 rounded-lg"></div>
          <div className="h-96 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    )
  }

  if (error && !metrics) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
              <div>
                <h3 className="font-semibold text-lg">Error Loading Metrics</h3>
                <p className="text-sm text-muted-foreground mt-2">{error}</p>
              </div>
              <Button onClick={fetchMetrics} variant="outline">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!metrics) {
    return null
  }

  const slaStatus = getSLAStatus(metrics.current_period.sla_compliance_rate)

  // Role-based badge (simplified roles)
  const getRoleBadge = () => {
    if (currentUser.role === "developer") {
      return (
        <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-none">
          <Star className="h-3 w-3 mr-1" />
          Developer
        </Badge>
      )
    }
    if (currentUser.role === "tech_lead") {
      return (
        <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-none">
          <Shield className="h-3 w-3 mr-1" />
          Tech Lead
        </Badge>
      )
    }
    if (currentUser.role === "admin") {
      return (
        <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-none">
          <Crown className="h-3 w-3 mr-1" />
          Admin
        </Badge>
      )
    }
    return null
  }

  // Role-specific insights (simplified)
  const getRoleSpecificInsight = () => {
    if (currentUser.role === "developer") {
      return (
        <Card className="border-teal-500/30 bg-teal-500/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Star className="h-5 w-5 text-teal-400 mt-0.5" />
              <div>
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  Developer Analytics
                </h4>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Track your code submissions and review feedback. Focus on reducing review iterations 
                  by following code quality guidelines.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }
    if (currentUser.role === "tech_lead") {
      const blockRate = metrics.current_period.blocks > 0 
        ? ((metrics.current_period.blocks / metrics.current_period.reviews_completed) * 100).toFixed(1)
        : "0.0"
      return (
        <Card className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-purple-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-1">
                  Tech Lead Impact
                </h4>
                <p className="text-sm text-purple-800 dark:text-purple-200">
                  You&apos;ve blocked {blockRate}% of PRs this period, demonstrating strong code quality enforcement. 
                  Your block decisions protect the codebase from {metrics.current_period.blocks * 3} potential issues.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }
    if (currentUser.role === "admin") {
      return (
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Crown className="h-5 w-5 text-[color:var(--orange)] mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                  Leadership Impact
                </h4>
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Your reviews set the quality standard for the team. Access team analytics to track 
                  overall performance and identify coaching opportunities.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header with Role Badge */}
      <motion.div 
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="card-heading text-foreground">My Analytics</h1>
            {getRoleBadge()}
          </div>
          <p className="text-muted-foreground mt-1">
            Performance metrics for the last {metrics.period.days} days
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 6 months</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={fetchMetrics} variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Role-specific insight card */}
      {getRoleSpecificInsight()}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Reviews Completed</p>
                <div className="flex items-center mt-2">
                  <span className="text-2xl font-bold">
                    {metrics.current_period.reviews_completed}
                  </span>
                  {metrics.rankings.reviews_count > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      #{metrics.rankings.reviews_count}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="h-12 w-12 bg-teal-500/15 rounded-full flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-teal-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Review Time</p>
                <div className="flex items-center mt-2">
                  <span className="text-2xl font-bold">
                    {formatMinutes(metrics.current_period.avg_review_time_minutes)}
                  </span>
                  {metrics.rankings.response_time > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      #{metrics.rankings.response_time}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">SLA Compliance</p>
                <div className="flex items-center mt-2">
                  <span className="text-2xl font-bold">
                    {Math.round(metrics.current_period.sla_compliance_rate * 100)}%
                  </span>
                  <Badge className={`ml-2 text-white ${slaStatus.color}`}>
                    {slaStatus.label}
                  </Badge>
                </div>
              </div>
              <div className="h-12 w-12 bg-[color:var(--green-status)]/15 rounded-full flex items-center justify-center">
                <Target className="h-6 w-6 text-[color:var(--green-status)]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Comments Per Review</p>
                <div className="flex items-center mt-2">
                  <span className="text-2xl font-bold">
                    {metrics.current_period.avg_comments_per_review.toFixed(1)}
                  </span>
                  {metrics.rankings.quality_score > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      #{metrics.rankings.quality_score}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="h-12 w-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                <MessageCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Reviews Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-teal-400" />
              Review Activity Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={formatTrendData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="reviews"
                  stroke="var(--orange)"
                  fill="var(--orange)"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Decision Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Award className="h-5 w-5 mr-2 text-[color:var(--green-status)]" />
              Review Decisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={decisionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {decisionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Performance Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Review Time Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="h-5 w-5 mr-2 text-purple-600" />
              Review Time Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={formatTrendData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => [formatMinutes(value as number), "Avg Time"]} />
                <Line
                  type="monotone"
                  dataKey="avgTime"
                  stroke="var(--teal)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* SLA Compliance Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Target className="h-5 w-5 mr-2 text-[color:var(--green-status)]" />
              SLA Compliance Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={formatTrendData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip formatter={(value) => [`${value}%`, "SLA Compliance"]} />
                <Area
                  type="monotone"
                  dataKey="slaCompliance"
                  stroke="var(--green-status)"
                  fill="var(--green-status)"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileEdit className="h-5 w-5 mr-2 text-indigo-600 dark:text-indigo-400" />
            Detailed Performance Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-[color:var(--green-status)]">
                {metrics.current_period.approvals}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Approvals</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[color:var(--orange)] dark:text-yellow-400">
                {metrics.current_period.warnings}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Warnings</div>
            </div>
            {/* Only show blocks for Reviewers and Admins */}
            {(currentUser.role === "tech_lead" || currentUser.role === "admin") && (
              <div className="text-center">
                <div className="text-2xl font-bold text-destructive">
                  {metrics.current_period.blocks}
                </div>
                <div className="text-sm text-muted-foreground mt-1">Blocks</div>
                <Badge variant="outline" className="mt-1 text-xs">
                  Lead+
                </Badge>
              </div>
            )}
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {metrics.current_period.findings_identified || 0}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Findings Identified</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
