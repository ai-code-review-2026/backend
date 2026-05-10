"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { motion } from "motion/react"
import {
  Clock,
  AlertCircle,
  CheckCircle,
  Users,
  TrendingUp,
  Calendar,
  AlertTriangle,
  ChevronRight,
  Shield,
  UserPlus,
  GitPullRequest,
  BarChart3,
  Settings,
  Crown,
  Star,
  Zap,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider"
import { isAdmin, type AppRole } from "@/lib/roles"
import {
  fetchReviewerDashboardData,
  createReviewerDashboardPoller,
  defaultReviewerDashboardData,
  type ReviewerDashboardData,
} from "@/lib/reviewer-dashboard"

// Role-specific capabilities (simplified to admin, reviewer, developer)
const ROLE_CAPABILITIES = {
  tech_lead: {
    canApprove: true,
    canBlock: true,
    canAssign: true,
    canDelegate: true,
    canAccessTeamAnalytics: true,
    canCreateTemplates: true,
    canEscalate: false,
    label: "Tech Lead",
    description: "Peut approuver, bloquer, assigner et accéder aux analytics",
    color: "from-purple-500 to-pink-500",
    icon: Shield,
  },
  admin: {
    canApprove: true,
    canBlock: true,
    canAssign: true,
    canDelegate: true,
    canAccessTeamAnalytics: true,
    canCreateTemplates: true,
    canEscalate: false,
    label: "Admin",
    description: "Accès complet: gestion d'équipe, assignations, templates et analytics",
    color: "from-amber-500 to-orange-500",
    icon: Crown,
  },
  developer: {
    canApprove: false,
    canBlock: false,
    canAssign: false,
    canDelegate: false,
    canAccessTeamAnalytics: false,
    canCreateTemplates: false,
    canEscalate: true,
    label: "Developer",
    description: "Peut soumettre du code et consulter les reviews",
    color: "from-blue-500 to-cyan-500",
    icon: Star,
  },
}

function getRoleCapabilities(role: AppRole) {
  if (role === "admin") {
    return ROLE_CAPABILITIES.admin
  }
  if (role === "tech_lead") {
    return ROLE_CAPABILITIES.tech_lead
  }
  return ROLE_CAPABILITIES.developer
}

export function ReviewerDashboard() {
  const currentUser = useDashboardUser()
  const [dashboardData, setDashboardData] = useState<ReviewerDashboardData>(defaultReviewerDashboardData)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  const pollerRef = useRef<ReturnType<typeof createReviewerDashboardPoller> | null>(null)

  const capabilities = getRoleCapabilities(currentUser.role)
  const isLead = isAdmin(currentUser.role) || currentUser.role === "tech_lead"
  const RoleIcon = capabilities.icon

  // Fetch data on mount and setup polling
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const data = await fetchReviewerDashboardData({ force: true })
        setDashboardData(data)
      } catch (error) {
        console.error("[ReviewerDashboard] Error loading data:", error)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
    
    // Setup polling for real-time updates
    pollerRef.current = createReviewerDashboardPoller((data) => {
      setDashboardData(data)
    }, { intervalMs: 20000 }) // Poll every 20 seconds
    
    pollerRef.current.start()
    
    return () => {
      pollerRef.current?.stop()
    }
  }, [])

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const data = await fetchReviewerDashboardData({ force: true })
      setDashboardData(data)
    } catch (error) {
      console.error("[ReviewerDashboard] Error refreshing:", error)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  const { kpis, activeReviews, recentActivity, teamStats, teamMembers, unassignedReviews } = dashboardData

  return (
    <div className="space-y-6">
      {/* Loading Overlay */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <span className="ml-3 text-muted-foreground">Chargement du tableau de bord...</span>
        </div>
      )}
      
      {/* Error State */}
      {!loading && dashboardData.error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="text-red-700 dark:text-red-300">{dashboardData.error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Réessayer</span>
            </Button>
          </CardContent>
        </Card>
      )}
      
      {!loading && (
        <>
          {/* Role Banner */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative overflow-hidden rounded-xl bg-gradient-to-r ${capabilities.color} p-6 text-white`}
          >
            <div className="absolute right-0 top-0 opacity-10">
              <RoleIcon className="h-32 w-32 -mr-8 -mt-8" />
            </div>
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="absolute top-4 right-4 p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors disabled:opacity-50"
              title="Rafraîchir"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <RoleIcon className="h-6 w-6" />
                <h2 className="text-xl font-bold">{capabilities.label}</h2>
              </div>
              <p className="text-white/80 text-sm max-w-xl">{capabilities.description}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {capabilities.canApprove && (
                  <Badge variant="secondary" className="bg-white/20 text-white border-none">
                    <CheckCircle className="h-3 w-3 mr-1" /> Approuver
                  </Badge>
                )}
                {capabilities.canBlock && (
                  <Badge variant="secondary" className="bg-white/20 text-white border-none">
                    <Shield className="h-3 w-3 mr-1" /> Bloquer
                  </Badge>
                )}
                {capabilities.canAssign && (
                  <Badge variant="secondary" className="bg-white/20 text-white border-none">
                    <UserPlus className="h-3 w-3 mr-1" /> Assigner
                  </Badge>
                )}
                {capabilities.canDelegate && (
              <Badge variant="secondary" className="bg-white/20 text-white border-none">
                <Users className="h-3 w-3 mr-1" /> Deleguer
              </Badge>
            )}
            {capabilities.canEscalate && (
              <Badge variant="secondary" className="bg-white/20 text-white border-none">
                <Zap className="h-3 w-3 mr-1" /> Escalader
              </Badge>
            )}
          </div>
        </div>
      </motion.div>

      {/* KPIs Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">En attente</p>
                  <p className="text-2xl font-bold">{kpis.pending_reviews}</p>
                </div>
                {kpis.overdue_reviews > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {kpis.overdue_reviews} en retard
                  </Badge>
                )}
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
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-[color:var(--orange)]" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">En cours</p>
                  <p className="text-2xl font-bold">{kpis.in_progress_reviews}</p>
                </div>
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
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Cette semaine</p>
                  <p className="text-2xl font-bold">{kpis.completed_this_week}</p>
                </div>
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
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Temps moyen</p>
                  <p className="text-2xl font-bold">{kpis.avg_review_time_minutes}m</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Conformite SLA</p>
                  <p className="text-2xl font-bold">{Math.round(kpis.sla_compliance_rate * 100)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-center">
                <Link href="/dashboard/lead/queue">
                  <Button size="sm" className="w-full">
                    Voir la file
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Lead-only: Team Management Section */}
      {isLead && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-[color:var(--orange)]" />
                Gestion d&apos;équipe
              </CardTitle>
              <CardDescription>
                Superviser l'equipe et gerer les assignations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 bg-card-inner rounded-lg">
                  <p className="text-2xl font-bold text-[color:var(--orange)]">{teamStats.totalReviewers}</p>
                  <p className="text-sm text-muted-foreground">Team members</p>
                </div>
                <div className="text-center p-4 bg-card-inner rounded-lg">
                  <p className="text-2xl font-bold text-[color:var(--green-status)]">{teamStats.activeReviewers}</p>
                  <p className="text-sm text-muted-foreground">Actifs</p>
                </div>
                <div className="text-center p-4 bg-card-inner rounded-lg">
                  <p className="text-2xl font-bold text-teal-400">{teamStats.pendingAssignments}</p>
                  <p className="text-sm text-muted-foreground">A assigner</p>
                </div>
                <div className="text-center p-4 bg-card-inner rounded-lg">
                  <p className="text-2xl font-bold text-foreground">{Math.round(teamStats.teamCompletionRate * 100)}%</p>
                  <p className="text-sm text-muted-foreground">Taux completion</p>
                </div>
              </div>

              {/* Unassigned Reviews */}
              {unassignedReviews.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-[color:var(--orange)]" />
                    Reviews non assignees ({unassignedReviews.length})
                  </h4>
                  <div className="space-y-2">
                    {unassignedReviews.map((review) => (
                      <div
                        key={review.id}
                        className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{review.repo}</p>
                            <p className="text-sm text-muted-foreground">{review.pr_label} - En attente depuis {review.waiting_since}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={review.priority === "high" ? "destructive" : "secondary"}>
                            {review.priority}
                          </Badge>
                          <Button size="sm" variant="outline">
                            <UserPlus className="h-4 w-4 mr-1" />
                            Assigner
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Team Members */}
              <div>
                <h4 className="font-medium mb-2">Membres de l&apos;équipe</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white text-sm font-bold">
                          {member.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <p className="font-medium">{member.name}</p>
                          <Badge variant="outline" className="text-xs">
                            {member.role === "admin" ? "Admin" : member.role === "tech_lead" || member.role === "reviewer" ? "Tech Lead" : "Developer"}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">
                          <span className="text-[color:var(--orange)] font-medium">{member.pendingReviews}</span> en attente
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.completedThisWeek} cette semaine
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Link href="/dashboard/lead/team-analytics">
                  <Button variant="outline" size="sm">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Analytics equipe
                  </Button>
                </Link>
                <Link href="/dashboard/lead/templates">
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Gerer templates
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Reviews */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Reviews actives</span>
                <Badge variant="outline">{activeReviews.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeReviews.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p>Aucune review active</p>
                  <p className="text-sm">Excellent travail!</p>
                </div>
              ) : (
                activeReviews.map((review) => {
                  const timeElapsed = Math.floor(
                    (new Date().getTime() - new Date(review.started_at).getTime()) / (1000 * 60)
                  )
                  const timeUntilDue = Math.floor(
                    (new Date(review.due_at).getTime() - new Date().getTime()) / (1000 * 60 * 60)
                  )
                  const isUrgent = timeUntilDue < 2

                  return (
                    <div
                      key={review.id}
                      className={`p-4 border rounded-lg ${isUrgent ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : "border-gray-200 dark:border-gray-800"}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <Link
                            href={`/dashboard/review/${review.analysis.id}`}
                            className="font-medium hover:underline"
                          >
                            {review.analysis.repo}
                          </Link>
                          <p className="text-sm text-muted-foreground">
                            {review.analysis.pr_label} par {review.analysis.author}
                          </p>
                          <div className="flex items-center space-x-2 mt-2">
                            <Badge
                              variant={review.priority === "high" ? "destructive" : review.priority === "medium" ? "default" : "secondary"}
                            >
                              {review.priority}
                            </Badge>
                            {isUrgent && (
                              <Badge variant="destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Due dans {timeUntilDue}h
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <p>{timeElapsed}m ecoule</p>
                          <div className="flex gap-2 mt-2">
                            <Link href={`/dashboard/review/${review.analysis.id}`}>
                              <Button size="sm" variant="outline">
                                Reprendre
                              </Button>
                            </Link>
                            {capabilities.canBlock && (
                              <Button size="sm" variant="destructive">
                                Bloquer
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <Link href="/dashboard/lead/my-reviews">
                <Button variant="outline" size="sm" className="w-full">
                  Voir toutes mes reviews
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Activity & Quick Actions */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="space-y-4">
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="h-5 w-5" />
                  <span>Activite recente</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${
                      activity.type === "completed" ? "bg-green-500" :
                      activity.type === "comment" ? "bg-blue-500" : "bg-orange-500"
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm">
                        <span className="font-medium capitalize">
                          {activity.type === "completed" ? "Termine" : 
                           activity.type === "comment" ? "Commentaire" : "Assigne"}
                        </span> review pour{" "}
                        <span className="font-medium">{activity.repo}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions rapides</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href="/dashboard/lead/queue">
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Clock className="h-4 w-4 mr-2" />
                    File d&apos;attente
                  </Button>
                </Link>
                <Link href="/dashboard/lead/queue?tab=available">
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Users className="h-4 w-4 mr-2" />
                    Reviews disponibles
                  </Button>
                </Link>
                <Link href="/dashboard/lead/analytics">
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Mes analytics
                  </Button>
                </Link>
                {isLead && (
                  <>
                    <Link href="/dashboard/lead/team-analytics">
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Analytics equipe
                      </Button>
                    </Link>
                    <Link href="/dashboard/lead/templates">
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <Settings className="h-4 w-4 mr-2" />
                        Templates de review
                      </Button>
                    </Link>
                  </>
                )}
                {capabilities.canEscalate && (
                  <Button variant="outline" size="sm" className="w-full justify-start text-[color:var(--orange)] border-amber-200 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30">
                    <Zap className="h-4 w-4 mr-2" />
                    Escalader une review
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Role-specific capabilities card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RoleIcon className="h-5 w-5" />
                  Vos permissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className={`flex items-center gap-2 ${capabilities.canApprove ? "text-[color:var(--green-status)]" : "text-muted-foreground"}`}>
                    <CheckCircle className="h-4 w-4" />
                    Approuver
                  </div>
                  <div className={`flex items-center gap-2 ${capabilities.canBlock ? "text-[color:var(--green-status)]" : "text-muted-foreground"}`}>
                    <Shield className="h-4 w-4" />
                    Bloquer
                  </div>
                  <div className={`flex items-center gap-2 ${capabilities.canAssign ? "text-[color:var(--green-status)]" : "text-muted-foreground"}`}>
                    <UserPlus className="h-4 w-4" />
                    Assigner
                  </div>
                  <div className={`flex items-center gap-2 ${capabilities.canDelegate ? "text-[color:var(--green-status)]" : "text-muted-foreground"}`}>
                    <Users className="h-4 w-4" />
                    Deleguer
                  </div>
                  <div className={`flex items-center gap-2 ${capabilities.canAccessTeamAnalytics ? "text-[color:var(--green-status)]" : "text-muted-foreground"}`}>
                    <BarChart3 className="h-4 w-4" />
                    Analytics equipe
                  </div>
                  <div className={`flex items-center gap-2 ${capabilities.canCreateTemplates ? "text-[color:var(--green-status)]" : "text-muted-foreground"}`}>
                    <Settings className="h-4 w-4" />
                    Creer templates
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </div>
        </>
      )}
    </div>
  )
}
