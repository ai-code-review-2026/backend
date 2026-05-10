export type DashboardRole = "admin" | "tech_lead" | "developer"

export interface DashboardPrSummary {
  analysisId: string
  repo: string
  prNumber: number | null
  commitSha: string | null
  status: string
  summary: string
  createdAt: string
  authorLabel: string | null
}

export interface DashboardRepoOverview {
  repoId: string
  summary: string
  highlights: string[]
  indexedCommit?: string | null
  updatedAt?: string | null
  source: string
  fallbackUsed: boolean
}

export interface DashboardInsightsResponse {
  role: DashboardRole
  prSummaries: DashboardPrSummary[]
  repoOverviews: DashboardRepoOverview[]
  warnings: string[]
  generatedAt: string
}

const INSIGHTS_CACHE_TTL_MS = 10_000

let cachedInsights: DashboardInsightsResponse | null = null
let cachedAtMs = 0
let inFlightInsightsPromise: Promise<DashboardInsightsResponse> | null = null

export function emptyDashboardInsights(role: DashboardRole = "developer"): DashboardInsightsResponse {
  return {
    role,
    prSummaries: [],
    repoOverviews: [],
    warnings: [],
    generatedAt: new Date(0).toISOString(),
  }
}

function normalizeInsightsPayload(payload: Partial<DashboardInsightsResponse> | null | undefined): DashboardInsightsResponse {
  if (!payload || typeof payload !== "object") {
    return emptyDashboardInsights()
  }
  return {
    role:
      payload.role === "admin" || payload.role === "tech_lead" || payload.role === "developer"
        ? payload.role
        : "developer",
    prSummaries: Array.isArray(payload.prSummaries) ? payload.prSummaries : [],
    repoOverviews: Array.isArray(payload.repoOverviews) ? payload.repoOverviews : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings.filter((item): item is string => typeof item === "string") : [],
    generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : new Date().toISOString(),
  }
}

async function requestDashboardInsights(): Promise<DashboardInsightsResponse> {
  try {
    const response = await fetch("/api/dashboard/insights", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
    if (!response.ok) {
      return emptyDashboardInsights()
    }
    const payload = (await response.json()) as Partial<DashboardInsightsResponse>
    return normalizeInsightsPayload(payload)
  } catch {
    return emptyDashboardInsights()
  }
}

export async function fetchDashboardInsights(options?: { force?: boolean }): Promise<DashboardInsightsResponse> {
  const force = options?.force === true
  const now = Date.now()

  if (!force && cachedInsights && now - cachedAtMs < INSIGHTS_CACHE_TTL_MS) {
    return cachedInsights
  }

  if (!force && inFlightInsightsPromise) {
    return inFlightInsightsPromise
  }

  inFlightInsightsPromise = requestDashboardInsights()
    .then((payload) => {
      cachedInsights = payload
      cachedAtMs = Date.now()
      return payload
    })
    .finally(() => {
      inFlightInsightsPromise = null
    })

  return inFlightInsightsPromise
}
