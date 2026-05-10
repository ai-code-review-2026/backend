"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Users, TrendingUp, Clock, Target, AlertTriangle, Award,
  BarChart3, Activity, CheckCircle, MessageCircle, Crown,
  Zap, Shield, Calendar
} from "lucide-react"
import { MetricsChart, TrendChart, DonutChart, ProgressRing } from "@/components/reviewer/MetricsCharts"
import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider"
import { isReviewerLead } from "@/lib/roles"

interface TeamMetrics {
  period: {
    start: string
    end: string
    days: number
  }
  team_overview: {
    reviewer_count: number
    total_assigned: number
    total_completed: number
    total_declined: number
    total_comments: number
    total_change_requests: number
    avg_team_review_time: number
    avg_team_response_time: number
    total_findings: number
    total_approvals: number
    total_warnings: number
    total_blocks: number
    team_sla_rate: number
  }
  leaderboard: Array<{
    reviewer_id: string
    display_name: string
    email: string
    reviews_completed: number
    avg_review_time: number
    sla_compliance: number
    comment_count: number
  }>
  capacity_analysis: {
    total_capacity: number
    utilization_rate: number
    bottlenecks: string[]
  }
}

interface LeaderboardEntry {
  reviewer_id: string
  display_name: string
  email: string
  reviews_completed: number
  avg_review_time_minutes: number
  findings_identified: number
  approvals: number
  reviews_within_sla: number
}

