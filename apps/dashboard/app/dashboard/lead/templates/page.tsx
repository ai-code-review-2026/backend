"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  Plus, Search, FileText, Lock, Globe, Edit, Copy, Trash2,
  List, Shield, Zap, Code, Database, CheckCircle, AlertTriangle
} from "lucide-react"
import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider"
import { isReviewerLead } from "@/lib/roles"

interface ReviewTemplate {
  id: string
  name: string
  description: string
  category: string
  is_default: boolean
  is_public: boolean
  created_by: string
  created_by_name?: string
  usage_count: number
  checklist_items: Array<{
    id: string
    label: string
    description?: string
    checked: boolean
  }>
  guidelines: string
  auto_apply_rules: {
    severity?: string[]
    categories?: string[]
  }
  created_at: string
  updated_at: string
}

const TEMPLATE_CATEGORIES = [
  { value: "general", label: "General Code Review", icon: Code },
  { value: "security", label: "Security Review", icon: Shield },
  { value: "performance", label: "Performance Review", icon: Zap },
  { value: "critical_change", label: "Critical Change Review", icon: AlertTriangle },
  { value: "frontend", label: "Frontend Specific", icon: Globe },
  { value: "backend", label: "Backend Specific", icon: Database },
]

const TEMPLATE_ENDPOINT = "/api/dashboard/reviews/templates"

function parseErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback
  const record = payload as Record<string, unknown>
  if (typeof record.error === "string" && record.error.trim().length > 0) return record.error
  if (typeof record.detail === "string" && record.detail.trim().length > 0) return record.detail
  return fallback
}

function normalizeChecklistItems(input: unknown): ReviewTemplate["checklist_items"] {
  if (!Array.isArray(input)) return []
  return input.map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    const label = typeof row.label === "string" && row.label.trim().length > 0
      ? row.label
      : `Checklist item ${index + 1}`
    return {
      id: typeof row.id === "string" && row.id.trim().length > 0 ? row.id : `${index + 1}`,
      label,
      description: typeof row.description === "string" ? row.description : "",
      checked: Boolean(row.checked),
    }
  })
}

function normalizeTemplate(raw: unknown): ReviewTemplate | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === "string" ? row.id : ""
  const name = typeof row.name === "string" ? row.name : ""
  const category = typeof row.category === "string" ? row.category : "general"
  if (!id || !name) return null

  const autoApplyRules = row.auto_apply_rules && typeof row.auto_apply_rules === "object"
    ? (row.auto_apply_rules as { severity?: string[]; categories?: string[] })
    : {}

  return {
    id,
    name,
    description: typeof row.description === "string" ? row.description : "",
    category,
    is_default: Boolean(row.is_default),
    is_public: Boolean(row.is_public),
    created_by: typeof row.created_by === "string" ? row.created_by : "",
    created_by_name: typeof row.created_by_name === "string" ? row.created_by_name : undefined,
    usage_count: typeof row.usage_count === "number" ? row.usage_count : 0,
    checklist_items: normalizeChecklistItems(row.checklist_items),
    guidelines: typeof row.guidelines === "string" ? row.guidelines : "",
    auto_apply_rules: autoApplyRules,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  }
}

function buildTemplatePayload(template: ReviewTemplate): Record<string, unknown> {
  return {
    name: template.name.trim(),
    description: template.description.trim() || null,
    category: template.category,
    is_default: template.is_default,
    is_public: template.is_public,
    checklist_items: template.checklist_items
      .filter((item) => item.label.trim().length > 0)
      .map((item) => ({
        id: item.id,
        label: item.label.trim(),
        description: item.description?.trim() || "",
        checked: Boolean(item.checked),
      })),
    guidelines: template.guidelines.trim() || null,
    auto_apply_rules: template.auto_apply_rules ?? {},
  }
}

async function fetchTemplatesFromApi(): Promise<ReviewTemplate[]> {
  const response = await fetch(TEMPLATE_ENDPOINT, { cache: "no-store" })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "Failed to fetch templates"))
  }
  if (!Array.isArray(payload)) {
    throw new Error("Invalid templates payload")
  }
  return payload.map(normalizeTemplate).filter((item): item is ReviewTemplate => item !== null)
}

