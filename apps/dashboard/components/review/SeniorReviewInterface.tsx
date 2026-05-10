"use client"

import { useState, useEffect } from "react"
import { motion } from "motion/react"
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  CheckCircle, AlertTriangle, Shield, MessageSquare, Code, FileText,
  Clock, User, GitBranch, Info, XCircle, Send, Sparkles, Ban, AlertOctagon,
  Loader2, RefreshCw
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

// Export types for parent components
export interface AnalysisData {
  id: string
  repo: string
  branch: string
  pr_label: string
  author: string
  created_at: string
  status: string
  summary: {
    total_files: number
    additions: number
    deletions: number
    issues_found: number
    critical_issues: number
  }
  files: FileChange[]
}

export interface FileChange {
  path: string
  status: "added" | "modified" | "deleted"
  additions: number
  deletions: number
  diff: string
  suggestions: Suggestion[]
}

export interface Suggestion {
  line: number
  severity: "info" | "warning" | "error" | "critical"
  message: string
  category: string
}

interface SeniorReviewInterfaceProps {
  analysisId: string
  assignmentId?: string
  analysis?: AnalysisData | null
  loading?: boolean
  error?: string | null
  onRefresh?: () => void
}

export function SeniorReviewInterface({ 
  analysisId, 
  assignmentId,
  analysis: propAnalysis,
  loading: propLoading = false,
  error: propError = null,
  onRefresh
}: SeniorReviewInterfaceProps) {
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null)
  const [comment, setComment] = useState("")
  const [reviewComments, setReviewComments] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [blockDialogOpen, setBlockDialogOpen] = useState(false)
  const [blockReason, setBlockReason] = useState("")
  const [blockCategory, setBlockCategory] = useState<string>("security")

  // Set selected file when analysis changes
  useEffect(() => {
    if (propAnalysis?.files && propAnalysis.files.length > 0 && !selectedFile) {
      setSelectedFile(propAnalysis.files[0])
    }
  }, [propAnalysis, selectedFile])

  const handleAddComment = () => {
    if (comment.trim()) {
      setReviewComments([...reviewComments, comment])
      setComment("")
    }
  }

  const handleApprove = async () => {
    if (propAnalysis && propAnalysis.summary.critical_issues > 0) {
      const confirm = window.confirm(
        `Attention: Cette PR contient ${propAnalysis.summary.critical_issues} probleme(s) critique(s). Etes-vous sur de vouloir approuver ?`
      )
      if (!confirm) return
    }

    setSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    alert("Review approuvee ! Les modifications seront fusionnees.")
    setSubmitting(false)
  }

  const handleRequestChanges = async () => {
    if (reviewComments.length === 0) {
      alert("Veuillez ajouter des commentaires expliquant les modifications requises")
      return
    }
    setSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    alert("Modifications demandees ! Le developpeur doit repondre a vos commentaires avant la fusion.")
    setSubmitting(false)
  }

  const handleBlock = async () => {
    if (!blockReason.trim()) {
      alert("Veuillez fournir une raison pour bloquer cette PR")
      return
    }
    setSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    setBlockDialogOpen(false)
    alert(`PR BLOQUEE !\n\nCategorie: ${blockCategory}\nRaison: ${blockReason}\n\nLe developpeur ne peut pas fusionner tant que les problemes ne sont pas resolus.`)
    setSubmitting(false)
  }

  // Loading state
  if (propLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          <span className="ml-3 text-muted-foreground">Chargement de l'analyse...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (propError) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold text-red-700 dark:text-destructive mb-2">
                Erreur de chargement
              </h3>
              <p className="text-destructive mb-4">{propError}</p>
              {onRefresh && (
                <Button onClick={onRefresh} variant="outline" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Reessayer
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Empty state
  if (!propAnalysis) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-secondary-foreground mb-2">
                Aucune analyse disponible
              </h3>
              <p className="text-muted-foreground">
                L'analyse demandee n'a pas ete trouvee ou n'existe pas.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const hasCriticalIssues = propAnalysis.summary.critical_issues > 0

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header with Senior Reviewer Badge */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="card-heading text-foreground">Revue de Code</h1>
            <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-none">
              <Shield className="h-3 w-3 mr-1" />
              Reviewer Senior
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {propAnalysis.repo} - {propAnalysis.pr_label} par {propAnalysis.author}
          </p>
        </div>
        {assignmentId && (
          <Badge variant="outline" className="text-sm">
            Assignment: {assignmentId}
          </Badge>
        )}
      </motion.div>

      {/* Critical Issues Alert */}
      {hasCriticalIssues && (
        <Alert className="bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-800">
          <AlertOctagon className="h-5 w-5 text-destructive" />
          <AlertDescription className="text-red-900 dark:text-red-100">
            <strong>{propAnalysis.summary.critical_issues} Probleme(s) de Securite Critique(s) Detecte(s) !</strong>
            <br />
            En tant que Reviewer Senior, vous avez l'autorite de bloquer cette PR. Examinez attentivement avant d'approuver.
          </AlertDescription>
        </Alert>
      )}

      {/* Senior Reviewer Info */}
      <Alert className="bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800">
        <Shield className="h-4 w-4 text-purple-600" />
        <AlertDescription className="text-purple-900 dark:text-purple-100">
          <strong>Mode Reviewer Senior :</strong> Vous pouvez approuver, bloquer des PRs et demander des modifications obligatoires. 
          Utilisez le pouvoir de blocage de maniere responsable pour les problemes critiques de securite ou d'architecture.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Summary Card with Critical Issues */}
          <Card className={hasCriticalIssues ? "border-red-300 dark:border-red-800" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Resume des Modifications
                {hasCriticalIssues && (
                  <Badge variant="destructive" className="ml-2">
                    {propAnalysis.summary.critical_issues} Critique(s)
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-2xl font-bold text-foreground">
                    {propAnalysis.summary.total_files}
                  </div>
                  <div className="text-sm text-muted-foreground">Fichiers</div>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <div className="text-2xl font-bold text-[color:var(--green-status)]">
                    +{propAnalysis.summary.additions}
                  </div>
                  <div className="text-sm text-muted-foreground">Ajouts</div>
                </div>
                <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                  <div className="text-2xl font-bold text-destructive">
                    -{propAnalysis.summary.deletions}
                  </div>
                  <div className="text-sm text-muted-foreground">Suppressions</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                  <div className="text-2xl font-bold text-[color:var(--orange)]">
                    {propAnalysis.summary.issues_found}
                  </div>
                  <div className="text-sm text-muted-foreground">Problemes</div>
                </div>
                <div className="text-center p-3 bg-red-100 dark:bg-red-950/40 rounded-lg border-2 border-red-300 dark:border-red-800">
                  <div className="text-2xl font-bold text-red-700 dark:text-destructive">
                    {propAnalysis.summary.critical_issues}
                  </div>
                  <div className="text-sm text-red-700 dark:text-destructive font-semibold">Critiques</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Files Tabs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Fichiers Modifies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={selectedFile?.path} onValueChange={(path) => {
                const file = propAnalysis.files.find(f => f.path === path)
                if (file) setSelectedFile(file)
              }}>
                <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
                  {propAnalysis.files.map((file) => {
                    const hasCritical = file.suggestions.some(s => s.severity === "critical")
                    return (
                      <TabsTrigger key={file.path} value={file.path} className="flex items-center gap-2">
                        <Badge variant={
                          file.status === "added" ? "default" : 
                          file.status === "deleted" ? "destructive" : 
                          "secondary"
                        } className="text-xs">
                          {file.status === "added" ? "A" : file.status === "deleted" ? "D" : "M"}
                        </Badge>
                        {file.path.split("/").pop()}
                        {hasCritical && (
                          <AlertOctagon className="h-3 w-3 text-destructive ml-1" />
                        )}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>

                {propAnalysis.files.map((file) => (
                  <TabsContent key={file.path} value={file.path} className="mt-4">
                    <div className="space-y-4">
                      {/* File Info */}
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <div className="font-mono text-sm text-secondary-foreground">
                          {file.path}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-[color:var(--green-status)]">+{file.additions}</span>
                          <span className="text-destructive">-{file.deletions}</span>
                        </div>
                      </div>

                      {/* AI Suggestions with Severity */}
                      {file.suggestions.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-purple-500" />
                            Analyse Securite & Qualite
                          </h4>
                          {file.suggestions
                            .sort((a, b) => {
                              const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 }
                              return severityOrder[a.severity] - severityOrder[b.severity]
                            })
                            .map((suggestion, idx) => (
                            <Alert
                              key={idx}
                              className={
                                suggestion.severity === "critical" ? "border-red-500 bg-red-100 dark:bg-red-950/40 border-2" :
                                suggestion.severity === "error" ? "border-red-200 bg-red-50 dark:bg-red-950/20" :
                                suggestion.severity === "warning" ? "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20" :
                                "border-blue-200 bg-blue-50 dark:bg-blue-950/20"
                              }
                            >
                              <div className="flex items-start gap-2">
                                {suggestion.severity === "critical" && <AlertOctagon className="h-5 w-5 text-destructive mt-0.5" />}
                                {suggestion.severity === "error" && <XCircle className="h-5 w-5 text-destructive mt-0.5" />}
                                {suggestion.severity === "warning" && <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />}
                                {suggestion.severity === "info" && <Info className="h-5 w-5 text-blue-500 mt-0.5" />}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge 
                                      variant={suggestion.severity === "critical" ? "destructive" : "outline"}
                                      className={suggestion.severity === "critical" ? "font-bold" : ""}
                                    >
                                      {suggestion.category}
                                    </Badge>
                                    {suggestion.severity === "critical" && (
                                      <Badge variant="destructive">CRITICAL</Badge>
                                    )}
                                  </div>
                                  <AlertDescription className="text-sm">
                                    <strong>Line {suggestion.line}:</strong> {suggestion.message}
                                  </AlertDescription>
                                </div>
                              </div>
                            </Alert>
                          ))}
                        </div>
                      )}

                      {/* Diff View */}
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                        <pre className="text-sm font-mono whitespace-pre-wrap">
                          {file.diff}
                        </pre>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Review Actions */}
        <div className="space-y-4">
          {/* Review Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details de la Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Branche :</span>
                <span className="font-mono font-medium">{propAnalysis.branch}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Auteur :</span>
                <span className="font-medium">{propAnalysis.author}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Cree le :</span>
                <span className="font-medium">
                  {new Date(propAnalysis.created_at).toLocaleDateString("fr-FR")}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Add Comment */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Ajouter un Commentaire
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Fournissez un feedback detaille..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <Button
                onClick={handleAddComment}
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!comment.trim()}
              >
                <Send className="h-4 w-4 mr-2" />
                Ajouter le Commentaire
              </Button>

              {reviewComments.length > 0 && (
                <div className="mt-4 space-y-2">
                  <Separator />
                  <h4 className="text-sm font-semibold">Vos Commentaires ({reviewComments.length})</h4>
                  <ScrollArea className="h-32 rounded-md border p-2">
                    {reviewComments.map((c, idx) => (
                      <div key={idx} className="mb-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm">
                        {c}
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Senior Action Buttons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-500" />
                Actions Reviewer Senior
              </CardTitle>
              <CardDescription>
                Vous avez l'autorite complete de review
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={handleApprove}
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={submitting}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approuver & Fusionner
              </Button>

              <Button
                onClick={handleRequestChanges}
                variant="outline"
                className="w-full"
                disabled={submitting || reviewComments.length === 0}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Demander des Modifications
              </Button>

              <Separator />

              <Button
                onClick={() => setBlockDialogOpen(true)}
                variant="destructive"
                className="w-full"
                disabled={submitting}
              >
                <Ban className="h-4 w-4 mr-2" />
                Bloquer cette PR
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Utilisez le blocage pour les problemes critiques de securite, legaux ou architecturaux
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Block Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="h-5 w-5" />
              Bloquer la Pull Request
            </DialogTitle>
            <DialogDescription>
              Cela empechera la fusion de la PR jusqu'a ce que les problemes soient resolus. Fournissez une raison claire.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Categorie de Blocage</Label>
              <RadioGroup value={blockCategory} onValueChange={setBlockCategory}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="security" id="security" />
                  <Label htmlFor="security" className="font-normal cursor-pointer">
                    Vulnerabilite de Securite
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="architecture" id="architecture" />
                  <Label htmlFor="architecture" className="font-normal cursor-pointer">
                    Violation d'Architecture
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="performance" id="performance" />
                  <Label htmlFor="performance" className="font-normal cursor-pointer">
                    Probleme de Performance Critique
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="legal" id="legal" />
                  <Label htmlFor="legal" className="font-normal cursor-pointer">
                    Probleme Legal/Conformite
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="other" id="other" />
                  <Label htmlFor="other" className="font-normal cursor-pointer">
                    Autre Probleme Critique
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Raison Detaillee *</Label>
              <Textarea
                id="reason"
                placeholder="Expliquez pourquoi cette PR doit etre bloquee..."
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>
            <Alert className="bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800">
              <AlertOctagon className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-sm text-red-900 dark:text-red-100">
                Le developpeur sera notifie immediatement et devra resoudre tous les problemes avant de soumettre a nouveau.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              Annuler
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleBlock}
              disabled={!blockReason.trim() || submitting}
            >
              <Ban className="h-4 w-4 mr-2" />
              Bloquer la PR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
