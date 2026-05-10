/**
 * Dashboard Statistics Library
 * 
 * Provides functions to fetch and compute dashboard statistics from real API data.
 * Used by DashboardContent and other dashboard components.
 */

import { fetchDashboardAnalyses, type DashboardAnalysisItem } from "./dashboard-analyses"
import { normalizeDashboardRunStatus as normalizeStatus } from "./domain/analysis-status"
import { createPoller } from "./polling"

// ============================================================================
// Types
// ============================================================================

export interface DashboardMetrics {
  averageScore: number
  criticalErrors: number
  warnings: number
  completedAnalyses: number
  totalAnalyses: number
  trends: {
    scoreTrend: string
    scoreTrendUp: boolean
    errorsTrend: string
    errorsTrendUp: boolean
    warningsTrend: string
    warningsTrendUp: boolean
    completionTrend: string
    completionTrendUp: boolean
  }
}

export interface WeeklyActivityData {
  day: string
  issues: number
  resolved: number
}

export interface SeverityDistribution {
  name: string
  value: number
  color: string
}

export interface PRData {
  id: string
  repo: string
  branch: string
  commit: string
  status: "completed" | "failed" | "running"
  score: number
  errors: number
  warnings: number
  files: number
  additions: number
  deletions: number
  author: string
  authorInitials: string
  prNumber: string
  duration: string
  tags: string[]
  aiSummary: string
  aiInsights: string[]
}

export interface DashboardStatistics {
  metrics: DashboardMetrics
  weeklyActivity: WeeklyActivityData[]
  severityDistribution: SeverityDistribution[]
  prData: PRData[]
  isLoading: boolean
  error: string | null
}

// ============================================================================
// Utility Functions
// ============================================================================