export default function TemplatesPage() {
  const currentUser = useDashboardUser()
  const [templates, setTemplates] = useState<ReviewTemplate[]>([])
  const [filteredTemplates, setFilteredTemplates] = useState<ReviewTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ReviewTemplate | null>(null)

  const hasPermission = isReviewerLead(currentUser.role)

  useEffect(() => {
    if (!hasPermission) {
      setLoading(false)
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setErrorMessage(null)
        const rows = await fetchTemplatesFromApi()
        if (!cancelled) {
          setTemplates(rows)
        }
      } catch (err) {
        console.error("Failed to fetch templates:", err)
        if (!cancelled) {
          setTemplates([])
          setErrorMessage(err instanceof Error ? err.message : "Failed to load templates")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [hasPermission])

  useEffect(() => {
    let filtered = templates

    if (searchTerm) {
      filtered = filtered.filter(template =>
        template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.description.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter(template => template.category === selectedCategory)
    }

    setFilteredTemplates(filtered)
  }, [templates, searchTerm, selectedCategory])

  const reloadTemplates = async () => {
    try {
      setErrorMessage(null)
      const rows = await fetchTemplatesFromApi()
      setTemplates(rows)
    } catch (err) {
      console.error("Failed to reload templates:", err)
      setErrorMessage(err instanceof Error ? err.message : "Failed to reload templates")
    }
  }

  // Check permissions after hooks
  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Shield className="h-12 w-12 text-yellow-500 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg">Access Restricted</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Template management is only available to Tech Leads.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const getCategoryIcon = (category: string) => {
    const categoryConfig = TEMPLATE_CATEGORIES.find(cat => cat.value === category)
    return categoryConfig?.icon || FileText
  }

  const handleCreateTemplate = () => {
    setEditingTemplate({
      id: "",
      name: "",
      description: "",
      category: "general",
      is_default: false,
      is_public: false,
      created_by: currentUser.id,
      created_by_name: currentUser.name,
      usage_count: 0,
      checklist_items: [
        { id: "1", label: "New checklist item", description: "", checked: false }
      ],
      guidelines: "",
      auto_apply_rules: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    setIsCreateDialogOpen(true)
  }

  const handleEditTemplate = (template: ReviewTemplate) => {
    setEditingTemplate({ ...template })
    setIsCreateDialogOpen(true)
  }

  const handleDuplicateTemplate = (template: ReviewTemplate) => {
    const duplicated = {
      ...template,
      id: "",
      name: `${template.name} (Copy)`,
      is_default: false,
      created_by: currentUser.id,
      created_by_name: currentUser.name,
      usage_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    setEditingTemplate(duplicated)
    setIsCreateDialogOpen(true)
  }

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return
    if (editingTemplate.name.trim().length === 0) {
      setErrorMessage("Template name is required")
      return
    }

    try {
      setSubmitting(true)
      setErrorMessage(null)
      const body = buildTemplatePayload(editingTemplate)

      let response: Response
      if (editingTemplate.id) {
        response = await fetch(`${TEMPLATE_ENDPOINT}/${encodeURIComponent(editingTemplate.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } else {
        response = await fetch(TEMPLATE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      }

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(parseErrorMessage(payload, "Failed to save template"))
      }

      setIsCreateDialogOpen(false)
      setEditingTemplate(null)
      await reloadTemplates()
    } catch (err) {
      console.error("Failed to save template:", err)
      setErrorMessage(err instanceof Error ? err.message : "Failed to save template")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    if (confirm("Are you sure you want to delete this template?")) {
      try {
        setBusyTemplateId(templateId)
        setErrorMessage(null)
        const response = await fetch(`${TEMPLATE_ENDPOINT}/${encodeURIComponent(templateId)}`, {
          method: "DELETE",
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(parseErrorMessage(payload, "Failed to delete template"))
        }
        await reloadTemplates()
      } catch (err) {
        console.error("Failed to delete template:", err)
        setErrorMessage(err instanceof Error ? err.message : "Failed to delete template")
      } finally {
        setBusyTemplateId(null)
      }
    }
  }

  const handleUseTemplate = async (templateId: string) => {
    try {
      setBusyTemplateId(templateId)
      setErrorMessage(null)
      const response = await fetch(`${TEMPLATE_ENDPOINT}/${encodeURIComponent(templateId)}/use`, {
        method: "POST",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(parseErrorMessage(payload, "Failed to use template"))
      }
      const updated = normalizeTemplate(payload)
      if (!updated) {
        throw new Error("Invalid template payload")
      }
      setTemplates((prev) => prev.map((item) => (item.id === templateId ? updated : item)))
    } catch (err) {
      console.error("Failed to use template:", err)
      setErrorMessage(err instanceof Error ? err.message : "Failed to use template")
    } finally {
      setBusyTemplateId(null)
    }
  }

  const addChecklistItem = () => {
    if (!editingTemplate) return

    const newItem = {
      id: Date.now().toString(),
      label: "New checklist item",
      description: "",
      checked: false
    }

    setEditingTemplate({
      ...editingTemplate,
      checklist_items: [...editingTemplate.checklist_items, newItem]
    })
  }

  const updateChecklistItem = (itemId: string, updates: Partial<ReviewTemplate['checklist_items'][0]>) => {
    if (!editingTemplate) return

    setEditingTemplate({
      ...editingTemplate,
      checklist_items: editingTemplate.checklist_items.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      )
    })
  }

  const removeChecklistItem = (itemId: string) => {
    if (!editingTemplate) return

    setEditingTemplate({
      ...editingTemplate,
      checklist_items: editingTemplate.checklist_items.filter(item => item.id !== itemId)
    })
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-8 w-48 bg-gray-200 rounded"></div>
          <div className="h-10 w-32 bg-gray-200 rounded"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="card-heading text-foreground">Review Templates</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage reusable review checklists and guidelines
          </p>
        </div>
        <Button onClick={handleCreateTemplate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </div>

      {errorMessage && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="py-3 text-sm text-red-700">
            {errorMessage}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {TEMPLATE_CATEGORIES.map(category => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map(template => {
          const CategoryIcon = getCategoryIcon(template.category)
          const canEdit = template.created_by === currentUser.id || currentUser.role === "admin"

          return (
            <Card key={template.id} className="relative group hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <CategoryIcon className="h-5 w-5 text-teal-400" />
                    <Badge variant={template.is_default ? "default" : "secondary"}>
                      {TEMPLATE_CATEGORIES.find(cat => cat.value === template.category)?.label}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-1">
                    {template.is_public ? (
                      <Globe className="h-4 w-4 text-[color:var(--green-status)]" aria-label="Public" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground" aria-label="Private" />
                    )}
                  </div>
                </div>
                <div>
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="text-sm">
                  <div className="flex items-center text-muted-foreground mb-2">
                    <List className="h-4 w-4 mr-1" />
                    {template.checklist_items.length} checklist items
                  </div>
                  <div className="space-y-1">
                    {template.checklist_items.slice(0, 3).map(item => (
                      <div key={item.id} className="flex items-center text-xs text-muted-foreground">
                        <CheckCircle className="h-3 w-3 mr-2" />
                        {item.label}
                      </div>
                    ))}
                    {template.checklist_items.length > 3 && (
                      <div className="text-xs text-muted-foreground pl-5">
                        +{template.checklist_items.length - 3} more items
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>Used {template.usage_count} times</span>
                  <span className="truncate">by {template.created_by_name || "Unknown"}</span>
                </div>

                <div className="flex flex-col gap-2 border-t pt-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleUseTemplate(template.id)}
                    disabled={busyTemplateId === template.id}
                    className="w-full sm:w-auto"
                  >
                    Use Template
                  </Button>
                  <div className="flex items-center justify-end space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDuplicateTemplate(template)}
                      title="Duplicate"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditTemplate(template)}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!template.is_default && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTemplate(template.id)}
                            title="Delete"
                            className="text-destructive hover:text-red-700"
                            disabled={busyTemplateId === template.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {filteredTemplates.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No templates found</h3>
              <p className="text-muted-foreground">
                {searchTerm || selectedCategory !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "Create your first template to get started"
                }
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Template Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate?.id ? "Edit Template" : "Create New Template"}
            </DialogTitle>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="template-name">Template Name</Label>
                  <Input
                    id="template-name"
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    placeholder="Enter template name"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="template-category">Category</Label>
                  <Select
                    value={editingTemplate.category}
                    onValueChange={(value) => setEditingTemplate({ ...editingTemplate, category: value })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_CATEGORIES.map(category => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  value={editingTemplate.description}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                  placeholder="Describe what this template is used for"
                  className="mt-2"
                />
              </div>

              <div className="flex flex-col items-start gap-3">
                <div className="flex items-start space-x-2">
                  <Switch
                    checked={editingTemplate.is_public}
                    onCheckedChange={(checked) => setEditingTemplate({ ...editingTemplate, is_public: checked })}
                  />
                  <Label className="leading-5">Make template public (visible to team)</Label>
                </div>
              </div>

              <Separator />

              {/* Checklist Items */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base font-medium">Checklist Items</Label>
                  <Button onClick={addChecklistItem} size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>
                <div className="space-y-3">
                  {editingTemplate.checklist_items.map((item, index) => (
                    <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 sm:flex-row sm:items-start sm:space-x-3 sm:gap-0">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={item.label}
                          onChange={(e) => updateChecklistItem(item.id, { label: e.target.value })}
                          placeholder="Checklist item"
                        />
                        <Input
                          value={item.description || ""}
                          onChange={(e) => updateChecklistItem(item.id, { description: e.target.value })}
                          placeholder="Optional description"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeChecklistItem(item.id)}
                        className="self-end text-destructive hover:text-red-700 sm:self-auto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Guidelines */}
              <div>
                <Label htmlFor="template-guidelines">Guidelines (Markdown)</Label>
                <Textarea
                  id="template-guidelines"
                  value={editingTemplate.guidelines}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, guidelines: e.target.value })}
                  placeholder="Provide detailed guidelines for using this template..."
                  rows={6}
                  className="mt-2 font-mono"
                />
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-3 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false)
                    setEditingTemplate(null)
                  }}
                  disabled={submitting}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveTemplate} disabled={submitting} className="w-full sm:w-auto">
                  {submitting
                    ? "Saving..."
                    : editingTemplate.id
                      ? "Update Template"
                      : "Create Template"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
