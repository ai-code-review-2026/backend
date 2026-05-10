"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { motion } from "motion/react"
import { useRouter } from "next/navigation"
import {
  Search,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle,
  User,
  GitBranch,
  Calendar,
  ArrowUpDown,
  Eye,
  Play,
  UserPlus,
  MoreVertical,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import {
  fetchReviewQueueData,
  claimReviewAssignment,
  startReview,
  declineReviewAssignment,
  createReviewQueuePoller,
  defaultReviewQueueData,
  type ReviewQueueData,
  type QueueAssignment,
} from "@/lib/review-queue"

interface QueueFilters {
  status: string
  priority: string
  search: string
  sortBy: string
  sortOrder: "asc" | "desc"
}

export function ReviewQueue() {
  const router = useRouter()
  const [queueData, setQueueData] = useState<ReviewQueueData>(defaultReviewQueueData)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("assigned")
  const [filters, setFilters] = useState<QueueFilters>({
    status: "all",
    priority: "all",
    search: "",
    sortBy: "due_at",
    sortOrder: "asc",
  })

  // Dialog states
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false)
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState<QueueAssignment | null>(null)
  const [newReviewerId, setNewReviewerId] = useState("")
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high" | "critical">("medium")

  // Load queue data on mount
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchReviewQueueData({ force: true })
      setQueueData(data)
    } catch (error) {
      console.error("Failed to load queue data:", error)
      setQueueData({
        ...defaultReviewQueueData,
        error: "Erreur lors du chargement de la file d'attente",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Polling for real-time updates
  useEffect(() => {
    const poller = createReviewQueuePoller((data) => {
      setQueueData(data)
    }, { intervalMs: 20_000 })

    poller.start()
    return () => poller.stop()
  }, [])

  // Filtered and sorted data
  const filteredAssigned = useMemo(() => {
    let items = [...queueData.assigned]

    // Apply search filter
    if (filters.search) {
      const query = filters.search.toLowerCase()
      items = items.filter(
        (item) =>
          item.analysis.repo.toLowerCase().includes(query) ||
          item.analysis.author.toLowerCase().includes(query) ||
          item.analysis.pr_label.toLowerCase().includes(query)
      )
    }

    // Apply status filter
    if (filters.status !== "all") {
      items = items.filter((item) => item.status === filters.status)
    }

    // Apply priority filter
    if (filters.priority !== "all") {
      items = items.filter((item) => item.priority === filters.priority)
    }

    // Apply sorting
    items.sort((a, b) => {
      let aValue: number
      let bValue: number

      switch (filters.sortBy) {
        case "priority":
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
          aValue = priorityOrder[a.priority] || 0
          bValue = priorityOrder[b.priority] || 0
          break
        case "wait_time":
          aValue = a.wait_time_hours
          bValue = b.wait_time_hours
          break
        case "complexity":
          aValue = a.analysis.complexity_score
          bValue = b.analysis.complexity_score
          break
        case "due_at":
        default:
          aValue = new Date(a.due_at).getTime()
          bValue = new Date(b.due_at).getTime()
          break
      }

      return filters.sortOrder === "asc" ? aValue - bValue : bValue - aValue
    })

    return items
  }, [queueData.assigned, filters])

  const handleClaimReview = async (assignmentId: string) => {
    setActionLoading(assignmentId)
    setActionError(null)
    try {
      const result = await claimReviewAssignment(assignmentId)
      if (result.success) {
        // Refresh data after claiming
        await loadData()
      } else {
        setActionError(result.error ?? "Impossible de reclamer cette review.")
        console.error("Failed to claim review:", result.error)
      }
    } catch (error) {
      setActionError("Erreur reseau lors de la reclamation de la review.")
      console.error("Failed to claim review:", error)
    } finally {
      setActionLoading(null)
    }
  }

  const buildReviewHref = (analysisId: string, assignmentId?: string) => {
    const encodedAnalysisId = encodeURIComponent(analysisId)
    return assignmentId
      ? `/dashboard/review/${encodedAnalysisId}?assignment=${encodeURIComponent(assignmentId)}`
      : `/dashboard/review/${encodedAnalysisId}`
  }

  const handleStartReview = async (item: QueueAssignment) => {
    setActionLoading(item.id)
    setActionError(null)
    try {
      const result = await startReview(item.id, item.analysis.id, item.priority)
      if (!result.success) {
        setActionError(result.error ?? "Impossible de demarrer cette review.")
        return
      }
      router.push(buildReviewHref(item.analysis.id, result.assignmentId ?? item.id))
    } catch (error) {
      setActionError("Erreur reseau lors du demarrage de la review.")
      console.error("Failed to start review:", error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeclineReview = async (assignmentId: string) => {
    setActionLoading(assignmentId)
    setActionError(null)
    try {
      const result = await declineReviewAssignment(assignmentId)
      if (result.success) {
        await loadData()
      } else {
        setActionError(result.error ?? "Impossible de refuser cette review.")
        console.error("Failed to decline review:", result.error)
      }
    } catch (error) {
      setActionError("Erreur reseau lors du refus de la review.")
      console.error("Failed to decline review:", error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReassignClick = (item: QueueAssignment) => {
    setSelectedAssignment(item)
    setNewReviewerId("")
    setReassignDialogOpen(true)
  }

  const handleReassign = async () => {
    if (!selectedAssignment || !newReviewerId.trim()) {
      setActionError("Veuillez entrer un ID de reviewer valide")
      return
    }

    setActionLoading(selectedAssignment.id)
    setActionError(null)
    try {
      const response = await fetch(`/api/dashboard/reviews/assignments/${selectedAssignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer_id: newReviewerId.trim() }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setActionError(data.error ?? "Impossible de réassigner cette review.")
        return
      }

      setReassignDialogOpen(false)
      await loadData()
    } catch (error) {
      setActionError("Erreur réseau lors de la réassignation.")
      console.error("Failed to reassign:", error)
    } finally {
      setActionLoading(null)
    }
  }

  const handlePriorityClick = (item: QueueAssignment) => {
    setSelectedAssignment(item)
    setNewPriority(item.priority)
    setPriorityDialogOpen(true)
  }

  const handleChangePriority = async () => {
    if (!selectedAssignment) return

    setActionLoading(selectedAssignment.id)
    setActionError(null)
    try {
      const response = await fetch(`/api/dashboard/reviews/assignments/${selectedAssignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setActionError(data.error ?? "Impossible de changer la priorité.")
        return
      }

      setPriorityDialogOpen(false)
      await loadData()
    } catch (error) {
      setActionError("Erreur réseau lors du changement de priorité.")
      console.error("Failed to change priority:", error)
    } finally {
      setActionLoading(null)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "bg-red-500"
      case "high":
        return "bg-orange-500"
      case "medium":
        return "bg-yellow-500"
      case "low":
        return "bg-green-500"
      default:
        return "bg-gray-500"
    }
  }

  const formatTimeUntilDue = (dueAt: string) => {
    const now = new Date()
    const due = new Date(dueAt)
    const diffHours = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60))

    if (diffHours < 0) return `${Math.abs(diffHours)}h en retard`
    if (diffHours === 0) return "Échéance maintenant"
    if (diffHours < 24) return `${diffHours}h restantes`
    return `${Math.ceil(diffHours / 24)}j restants`
  }

  return (
    <div className="space-y-6">
      {/* Error State */}
      {(queueData.error || actionError) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-red-200">{actionError ?? queueData.error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActionError(null)
              loadData()
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Réessayer
          </Button>
        </motion.div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">En attente</p>
                <p className="text-2xl font-bold">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : queueData.stats.pending_count}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Play className="h-4 w-4 text-[color:var(--orange)]" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">En cours</p>
                <p className="text-2xl font-bold">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : queueData.stats.in_progress_count}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">En retard</p>
                <p className="text-2xl font-bold">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : queueData.stats.overdue_count}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-center">
              <Button size="sm" onClick={loadData} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Actualiser
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="assigned">
              Assignées ({queueData.assigned.length})
            </TabsTrigger>
            <TabsTrigger value="available">
              Disponibles ({queueData.available.length})
            </TabsTrigger>
          </TabsList>

          {/* Filters */}
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Rechercher..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-64"
            />
            <Select value={filters.priority} onValueChange={(value) => setFilters({ ...filters, priority: value })}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Priorité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="critical">Critique</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="low">Basse</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.sortBy} onValueChange={(value) => setFilters({ ...filters, sortBy: value })}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Trier par" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due_at">Échéance</SelectItem>
                <SelectItem value="priority">Priorité</SelectItem>
                <SelectItem value="wait_time">Attente</SelectItem>
                <SelectItem value="complexity">Complexité</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilters({ ...filters, sortOrder: filters.sortOrder === "asc" ? "desc" : "asc" })}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TabsContent value="assigned">
          <Card>
            <CardHeader>
              <CardTitle>Mes Reviews Assignées</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-muted-foreground">Chargement...</span>
                </div>
              ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Repository</TableHead>
                    <TableHead>Auteur</TableHead>
                    <TableHead>Problèmes</TableHead>
                    <TableHead>Complexité</TableHead>
                    <TableHead>Attente</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssigned.map((item) => (
                    <TableRow key={item.id} className={item.is_overdue ? "bg-red-50 dark:bg-red-950/20" : ""}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${getPriorityColor(item.priority)}`} />
                          <Badge
                            variant={
                              item.priority === "critical" ? "destructive" :
                              item.priority === "high" ? "destructive" :
                              item.priority === "medium" ? "default" : "secondary"
                            }
                          >
                            {item.priority}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <Link
                            href={`/dashboard/review/${item.analysis.id}`}
                            className="font-medium hover:underline"
                          >
                            {item.analysis.repo}
                          </Link>
                          <p className="text-sm text-muted-foreground">{item.analysis.pr_label}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{item.analysis.author}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Badge variant="destructive" className="text-xs">
                            {item.analysis.findings_summary.blocker}
                          </Badge>
                          <Badge variant="default" className="text-xs">
                            {item.analysis.findings_summary.warn}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {item.analysis.findings_summary.info}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full ${
                                i < Math.floor(item.analysis.complexity_score)
                                  ? "bg-orange-500"
                                  : "bg-gray-200 dark:bg-gray-700"
                              }`}
                            />
                          ))}
                          <span className="text-xs ml-1">{item.analysis.complexity_score}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={item.wait_time_hours > 6 ? "text-destructive font-medium" : ""}>
                          {item.wait_time_hours}h
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className={item.is_overdue ? "text-destructive font-medium" : ""}>
                          {formatTimeUntilDue(item.due_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            onClick={() => handleStartReview(item)}
                            disabled={actionLoading === item.id}
                          >
                            {actionLoading === item.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3 mr-1" />
                            )}
                            Démarrer
                          </Button>
                          <Link href={buildReviewHref(item.analysis.id, item.id)}>
                            <Button size="sm" variant="outline">
                              <Eye className="h-3 w-3 mr-1" />
                              Voir
                            </Button>
                          </Link>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost">
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handleReassignClick(item)}>
                                Réassigner
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePriorityClick(item)}>
                                Changer la priorité
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => handleDeclineReview(item.id)}
                              >
                                Refuser
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
              {!loading && filteredAssigned.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="text-muted-foreground">Aucune review assignée</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="available">
          <Card>
            <CardHeader>
              <CardTitle>Disponibles pour auto-assignation</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-muted-foreground">Chargement...</span>
                </div>
              ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Repository</TableHead>
                    <TableHead>Auteur</TableHead>
                    <TableHead>Problèmes</TableHead>
                    <TableHead>Complexité</TableHead>
                    <TableHead>Temps estimé</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueData.available.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${getPriorityColor(item.priority)}`} />
                          <Badge variant={item.priority === "high" ? "destructive" : "default"}>
                            {item.priority}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.analysis.repo}</p>
                          <p className="text-sm text-muted-foreground">{item.analysis.pr_label}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{item.analysis.author}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Badge variant="destructive" className="text-xs">
                            {item.analysis.findings_summary.blocker}
                          </Badge>
                          <Badge variant="default" className="text-xs">
                            {item.analysis.findings_summary.warn}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {item.analysis.findings_summary.info}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full ${
                                i < Math.floor(item.analysis.complexity_score)
                                  ? "bg-orange-500"
                                  : "bg-gray-200 dark:bg-gray-700"
                              }`}
                            />
                          ))}
                          <span className="text-xs ml-1">{item.analysis.complexity_score}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">~30 min</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            onClick={() => handleClaimReview(item.id)}
                            disabled={actionLoading === item.id}
                          >
                            {actionLoading === item.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <UserPlus className="h-3 w-3 mr-1" />
                            )}
                            Réclamer
                          </Button>
                          <Link href={buildReviewHref(item.analysis.id, item.id)}>
                            <Button size="sm" variant="outline">
                              <Eye className="h-3 w-3 mr-1" />
                              Aperçu
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
              {!loading && queueData.available.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="text-muted-foreground">Aucune review disponible</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reassign Dialog */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réassigner la review</DialogTitle>
            <DialogDescription>
              Entrez l'ID du nouveau reviewer pour cette review.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reviewer-id">ID du reviewer</Label>
              <Input
                id="reviewer-id"
                placeholder="user_xxxxx"
                value={newReviewerId}
                onChange={(e) => setNewReviewerId(e.target.value)}
                disabled={actionLoading !== null}
              />
            </div>
            {selectedAssignment && (
              <div className="text-sm text-muted-foreground">
                <p><strong>Repository:</strong> {selectedAssignment.analysis.repo}</p>
                <p><strong>PR:</strong> {selectedAssignment.analysis.pr_label}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReassignDialogOpen(false)}
              disabled={actionLoading !== null}
            >
              Annuler
            </Button>
            <Button
              onClick={handleReassign}
              disabled={actionLoading !== null || !newReviewerId.trim()}
            >
              {actionLoading !== null ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Réassignation...
                </>
              ) : (
                "Réassigner"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Priority Dialog */}
      <Dialog open={priorityDialogOpen} onOpenChange={setPriorityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer la priorité</DialogTitle>
            <DialogDescription>
              Sélectionnez la nouvelle priorité pour cette review.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="priority">Priorité</Label>
              <Select
                value={newPriority}
                onValueChange={(value: "low" | "medium" | "high" | "critical") => setNewPriority(value)}
                disabled={actionLoading !== null}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      Basse
                    </div>
                  </SelectItem>
                  <SelectItem value="medium">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      Moyenne
                    </div>
                  </SelectItem>
                  <SelectItem value="high">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500" />
                      Haute
                    </div>
                  </SelectItem>
                  <SelectItem value="critical">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      Critique
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedAssignment && (
              <div className="text-sm text-muted-foreground">
                <p><strong>Repository:</strong> {selectedAssignment.analysis.repo}</p>
                <p><strong>PR:</strong> {selectedAssignment.analysis.pr_label}</p>
                <p><strong>Priorité actuelle:</strong> {selectedAssignment.priority}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPriorityDialogOpen(false)}
              disabled={actionLoading !== null}
            >
              Annuler
            </Button>
            <Button
              onClick={handleChangePriority}
              disabled={actionLoading !== null}
            >
              {actionLoading !== null ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Modification...
                </>
              ) : (
                "Modifier"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
