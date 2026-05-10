"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  Search,
  GitBranch,
  GitMerge,
  Shield,
  ShieldCheck,
  Trash2,
  Plus,
  RotateCw,
  Filter,
  ChevronRight,
  Lock,
  Unlock,
  Star,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/lib/domain/dates"

// Types
interface Branch {
  id: string
  repo_id: string
  org_id: string | null
  branch_name: string
  branch_type: "main" | "develop" | "feature" | "hotfix" | "release" | "custom"
  branch_pattern: string | null
  last_commit_sha: string | null
  last_commit_author: string | null
  last_commit_message: string | null
  last_commit_at: string | null
  created_by: string | null
  created_at: string
  base_branch: string | null
  merge_status: "open" | "merged" | "closed" | "deleted" | null
  is_protected: boolean
  is_default: boolean
  is_active: boolean
  ahead_count: number
  behind_count: number
  description: string | null
}

interface BranchListProps {
  repoId?: string
  orgId?: string
}

function getBranchTypeBadgeVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    main: "default",
    develop: "secondary",
    feature: "outline",
    hotfix: "destructive",
    release: "secondary",
    custom: "outline",
  }
  return variants[type] || "outline"
}

export function BranchList({ repoId, orgId }: BranchListProps) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [protectedFilter, setProtectedFilter] = useState<string>("all")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)

  // New branch form state
  const [newBranchName, setNewBranchName] = useState("")
  const [newBranchType, setNewBranchType] = useState<string>("feature")
  const [newBaseBranch, setNewBaseBranch] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [createLoading, setCreateLoading] = useState(false)

  const fetchBranches = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (repoId) params.set("repo_id", repoId)
      if (orgId) params.set("org_id", orgId)

      const response = await fetch(`/api/dashboard/branches?${params.toString()}`)
      if (!response.ok) throw new Error("Failed to fetch branches")

      const data = await response.json()
      setBranches(data.branches || [])
    } catch (error) {
      console.error("Error fetching branches:", error)
      setBranches([])
    } finally {
      setLoading(false)
    }
  }, [repoId, orgId])

  // Fetch branches
  useEffect(() => {
    void fetchBranches()
  }, [fetchBranches])

  // Filtered branches
  const filteredBranches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return branches.filter((branch) => {
      // Search filter
      if (query) {
        const matchesSearch =
          branch.branch_name.toLowerCase().includes(query) ||
          (branch.last_commit_author?.toLowerCase().includes(query) ?? false) ||
          (branch.description?.toLowerCase().includes(query) ?? false)
        if (!matchesSearch) return false
      }

      // Type filter
      if (typeFilter !== "all" && branch.branch_type !== typeFilter) {
        return false
      }

      // Protected filter
      if (protectedFilter === "protected" && !branch.is_protected) {
        return false
      }
      if (protectedFilter === "unprotected" && branch.is_protected) {
        return false
      }

      return true
    })
  }, [branches, searchQuery, typeFilter, protectedFilter])

  // Statistics
  const stats = useMemo(() => {
    return {
      total: branches.length,
      protected: branches.filter((b) => b.is_protected).length,
      active: branches.filter((b) => b.is_active).length,
      byType: {
        main: branches.filter((b) => b.branch_type === "main").length,
        develop: branches.filter((b) => b.branch_type === "develop").length,
        feature: branches.filter((b) => b.branch_type === "feature").length,
        hotfix: branches.filter((b) => b.branch_type === "hotfix").length,
        release: branches.filter((b) => b.branch_type === "release").length,
      },
    }
  }, [branches])

  // Create branch handler
  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return
    if (!repoId) {
      alert("Select a repository before creating a branch")
      return
    }

    setCreateLoading(true)
    try {
      const response = await fetch("/api/dashboard/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_id: repoId,
          org_id: orgId,
          branch_name: newBranchName,
          branch_type: newBranchType,
          base_branch: newBaseBranch || null,
          description: newDescription || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        const message =
          (error as { message?: string; error?: string }).message ||
          (error as { message?: string; error?: string }).error ||
          "Failed to create branch"
        throw new Error(message)
      }

      const data = await response.json()
      setBranches((prev) => [data.branch, ...prev])
      setIsCreateDialogOpen(false)
      resetNewBranchForm()
    } catch (error) {
      console.error("Error creating branch:", error)
      alert(error instanceof Error ? error.message : "Failed to create branch")
    } finally {
      setCreateLoading(false)
    }
  }

  const resetNewBranchForm = () => {
    setNewBranchName("")
    setNewBranchType("feature")
    setNewBaseBranch("")
    setNewDescription("")
  }

  // Delete branch handler
  const handleDeleteBranch = async (branchId: string, branchName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete branch "${branchName}"?`
    )
    if (!confirmed) return

    setDeleteBusyId(branchId)
    try {
      const response = await fetch(`/api/dashboard/branches/${branchId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        const message =
          (error as { message?: string; error?: string }).message ||
          (error as { message?: string; error?: string }).error ||
          "Failed to delete branch"
        throw new Error(message)
      }

      setBranches((prev) => prev.filter((b) => b.id !== branchId))
    } catch (error) {
      console.error("Error deleting branch:", error)
      alert(error instanceof Error ? error.message : "Failed to delete branch")
    } finally {
      setDeleteBusyId(null)
    }
  }

  // Refresh handler
  const handleRefresh = () => {
    void fetchBranches()
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branch Management</h1>
          <p className="text-muted-foreground">
            Manage branches, protection rules, and policies
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!repoId} title={repoId ? undefined : "Add ?repo_id=... to enable branch creation"}>
              <Plus className="mr-2 h-4 w-4" />
              New Branch
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Branch</DialogTitle>
              <DialogDescription>
                Create a new branch with the specified configuration.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="branch-name">Branch Name</Label>
                <Input
                  id="branch-name"
                  placeholder="feature/JIRA-123-new-feature"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="branch-type">Type</Label>
                <Select value={newBranchType} onValueChange={setNewBranchType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="hotfix">Hotfix</SelectItem>
                    <SelectItem value="release">Release</SelectItem>
                    <SelectItem value="develop">Develop</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="base-branch">Base Branch</Label>
                <Input
                  id="base-branch"
                  placeholder="develop"
                  value={newBaseBranch}
                  onChange={(e) => setNewBaseBranch(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the branch purpose"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateBranch} disabled={createLoading || !newBranchName.trim()}>
                {createLoading ? "Creating..." : "Create Branch"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Branches</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.active} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Protected</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.protected}</div>
            <p className="text-xs text-muted-foreground">
              {((stats.protected / stats.total) * 100 || 0).toFixed(0)}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Feature Branches</CardTitle>
            <GitMerge className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.byType.feature}</div>
            <p className="text-xs text-muted-foreground">
              In development
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hotfixes</CardTitle>
            <Shield className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.byType.hotfix}</div>
            <p className="text-xs text-muted-foreground">
              Critical fixes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search branches..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="main">Main</SelectItem>
                  <SelectItem value="develop">Develop</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="hotfix">Hotfix</SelectItem>
                  <SelectItem value="release">Release</SelectItem>
                </SelectContent>
              </Select>
              <Select value={protectedFilter} onValueChange={setProtectedFilter}>
                <SelectTrigger className="w-[150px]">
                  <Shield className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Protection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="protected">Protected</SelectItem>
                  <SelectItem value="unprotected">Unprotected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="icon" onClick={handleRefresh}>
              <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Branch Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RotateCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredBranches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No branches found</h3>
              <p className="text-muted-foreground">
                {searchQuery || typeFilter !== "all" || protectedFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Create your first branch to get started"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Commit</TableHead>
                  <TableHead>Ahead/Behind</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBranches.map((branch) => (
                  <motion.tr
                    key={branch.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {branch.branch_name}
                            {branch.is_default && (
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                            )}
                          </div>
                          {branch.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {branch.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getBranchTypeBadgeVariant(branch.branch_type)}>
                        {branch.branch_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {branch.is_protected ? (
                          <Badge variant="secondary" className="gap-1">
                            <Lock className="h-3 w-3" />
                            Protected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <Unlock className="h-3 w-3" />
                            Unprotected
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <div className="text-sm truncate">
                          {branch.last_commit_message || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {branch.last_commit_author || "-"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[color:var(--green-status)]">+{branch.ahead_count}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-destructive">-{branch.behind_count}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDateTime(branch.created_at)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDeleteBranch(branch.id, branch.branch_name)}
                          disabled={deleteBusyId === branch.id || branch.is_protected}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
