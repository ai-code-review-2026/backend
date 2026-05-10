"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Clock3, Loader2, Play, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { normalizeRepositoryId } from "@/lib/repository-links"

type ProjectDetails = {
  id: string
  name: string
  full_name: string
}

type AnalysisItem = {
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

type AnalysesResponse = {
  items?: AnalysisItem[]
}

function formatDate(value: string): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function normalizeStatus(raw: string): string {
  const normalized = raw.trim().toUpperCase()
  if (!normalized) return "QUEUED"
  return normalized
}

export default function ProjectAnalysesPage() {
  const params = useParams() as { repoId?: string | string[] }
  const router = useRouter()
  const resourceId = normalizeRepositoryId(
    Array.isArray(params.repoId) ? params.repoId[0] ?? "" : params.repoId ?? "",
  )

  const [project, setProject] = useState<ProjectDetails | null>(null)
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([])
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!resourceId) {
      setError("Project identifier is missing")
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const projectRes = await fetch(`/api/dashboard/projects/${encodeURIComponent(resourceId)}`, {
        cache: "no-store",
      })
      if (!projectRes.ok) throw new Error("Failed to load project details")
      const projectPayload = (await projectRes.json()) as ProjectDetails
      setProject({
        id: projectPayload.id,
        name: projectPayload.name,
        full_name: projectPayload.full_name,
      })

      const analysesRes = await fetch(
        `/api/dashboard/analyses?size=120&project_id=${encodeURIComponent(projectPayload.id)}&repo=${encodeURIComponent(projectPayload.full_name)}`,
        { cache: "no-store" },
      )
      if (!analysesRes.ok) {
        throw new Error("Failed to load project analyses")
      }
      const analysesPayload = (await analysesRes.json()) as AnalysesResponse
      setAnalyses(Array.isArray(analysesPayload.items) ? analysesPayload.items : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [resourceId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filtered = useMemo(() => {
    if (statusFilter === "all") return analyses
    return analyses.filter((item) => normalizeStatus(item.status) === statusFilter)
  }, [analyses, statusFilter])

  const stats = useMemo(() => {
    const total = analyses.length
    const completed = analyses.filter((item) => normalizeStatus(item.status) === "COMPLETED").length
    const running = analyses.filter((item) => ["RUNNING", "QUEUED", "RECEIVED"].includes(normalizeStatus(item.status))).length
    const failed = analyses.filter((item) => normalizeStatus(item.status) === "FAILED").length
    return { total, completed, running, failed }
  }, [analyses])

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="text-muted-foreground">Loading project analyses...</span>
      </div>
    )
  }

  if (!project || error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-8">
          <p className="text-destructive">{error || "Project not found"}</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push("/dashboard/projects")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to projects
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/projects/${encodeURIComponent(project.id)}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Project details
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">Analyses du projet</h1>
          <p className="text-sm text-muted-foreground">
            Projet: <span className="font-medium text-foreground">{project.name}</span> ({project.full_name})
          </p>
        </div>
        <Button onClick={() => router.push(`/dashboard/projects/${encodeURIComponent(project.id)}/analyses/new`)}>
          <Play className="mr-2 h-4 w-4" />
          Nouvelle analyse
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle>{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Terminees</CardDescription>
            <CardTitle>{stats.completed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>En cours</CardDescription>
            <CardTitle>{stats.running}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Echouees</CardDescription>
            <CardTitle>{stats.failed}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              Historique des analyses
            </CardTitle>
            <CardDescription>Toutes les analyses rattachees a ce projet.</CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="COMPLETED">Terminee</SelectItem>
              <SelectItem value="RUNNING">En cours</SelectItem>
              <SelectItem value="QUEUED">En attente</SelectItem>
              <SelectItem value="FAILED">Echouee</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Analyse</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Auteur</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.prLabel}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.commitSha ? item.commitSha.slice(0, 10) : "commit auto"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={normalizeStatus(item.status) === "COMPLETED" ? "default" : "secondary"}>
                      {normalizeStatus(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.author || "-"}</TableCell>
                  <TableCell>{formatDate(item.createdAt)}</TableCell>
                  <TableCell>
                    {item.blockerCount} blocker / {item.warnCount} warn
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/dashboard/analyses/${encodeURIComponent(item.id)}`}>Voir</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    <div className="inline-flex items-center gap-2">
                      <Clock3 className="h-4 w-4" />
                      No analyses for this filter.
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