function getInitials(name: string): string {
  if (!name || name === "Unknown") return "??"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function inferTags(repo: string, prLabel: string): string[] {
  const tags: string[] = []
  const repoLower = repo.toLowerCase()
  const prLower = prLabel.toLowerCase()
  
  if (repoLower.includes("feature") || prLower.includes("feature")) tags.push("feature")
  if (repoLower.includes("fix") || prLower.includes("fix")) tags.push("fix")
  if (repoLower.includes("refactor")) tags.push("refactor")
  if (repoLower.includes("test")) tags.push("test")
  if (repoLower.includes("security") || repoLower.includes("auth")) tags.push("security")
  if (repoLower.includes("db") || repoLower.includes("database")) tags.push("database")
  if (repoLower.includes("api")) tags.push("api")
  
  return tags.length > 0 ? tags : ["code"]
}

function generateAISummary(item: DashboardAnalysisItem): string {
  const status = normalizeStatus(item.status)
  const hasBlockers = item.blockerCount > 0
  const hasWarnings = item.warnCount > 0
  
  if (status === "running") {
    return "Analyse en cours..."
  }
  
  if (status === "failed") {
    return `Analyse échouée. ${hasBlockers ? `${item.blockerCount} erreur(s) critique(s) détectée(s).` : "Vérifiez les logs pour plus de détails."}`
  }
  
  if (hasBlockers) {
    return `Analyse terminée avec ${item.blockerCount} problème(s) critique(s) à corriger avant merge.`
  }
  
  if (hasWarnings) {
    return `Analyse terminée avec ${item.warnCount} avertissement(s). Code globalement conforme aux standards.`
  }
  
  return "Analyse terminée. Code conforme aux standards de qualité."
}

function generateAIInsights(item: DashboardAnalysisItem): string[] {
  const insights: string[] = []
  const status = normalizeStatus(item.status)
  
  if (status === "running") {
    return []
  }
  
  if (item.blockerCount > 0) {
    insights.push(`❌ ${item.blockerCount} erreur(s) critique(s) détectée(s)`)
  }
  
  if (item.warnCount > 0) {
    insights.push(`⚠️ ${item.warnCount} avertissement(s) à examiner`)
  }
  
  if (item.infoCount > 0) {
    insights.push(`ℹ️ ${item.infoCount} suggestion(s) d'amélioration`)
  }
  
  if (item.blockerCount === 0 && item.warnCount === 0) {
    insights.push("✅ Aucune erreur critique détectée")
    insights.push("✅ Code conforme aux bonnes pratiques")
  }
  
  if (item.blockerCount === 0 && item.warnCount > 0 && item.warnCount < 5) {
    insights.push("💡 Quelques améliorations mineures suggérées")
  }
  
  return insights
}

function calculateScore(item: DashboardAnalysisItem): number {
  const status = normalizeStatus(item.status)
  
  if (status === "running") return 0
  if (status === "failed") return Math.max(0, 40 - item.blockerCount * 10)
  
  // Score calculation based on issues
  let score = 100
  score -= item.blockerCount * 15 // -15 per blocker
  score -= item.warnCount * 2     // -2 per warning
  score -= item.infoCount * 0.5   // -0.5 per info
  
  return Math.max(0, Math.min(100, Math.round(score)))
}

// ============================================================================
// Data Transformation
// ============================================================================

export function transformAnalysesToPRData(analyses: DashboardAnalysisItem[]): PRData[] {
  return analyses.map((item) => {
    const status = normalizeStatus(item.status)
    const score = calculateScore(item)
    
    return {
      id: item.id,
      repo: item.repo,
      branch: item.prLabel.includes("PR") ? `pr-${item.prLabel.replace(/[^0-9]/g, "")}` : "main",
      commit: item.commitSha?.slice(0, 8) ?? "unknown",
      status,
      score,
      errors: item.blockerCount,
      warnings: item.warnCount,
      files: Math.max(1, item.blockerCount + item.warnCount + item.infoCount), // Estimate
      additions: 0, // Not available from API
      deletions: 0, // Not available from API
      author: item.author,
      authorInitials: getInitials(item.author),
      prNumber: item.prLabel,
      duration: item.durationLabel,
      tags: inferTags(item.repo, item.prLabel),
      aiSummary: generateAISummary(item),
      aiInsights: generateAIInsights(item),
    }
  })
}

export function computeMetrics(analyses: DashboardAnalysisItem[]): DashboardMetrics {
  if (analyses.length === 0) {
    return {
      averageScore: 0,
      criticalErrors: 0,
      warnings: 0,
      completedAnalyses: 0,
      totalAnalyses: 0,
      trends: {
        scoreTrend: "—",
        scoreTrendUp: true,
        errorsTrend: "—",
        errorsTrendUp: true,
        warningsTrend: "—",
        warningsTrendUp: true,
        completionTrend: "—",
        completionTrendUp: true,
      },
    }
  }
  
  const completedAnalyses = analyses.filter(
    (a) => normalizeStatus(a.status) === "completed"
  )
  
  const scores = completedAnalyses.map(calculateScore).filter((s) => s > 0)
  const averageScore = scores.length > 0 
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0
  
  const criticalErrors = analyses.reduce((sum, a) => sum + a.blockerCount, 0)
  const warnings = analyses.reduce((sum, a) => sum + a.warnCount, 0)
  
  // Calculate trends (compare first half vs second half of data)
  const midpoint = Math.floor(analyses.length / 2)
  const recentAnalyses = analyses.slice(0, midpoint)
  const olderAnalyses = analyses.slice(midpoint)
  
  const recentScores = recentAnalyses
    .filter((a) => normalizeStatus(a.status) === "completed")
    .map(calculateScore)
    .filter((s) => s > 0)
  const olderScores = olderAnalyses
    .filter((a) => normalizeStatus(a.status) === "completed")
    .map(calculateScore)
    .filter((s) => s > 0)
  
  const recentAvgScore = recentScores.length > 0 
    ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length 
    : 0
  const olderAvgScore = olderScores.length > 0 
    ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length 
    : 0
  const scoreDiff = recentAvgScore - olderAvgScore
  
  const recentErrors = recentAnalyses.reduce((sum, a) => sum + a.blockerCount, 0)
  const olderErrors = olderAnalyses.reduce((sum, a) => sum + a.blockerCount, 0)
  const errorsDiff = recentErrors - olderErrors
  
  const recentWarnings = recentAnalyses.reduce((sum, a) => sum + a.warnCount, 0)
  const olderWarnings = olderAnalyses.reduce((sum, a) => sum + a.warnCount, 0)
  const warningsDiff = recentWarnings - olderWarnings
  
  const completionRate = analyses.length > 0 
    ? Math.round((completedAnalyses.length / analyses.length) * 100)
    : 0
  
  return {
    averageScore,
    criticalErrors,
    warnings,
    completedAnalyses: completedAnalyses.length,
    totalAnalyses: analyses.length,
    trends: {
      scoreTrend: scoreDiff > 0 ? `+${Math.round(scoreDiff)}%` : scoreDiff < 0 ? `${Math.round(scoreDiff)}%` : "—",
      scoreTrendUp: scoreDiff >= 0,
      errorsTrend: errorsDiff !== 0 ? (errorsDiff > 0 ? `+${errorsDiff}` : `${errorsDiff}`) : "—",
      errorsTrendUp: errorsDiff <= 0, // Less errors is good
      warningsTrend: warningsDiff !== 0 ? (warningsDiff > 0 ? `+${warningsDiff}` : `${warningsDiff}`) : "—",
      warningsTrendUp: warningsDiff <= 0, // Less warnings is good
      completionTrend: `${completionRate}%`,
      completionTrendUp: completionRate >= 80,
    },
  }
}

export function computeWeeklyActivity(analyses: DashboardAnalysisItem[]): WeeklyActivityData[] {
  const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
  const dayMap = new Map<string, { issues: number; resolved: number }>()
  
  // Initialize all days
  days.forEach((day) => dayMap.set(day, { issues: 0, resolved: 0 }))
  
  // Count issues by day of week
  analyses.forEach((item) => {
    if (!item.createdAt) return
    
    const date = new Date(item.createdAt)
    const dayIndex = (date.getDay() + 6) % 7 // Convert Sunday=0 to Monday=0
    const dayName = days[dayIndex]
    
    const current = dayMap.get(dayName)!
    current.issues += item.blockerCount + item.warnCount
    
    if (normalizeStatus(item.status) === "completed") {
      current.resolved += item.blockerCount + item.warnCount
    }
  })
  
  return days.map((day) => ({
    day,
    ...dayMap.get(day)!,
  }))
}

export function computeSeverityDistribution(analyses: DashboardAnalysisItem[]): SeverityDistribution[] {
  const totals = analyses.reduce(
    (acc, item) => {
      acc.critical += item.blockerCount
      acc.high += Math.floor(item.warnCount * 0.3) // Estimate high priority from warnings
      acc.medium += Math.floor(item.warnCount * 0.7)
      acc.low += item.infoCount
      return acc
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  )
  
  return [
    { name: "Critique", value: totals.critical, color: "#ef4444" },
    { name: "Élevé", value: totals.high, color: "#f97316" },
    { name: "Moyen", value: totals.medium, color: "#eab308" },
    { name: "Faible", value: totals.low, color: "#22c55e" },
  ]
}

// ============================================================================
// Main Fetch Function
// ============================================================================

export async function fetchDashboardStatistics(options?: { 
  force?: boolean 
  size?: number 
}): Promise<DashboardStatistics> {
  try {
    const analyses = await fetchDashboardAnalyses({
      force: options?.force,
      size: options?.size ?? 40,
    })
    
    const prData = transformAnalysesToPRData(analyses)
    const metrics = computeMetrics(analyses)
    const weeklyActivity = computeWeeklyActivity(analyses)
    const severityDistribution = computeSeverityDistribution(analyses)
    
    return {
      metrics,
      weeklyActivity,
      severityDistribution,
      prData,
      isLoading: false,
      error: null,
    }
  } catch (error) {
    console.error("[dashboard-statistics] Error fetching statistics:", error)
    return {
      metrics: {
        averageScore: 0,
        criticalErrors: 0,
        warnings: 0,
        completedAnalyses: 0,
        totalAnalyses: 0,
        trends: {
          scoreTrend: "—",
          scoreTrendUp: true,
          errorsTrend: "—",
          errorsTrendUp: true,
          warningsTrend: "—",
          warningsTrendUp: true,
          completionTrend: "—",
          completionTrendUp: true,
        },
      },
      weeklyActivity: [],
      severityDistribution: [],
      prData: [],
      isLoading: false,
      error: error instanceof Error ? error.message : "Erreur lors du chargement des statistiques",
    }
  }
}

// ============================================================================
// Hook for Real-time Updates
// ============================================================================

const POLL_INTERVAL_MS = 10_000 // 10 seconds

export function createDashboardStatisticsPoller(
  onUpdate: (stats: DashboardStatistics) => void,
  options?: { intervalMs?: number }
) {
  return createPoller(
    async () => {
      const stats = await fetchDashboardStatistics({ force: true })
      onUpdate(stats)
    },
    {
      intervalMs: options?.intervalMs ?? POLL_INTERVAL_MS,
      onError: (error) => {
        console.error("[dashboard-statistics-poller] Poll error:", error)
      },
    },
  )
}
