"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Github } from "@/components/ui/social-icons"

type GithubOrganization = {
  login: string
  id: number
  description: string | null
  avatarUrl: string | null
}

type GithubOrganizationDetails = {
  organization?: {
    login: string
    name: string
    description?: string | null
  }
  repos?: Array<{
    id: number
    name: string
    fullName: string
    private: boolean
    htmlUrl: string | null
    language: string | null
    defaultBranch: string | null
    updatedAt: string | null
  }>
  members?: Array<{ login: string }>
}

type PreviewResponse = {
  all_members?: Array<{ login: string }>
}

const IMPORT_STEPS = [
  "Connexion GitHub",
  "Selection organisation",
  "Selection depots",
  "Verification",
  "Import",
] as const

function formatRelative(value: string | null): string {
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

export default function ImportGithubProjectsPage() {
  const router = useRouter()

  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [organizations, setOrganizations] = useState<GithubOrganization[]>([])
  const [selectedOrg, setSelectedOrg] = useState("")

  const [loadingDetails, setLoadingDetails] = useState(false)
  const [organizationDetails, setOrganizationDetails] = useState<GithubOrganizationDetails | null>(null)
  const [selectedRepos, setSelectedRepos] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const [importing, setImporting] = useState(false)
  const [includeHistoryOnly, setIncludeHistoryOnly] = useState(false)
  const [previewMembersCount, setPreviewMembersCount] = useState<number | null>(null)

  const repos = useMemo(() => {
    const raw = Array.isArray(organizationDetails?.repos) ? organizationDetails?.repos : []
    if (!search.trim()) return raw
    const normalizedSearch = search.trim().toLowerCase()
    return raw.filter((repo) => repo.fullName.toLowerCase().includes(normalizedSearch))
  }, [organizationDetails?.repos, search])

  const totalSelected = selectedRepos.length

  const loadOrganizations = useCallback(async () => {
    setLoadingOrgs(true)
    try {
      const response = await fetch("/api/dashboard/github/organizations", { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      const isConnected = payload?.connected === true
      const items = Array.isArray(payload?.organizations)
        ? (payload.organizations as GithubOrganization[])
        : []
      setConnected(isConnected)
      setOrganizations(items)
      if (isConnected && items.length > 0) {
        setSelectedOrg(items[0].login)
      }
    } catch {
      setConnected(false)
      setOrganizations([])
    } finally {
      setLoadingOrgs(false)
    }
  }, [])

  const loadOrganizationDetails = useCallback(async (orgLogin: string) => {
    if (!orgLogin) return
    setLoadingDetails(true)
    setOrganizationDetails(null)
    setSelectedRepos([])
    setPreviewMembersCount(null)
    try {
      const response = await fetch(
        `/api/dashboard/github/organizations?org=${encodeURIComponent(orgLogin)}`,
        { cache: "no-store" },
      )
      if (!response.ok) {
        throw new Error("Failed to load organization details")
      }
      const payload = (await response.json()) as GithubOrganizationDetails
      setOrganizationDetails(payload)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de charger l'organisation")
      setOrganizationDetails(null)
    } finally {
      setLoadingDetails(false)
    }
  }, [])

  const loadPreviewMembers = useCallback(async (repository: string) => {
    try {
      const response = await fetch("/api/dashboard/github/members/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository }),
      })
      if (!response.ok) {
        setPreviewMembersCount(null)
        return
      }
      const payload = (await response.json()) as PreviewResponse
      setPreviewMembersCount(Array.isArray(payload.all_members) ? payload.all_members.length : null)
    } catch {
      setPreviewMembersCount(null)
    }
  }, [])

  useEffect(() => {
    void loadOrganizations()
  }, [loadOrganizations])

  useEffect(() => {
    if (!selectedOrg) return
    void loadOrganizationDetails(selectedOrg)
  }, [loadOrganizationDetails, selectedOrg])

  useEffect(() => {
    if (selectedRepos.length === 1) {
      void loadPreviewMembers(selectedRepos[0])
    } else {
      setPreviewMembersCount(null)
    }
  }, [loadPreviewMembers, selectedRepos])

  const toggleRepo = (fullName: string, checked: boolean) => {
    setSelectedRepos((current) => {
      if (checked) {
        if (current.includes(fullName)) return current
        return [...current, fullName]
      }
      return current.filter((item) => item !== fullName)
    })
  }

  const selectAllVisible = () => {
    setSelectedRepos((current) => {
      const visibleSet = new Set(repos.map((repo) => repo.fullName))
      const next = [...current]
      for (const item of visibleSet) {
        if (!next.includes(item)) next.push(item)
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedRepos([])
  }

  const runImport = async () => {
    if (selectedRepos.length === 0) {
      toast.error("Selectionnez au moins un depot")
      return
    }

    setImporting(true)
    let okCount = 0
    let failCount = 0
    try {
      for (const repoFullName of selectedRepos) {
        const response = await fetch("/api/dashboard/github/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: repoFullName,
            project_name: repoFullName.split("/").pop(),
          }),
        })
        if (response.ok) {
          okCount += 1
        } else {
          failCount += 1
        }
      }

      if (failCount === 0) {
        toast.success(`Import termine: ${okCount} depot(s)`)
      } else {
        toast.warning(`Import termine: ${okCount} OK, ${failCount} en erreur`)
      }
      router.push("/dashboard/projects")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Importer depuis GitHub</h1>
          <p className="text-sm text-muted-foreground">
            Importez vos depots GitHub et creez les projets avec historique, branches et collaborateurs.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadOrganizations()} disabled={loadingOrgs}>
          {loadingOrgs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Synchroniser
        </Button>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="grid gap-3 md:grid-cols-5">
            {IMPORT_STEPS.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                  {index + 1}
                </div>
                <span className="text-sm font-medium text-muted-foreground">{step}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {!loadingOrgs && connected === false && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-6">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              GitHub non connecte.
            </p>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
              Connectez GitHub dans Clerk puis revenez sur cet ecran.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_320px]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                Depots de l'organisation
              </CardTitle>
              <Badge variant="secondary">{totalSelected} selectionne(s)</Badge>
            </div>
            <CardDescription>
              Choisissez les depots a importer. Chaque depot cree/alimente un projet cote plateforme.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[240px_1fr]">
              <Select value={selectedOrg} onValueChange={setSelectedOrg} disabled={loadingOrgs || organizations.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder="Organisation GitHub" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.login}>
                      {org.login}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un depot..."
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAllVisible} disabled={repos.length === 0}>
                Tout selectionner (visible)
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selectedRepos.length === 0}>
                Reinitialiser
              </Button>
              <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={includeHistoryOnly}
                  onCheckedChange={(value) => setIncludeHistoryOnly(value === true)}
                />
                Seulement depots avec historique
              </label>
            </div>

            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[44px]"></TableHead>
                    <TableHead>Depot</TableHead>
                    <TableHead>Visibilite</TableHead>
                    <TableHead>Branche defaut</TableHead>
                    <TableHead>Derniere activite</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingDetails && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                        Chargement...
                      </TableCell>
                    </TableRow>
                  )}
                  {!loadingDetails && repos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Aucun depot trouve.
                      </TableCell>
                    </TableRow>
                  )}
                  {!loadingDetails &&
                    repos.map((repo) => {
                      const checked = selectedRepos.includes(repo.fullName)
                      const isDisabled = includeHistoryOnly && !repo.defaultBranch
                      return (
                        <TableRow key={repo.id}>
                          <TableCell>
                            <Checkbox
                              checked={checked}
                              disabled={isDisabled}
                              onCheckedChange={(value) => toggleRepo(repo.fullName, value === true)}
                            />
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{repo.fullName}</p>
                            {repo.language && <p className="text-xs text-muted-foreground">{repo.language}</p>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={repo.private ? "secondary" : "outline"}>
                              {repo.private ? "Prive" : "Public"}
                            </Badge>
                          </TableCell>
                          <TableCell>{repo.defaultBranch || "-"}</TableCell>
                          <TableCell>{formatRelative(repo.updatedAt)}</TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Donnees importees</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Depots</span>
                <span className="font-semibold">{totalSelected}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Organisation</span>
                <span className="font-semibold">{selectedOrg || "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Collaborateurs detectes</span>
                <span className="font-semibold">{previewMembersCount ?? "-"}</span>
              </div>
              <div className="flex items-start gap-2 rounded-md bg-blue-50 p-3 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                <Users className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  L'import recupere les branches, commits et collaborateurs. Les comptes manquants seront
                  invites via Clerk.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Button className="w-full" onClick={runImport} disabled={importing || totalSelected === 0}>
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Import en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Importer les depots selectionnes
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
