// lib/history-comparison.ts
import { useState, useEffect, useCallback } from 'react'

export interface ComparisonRun {
  id: string
  date: string
  blockers: number
  warnings: number
  info: number
}

export interface ComparisonData {
  previousRun: ComparisonRun
  currentRun: ComparisonRun
}

export interface IssueChange {
  id: string
  title: string
  severity: string
  category: string
  file: string
}

export interface SeverityChange {
  id: string
  title: string
  previousSeverity: string
  newSeverity: string
  file: string
}

export interface HistoryComparisonData {
  comparison: ComparisonData
  resolvedIssues: IssueChange[]
  newIssues: IssueChange[]
  severityChanges: SeverityChange[]
}

// Fetch history comparison data for a specific analysis ID
export async function fetchHistoryComparison(id: string): Promise<HistoryComparisonData> {
  try {
    // Try backend API first
    const response = await fetch(`/api/history/${id}`)
    if (response.ok) {
      return await response.json()
    }

    // Fallback: compute from analyses endpoint
    const analysesResponse = await fetch('/api/dashboard/analyses')
    if (analysesResponse.ok) {
      const analyses = await analysesResponse.json()
      // Find current and previous analysis
      const currentAnalysis = analyses.find((a: any) => a.id === id)
      if (!currentAnalysis) {
        throw new Error('Analysis not found')
      }

      // Find previous analysis (assuming sorted by date desc)
      const sortedAnalyses = analyses.sort((a: any, b: any) =>
        new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()
      )
      const currentIndex = sortedAnalyses.findIndex((a: any) => a.id === id)
      const previousAnalysis = currentIndex > 0 ? sortedAnalyses[currentIndex + 1] : null

      if (!previousAnalysis) {
        // Return empty comparison if no previous
        return {
          comparison: {
            previousRun: {
              id: 'none',
              date: new Date().toISOString(),
              blockers: 0,
              warnings: 0,
              info: 0,
            },
            currentRun: {
              id: currentAnalysis.id,
              date: currentAnalysis.createdAt || currentAnalysis.date,
              blockers: currentAnalysis.blockerCount || 0,
              warnings: currentAnalysis.warnCount || 0,
              info: currentAnalysis.infoCount || 0,
            },
          },
          resolvedIssues: [],
          newIssues: [],
          severityChanges: [],
        }
      }

      // Compute differences
      const resolvedIssues: IssueChange[] = []
      const newIssues: IssueChange[] = []
      const severityChanges: SeverityChange[] = []

      // This is a simplified computation - in reality, we'd need to compare issue lists
      // For now, return empty arrays as we don't have detailed issue data

      return {
        comparison: {
          previousRun: {
            id: previousAnalysis.id,
            date: previousAnalysis.createdAt || previousAnalysis.date,
            blockers: previousAnalysis.blockerCount || 0,
            warnings: previousAnalysis.warnCount || 0,
            info: previousAnalysis.infoCount || 0,
          },
          currentRun: {
            id: currentAnalysis.id,
            date: currentAnalysis.createdAt || currentAnalysis.date,
            blockers: currentAnalysis.blockerCount || 0,
            warnings: currentAnalysis.warnCount || 0,
            info: currentAnalysis.infoCount || 0,
          },
        },
        resolvedIssues,
        newIssues,
        severityChanges,
      }
    }

    throw new Error('Failed to fetch data')
  } catch (error) {
    throw new Error('Unable to load history comparison data')
  }
}

// Polling hook for history comparison
export function useHistoryComparison(id: string) {
  const [data, setData] = useState<HistoryComparisonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await fetchHistoryComparison(id)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 20000) // 20 seconds
    return () => clearInterval(interval)
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}