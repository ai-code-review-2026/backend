export interface DashboardAnalysisFinding {
  id: string
  source: string
  filePath: string
  lineStart: number | null
  lineEnd: number | null
  severity: string
  category: string
  message: string
  suggestion: string | null
  ruleId: string | null
}

export interface DashboardDiffLine {
  lineType: "context" | "add" | "remove" | "header"
  content: string
  oldLineNo: number | null
  newLineNo: number | null
}

export interface DashboardAnalysisDiffFile {
  id: string
  pathOld: string | null
  pathNew: string
  changeType: "added" | "modified" | "deleted" | "renamed"
  isBinary: boolean
  additionsCount: number
  deletionsCount: number
  lines: DashboardDiffLine[]
}

export interface DashboardReviewDecision {
  value: "APPROVE" | "WARN" | "BLOCK"
  comment: string | null
  decidedAt: string | null
  decidedBy: string | null
}

export interface DashboardReviewContextReference {
  path: string
  source: string
  sourceType: string | null
  chunkType: string | null
  title: string | null
  score: number
  tags: string[]
  sourceUri: string | null
  page: number | null
  sectionTitle: string | null
  headingPath: string[]
  entityType: string | null
  entityName: string | null
  lineStart: number | null
  lineEnd: number | null
  domain: string | null
  documentVersion: string | null
  crawlTimestamp: string | null
}

export interface DashboardAnalysisReviewOutput {
  contextReferences: DashboardReviewContextReference[]
}

export interface DashboardRagChunkReference {
  path: string | null
  title: string | null
  source: string | null
  sourceType: string | null
  chunkType: string | null
  symbolName: string | null
  score: number | null
  tags: string[]
}

export interface DashboardAnalysisDetails {
  id: string
  repo: string
  source: string
  prNumber: number | null
  prLabel: string
  commitSha: string | null
  diffText: string
  author: string
  status: string
  summary: string
  createdAt: string
  updatedAt: string
  reviewDecision: DashboardReviewDecision | null
  reviewOutput: DashboardAnalysisReviewOutput | null
  findings: DashboardAnalysisFinding[]
  files: DashboardAnalysisDiffFile[]
  ragContext: DashboardRagChunkReference[]
  ragContextChunksCount: number
  ragRetrievalMode: string | null
}

export async function fetchDashboardAnalysisDetails(analysisId: string): Promise<DashboardAnalysisDetails | null> {
  try {
    const response = await fetch(`/api/dashboard/analyses/${analysisId}`, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
    if (!response.ok) {
      return null
    }
    const payload = (await response.json()) as DashboardAnalysisDetails
    if (!payload || typeof payload.id !== "string" || typeof payload.repo !== "string") {
      return null
    }
    return payload
  } catch {
    return null
  }
}
