"use client"

import { useState, useEffect } from "react"
import { motion } from "motion/react"
import {
  Search,
  Filter,
  Check,
  Clock,
  AlertTriangle,
  GitBranch,
  ChevronRight,
  Star,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { BADGE_SUCCESS, BADGE_WARNING, BADGE_ERROR, BADGE_SECONDARY } from "@/lib/design-tokens"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// Types for the reviews
interface Review {
  id: string
  title: string
  project: string
  repository: string
  branch: string
  status: "completed" | "in_progress" | "pending"
  priority: "critical" | "high" | "medium" | "low"
  createdAt: string
  completedAt?: string
  linesChanged: number
  comments: number
  starred: boolean
}

const statusConfig = {
  completed: { label: "Terminee", icon: Check, variant: BADGE_SUCCESS },
  in_progress: { label: "En Cours", icon: Clock, variant: BADGE_WARNING },
  pending: { label: "En Attente", icon: Clock, variant: BADGE_SECONDARY },
}

const priorityConfig = {
  critical: { label: "Critique", variant: BADGE_ERROR },
  high: { label: "Haute", variant: BADGE_WARNING },
  medium: { label: "Moyenne", variant: BADGE_SECONDARY },
  low: { label: "Basse", variant: BADGE_SECONDARY },
}

export default function MyReviewsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReviews = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Try to fetch from API
      const response = await fetch('/api/reviewer/my-reviews')
      if (response.ok) {
        const data = await response.json()
        setReviews(data)
      } else {
        // Return empty array if API not available
        setReviews([])
      }
    } catch (err) {
      // Return empty array if API not available
      setReviews([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReviews()
  }, [])

  const filteredReviews = reviews.filter((review) => {
    const matchesSearch =
      review.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.repository.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || review.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const toggleStar = (id: string) => {
    setReviews((prev) =>
      prev.map((r) => (r.id === id ? { ...r, starred: !r.starred } : r))
    )
  }

  const stats = {
    total: reviews.length,
    completed: reviews.filter((r) => r.status === "completed").length,
    inProgress: reviews.filter((r) => r.status === "in_progress").length,
    pending: reviews.filter((r) => r.status === "pending").length,
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-3 text-muted-foreground">Chargement des reviews...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
                <h3 className="text-lg font-semibold text-red-700 dark:text-destructive mb-2">
                  Erreur de chargement
                </h3>
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={fetchReviews} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Reessayer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="card-heading text-foreground">Mes Reviews</h1>
          <p className="text-muted-foreground mt-1">
            Suivre et gerer toutes vos assignments de revue de code
          </p>
        </div>
        <Button onClick={fetchReviews} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
        >
          <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Reviews Totales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[color:var(--green-status)]">
                Terminees
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                {stats.completed}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-teal-400">
                En Cours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-teal-400">
                {stats.inProgress}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[color:var(--orange)] dark:text-amber-400">
                En Attente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {stats.pending}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher des reviews..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les Statuts</SelectItem>
                <SelectItem value="completed">Terminees</SelectItem>
                <SelectItem value="in_progress">En Cours</SelectItem>
                <SelectItem value="pending">En Attente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reviews Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Projet</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Priorite</TableHead>
                  <TableHead className="text-right">Lignes</TableHead>
                  <TableHead className="text-right">Commentaires</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReviews.map((review) => {
                  const status = statusConfig[review.status as keyof typeof statusConfig]
                  const priority = priorityConfig[review.priority as keyof typeof priorityConfig]
                  const StatusIcon = status.icon

                  return (
                    <TableRow
                      key={review.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <TableCell>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleStar(review.id)
                          }}
                          className="text-muted-foreground hover:text-yellow-500 transition-colors"
                        >
{review.starred ? (
                             <Star className="h-4 w-4 text-yellow-500" />
                           ) : (
                             <Star className="h-4 w-4" />
                           )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{review.title}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {review.branch}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{review.project}</span>
                          <span className="text-xs text-muted-foreground">
                            {review.repository}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant as "success" | "warning" | "secondary"}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={priority.variant as "error" | "warning" | "secondary"}>
                          {priority.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        +{review.linesChanged}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {review.comments}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {filteredReviews.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Aucune review trouvee</h3>
                <p className="text-muted-foreground mt-1">
                  Essayez d'ajuster votre recherche ou filtre
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