export default function TeamAnalyticsPage() {
  const currentUser = useDashboardUser()
  const [teamMetrics, setTeamMetrics] = useState<TeamMetrics | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState("30")
  const [leaderboardMetric, setLeaderboardMetric] = useState("reviews_completed")
  const [error, setError] = useState<string | null>(null)

  const hasPermission = isReviewerLead(currentUser.role)

  const fetchTeamMetrics = async () => {
    if (!hasPermission) return
    
    try {
      setLoading(true)
      const [teamResponse, leaderboardResponse] = await Promise.all([
        fetch(`/api/dashboard/reviewer/team-metrics?period_days=${period}`),
        fetch(`/api/dashboard/reviewer/leaderboard?metric=${leaderboardMetric}&period_days=${period}&limit=20`)
      ])

      if (!teamResponse.ok || !leaderboardResponse.ok) {
        throw new Error("Failed to fetch team metrics")
      }

      const [teamData, leaderboardData] = await Promise.all([
        teamResponse.json(),
        leaderboardResponse.json()
      ])

      setTeamMetrics(teamData)
      setLeaderboard(leaderboardData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeamMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, leaderboardMetric, hasPermission])

  // Check permissions after hooks
  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Shield className="h-12 w-12 text-yellow-500 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg">Access Restricted</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Team analytics are only available to Tech Leads.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const getMetricIcon = (metric: string) => {
    switch (metric) {
      case "reviews_completed": return CheckCircle
      case "avg_review_time_minutes": return Clock
      case "findings_identified": return Target
      case "approvals": return Award
      default: return Activity
    }
  }

  const getLeaderboardData = () => {
    if (!teamMetrics) return []

    const chartData = [
      { name: "Approvals", value: teamMetrics.team_overview.total_approvals, color: "#10b981" },
      { name: "Warnings", value: teamMetrics.team_overview.total_warnings, color: "#f59e0b" },
      { name: "Blocks", value: teamMetrics.team_overview.total_blocks, color: "#ef4444" },
    ]

    return chartData.filter(item => item.value > 0)
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
              <div>
                <h3 className="font-semibold text-lg">Error Loading Team Metrics</h3>
                <p className="text-sm text-muted-foreground mt-2">{error}</p>
              </div>
              <Button onClick={fetchTeamMetrics} variant="outline">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!teamMetrics) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="card-heading text-foreground">Team Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Team performance overview for the last {teamMetrics.period.days} days
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
          <Button onClick={fetchTeamMetrics} variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Team Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Team Members</p>
                <p className="text-2xl font-bold mt-2">
                  {teamMetrics.team_overview.reviewer_count}
                </p>
              </div>
              <div className="h-12 w-12 bg-teal-500/15 rounded-full flex items-center justify-center">
                <Users className="h-6 w-6 text-teal-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Reviews</p>
                <p className="text-2xl font-bold mt-2">
                  {teamMetrics.team_overview.total_completed}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  +{teamMetrics.team_overview.total_assigned - teamMetrics.team_overview.total_completed} pending
                </p>
              </div>
              <div className="h-12 w-12 bg-[color:var(--green-status)]/15 rounded-full flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-[color:var(--green-status)]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Review Time</p>
                <p className="text-2xl font-bold mt-2">
                  {formatMinutes(teamMetrics.team_overview.avg_team_review_time || 0)}
                </p>
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
                <p className="text-sm font-medium text-muted-foreground">Team SLA</p>
                <p className="text-2xl font-bold mt-2">
                  {Math.round((teamMetrics.team_overview.team_sla_rate || 0) * 100)}%
                </p>
              </div>
              <div className="h-12 w-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                <Target className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="workload">Workload</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Decision Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-[color:var(--green-status)]" />
                  Review Decisions Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart
                  data={getLeaderboardData()}
                  centerLabel="Total Decisions"
                  centerValue={
                    teamMetrics.team_overview.total_approvals +
                    teamMetrics.team_overview.total_warnings +
                    teamMetrics.team_overview.total_blocks
                  }
                  height={300}
                />
              </CardContent>
            </Card>

            {/* Activity Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2 text-teal-400" />
                  Activity Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <MessageCircle className="h-5 w-5 text-teal-400 mr-3" />
                      <span className="text-sm font-medium">Comments Created</span>
                    </div>
                    <span className="text-lg font-bold">{teamMetrics.team_overview.total_comments}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <AlertTriangle className="h-5 w-5 text-[color:var(--orange)] mr-3" />
                      <span className="text-sm font-medium">Change Requests</span>
                    </div>
                    <span className="text-lg font-bold">{teamMetrics.team_overview.total_change_requests}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Target className="h-5 w-5 text-purple-600 mr-3" />
                      <span className="text-sm font-medium">Findings Identified</span>
                    </div>
                    <span className="text-lg font-bold">{teamMetrics.team_overview.total_findings}</span>
                  </div>

                  <div className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">SLA Compliance</span>
                      <span className="text-sm font-bold">
                        {Math.round((teamMetrics.team_overview.team_sla_rate || 0) * 100)}%
                      </span>
                    </div>
                    <ProgressRing
                      value={(teamMetrics.team_overview.team_sla_rate || 0) * 100}
                      max={100}
                      size={100}
                      color={
                        (teamMetrics.team_overview.team_sla_rate || 0) >= 0.95 ? "#10b981" :
                        (teamMetrics.team_overview.team_sla_rate || 0) >= 0.90 ? "#e8713a" : "#f59e0b"
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="leaderboard" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Team Leaderboard</h2>
            <Select value={leaderboardMetric} onValueChange={setLeaderboardMetric}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reviews_completed">Reviews Completed</SelectItem>
                <SelectItem value="avg_review_time_minutes">Avg Review Time</SelectItem>
                <SelectItem value="findings_identified">Findings Identified</SelectItem>
                <SelectItem value="approvals">Approvals Given</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {leaderboard.map((reviewer, index) => {
                  const Icon = getMetricIcon(leaderboardMetric)
                  const metricValue = reviewer[leaderboardMetric as keyof LeaderboardEntry]
                  const displayValue = leaderboardMetric === "avg_review_time_minutes"
                    ? formatMinutes(Number(metricValue))
                    : metricValue

                  return (
                    <div key={reviewer.reviewer_id} className="flex items-center justify-between p-4 hover:bg-muted/50">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                          {index < 3 ? (
                            <Crown className={`h-4 w-4 ${
                              index === 0 ? "text-yellow-500" :
                              index === 1 ? "text-muted-foreground" : "text-orange-600"
                            }`} />
                          ) : (
                            <span className="text-sm font-bold text-muted-foreground">#{index + 1}</span>
                          )}
                        </div>

                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {reviewer.display_name?.split(' ').map(n => n[0]).join('') || 'U'}
                          </AvatarFallback>
                        </Avatar>

                        <div>
                          <p className="font-medium">{reviewer.display_name}</p>
                          <p className="text-sm text-muted-foreground">{reviewer.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Icon className="h-4 w-4 mr-1" />
                            {leaderboardMetric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </div>
                          <div className="font-bold text-lg">{displayValue}</div>
                        </div>

                        {index < 3 && (
                          <Badge variant={index === 0 ? "default" : "secondary"}>
                            {index === 0 ? "1st" : index === 1 ? "2nd" : "3rd"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="text-2xl font-bold text-[color:var(--green-status)]">
                        {Math.round((teamMetrics.team_overview.team_sla_rate || 0) * 100)}%
                      </div>
                      <div className="text-sm text-muted-foreground">SLA Compliance</div>
                    </div>
                    <div className="text-center p-4 bg-card-inner rounded-lg">
                      <div className="text-2xl font-bold text-teal-400">
                        {formatMinutes(teamMetrics.team_overview.avg_team_response_time || 0)}
                      </div>
                      <div className="text-sm text-muted-foreground">Avg Response Time</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quality Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Comments per Review</span>
                    <span className="font-bold">
                      {teamMetrics.team_overview.total_completed > 0
                        ? (teamMetrics.team_overview.total_comments / teamMetrics.team_overview.total_completed).toFixed(1)
                        : '0'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Change Requests per Review</span>
                    <span className="font-bold">
                      {teamMetrics.team_overview.total_completed > 0
                        ? (teamMetrics.team_overview.total_change_requests / teamMetrics.team_overview.total_completed).toFixed(1)
                        : '0'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Findings per Review</span>
                    <span className="font-bold">
                      {teamMetrics.team_overview.total_completed > 0
                        ? (teamMetrics.team_overview.total_findings / teamMetrics.team_overview.total_completed).toFixed(1)
                        : '0'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="workload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Zap className="h-5 w-5 mr-2 text-[color:var(--orange)] dark:text-yellow-400" />
                Workload Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Workload analysis coming soon...</p>
                <p className="text-sm mt-2">
                  This will show capacity utilization, bottleneck detection, and workload distribution.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
