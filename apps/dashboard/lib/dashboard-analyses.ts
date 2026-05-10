export interface DashboardAnalysisItem {
  id: string
  projectId: string | null
  repo: string
  prLabel: string
  commitSha: string | null
  author: string
  status: string
  createdAt: string
  updatedAt: string
  durationLabel: string
  blockerCount: number
  warnCount: number
  infoCount: number
}

type DashboardAnalysesResponse = {
  items?: DashboardAnalysisItem[]
}

const ANALYSES_CACHE_TTL_MS = 8_000
const ANALYSES_DEFAULT_SIZE = 40
const ANALYSES_MIN_SIZE = 10
const ANALYSES_MAX_SIZE = 100

const analysesCacheValueBySize = new Map<number, DashboardAnalysisItem[]>()
const analysesCacheExpiresAtBySize = new Map<number, number>()
const analysesInFlightBySize = new Map<number, Promise<DashboardAnalysisItem[]>>()

function normalizeSize(rawSize: number | undefined): number {
  if (typeof rawSize !== "number" || !Number.isFinite(rawSize)) {
    return ANALYSES_DEFAULT_SIZE
  }
  const value = Math.floor(rawSize)
  return Math.max(ANALYSES_MIN_SIZE, Math.min(ANALYSES_MAX_SIZE, value))
}

function normalizeAnalysesPayload(payload: DashboardAnalysesResponse | null | undefined): DashboardAnalysisItem[] {
  if (!payload || !Array.isArray(payload.items)) {
    return []
  }
  return payload.items
    .filter((item) => item && typeof item.id === "string" && typeof item.repo === "string")
    .map((item) => ({
      id: item.id,
      projectId: typeof item.projectId === "string" ? item.projectId : null,
      repo: item.repo,
      prLabel: typeof item.prLabel === "string" ? item.prLabel : "Commit",
      commitSha: typeof item.commitSha === "string" ? item.commitSha : null,
      author: typeof item.author === "string" ? item.author : "Unknown",
      status: typeof item.status === "string" ? item.status : "QUEUED",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
      durationLabel: typeof item.durationLabel === "string" ? item.durationLabel : "-",
      blockerCount: typeof item.blockerCount === "number" ? item.blockerCount : 0,
      warnCount: typeof item.warnCount === "number" ? item.warnCount : 0,
      infoCount: typeof item.infoCount === "number" ? item.infoCount : 0,
    }))
}

export function hasActiveDashboardAnalysis(items: DashboardAnalysisItem[]): boolean {
  return items.some((item) => {
    const normalized = item.status.trim().toUpperCase()
    return normalized === "RECEIVED" || normalized === "QUEUED" || normalized === "RUNNING"
  })
}

function removeAnalysisFromCaches(analysisId: string): void {
  for (const [size, items] of analysesCacheValueBySize.entries()) {
    analysesCacheValueBySize.set(
      size,
      items.filter((item) => item.id !== analysisId),
    )
    analysesCacheExpiresAtBySize.set(size, Date.now() + ANALYSES_CACHE_TTL_MS)
  }
}

export async function fetchDashboardAnalyses(options?: { force?: boolean; size?: number }): Promise<DashboardAnalysisItem[]> {
  const force = options?.force === true
  const size = normalizeSize(options?.size)
  const now = Date.now()
  const cachedValue = analysesCacheValueBySize.get(size) ?? null
  const cacheExpiresAt = analysesCacheExpiresAtBySize.get(size) ?? 0
  if (!force && cachedValue && now < cacheExpiresAt) {
    return cachedValue
  }
  const inFlight = analysesInFlightBySize.get(size) ?? null
  if (!force && inFlight) {
    return inFlight
  }

  const request = (async (): Promise<DashboardAnalysisItem[]> => {
    try {
      const response = await fetch(`/api/dashboard/analyses?size=${encodeURIComponent(String(size))}`, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      if (!response.ok) {
        analysesCacheValueBySize.set(size, [])
        analysesCacheExpiresAtBySize.set(size, Date.now() + ANALYSES_CACHE_TTL_MS)
        return []
      }
      const payload = (await response.json()) as DashboardAnalysesResponse
      const normalized = normalizeAnalysesPayload(payload)
      analysesCacheValueBySize.set(size, normalized)
      analysesCacheExpiresAtBySize.set(size, Date.now() + ANALYSES_CACHE_TTL_MS)
      return normalized
    } catch {
      analysesCacheValueBySize.set(size, [])
      analysesCacheExpiresAtBySize.set(size, Date.now() + ANALYSES_CACHE_TTL_MS)
      return []
    } finally {
      analysesInFlightBySize.delete(size)
    }
  })()

  analysesInFlightBySize.set(size, request)
  return request
}

export async function deleteDashboardAnalysis(analysisId: string): Promise<void> {
  const normalizedId = analysisId.trim()
  if (!normalizedId) {
    throw new Error("Invalid analysis id")
  }

  const response = await fetch(`/api/dashboard/analyses/${encodeURIComponent(normalizedId)}`, {
    method: "DELETE",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" && payload.error.trim().length > 0
        ? payload.error
        : "Suppression de l'analyse impossible.",
    )
  }

  removeAnalysisFromCaches(normalizedId)
}
