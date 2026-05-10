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
  CheckCircle, AlertTriangle, Star, MessageSquare, Code, FileText,
  Clock, User, GitBranch, Info, ArrowUp, Send, Sparkles, Loader2, RefreshCw
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"

// Export types for parent components
export interface JuniorAnalysisData {
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
  }
  files: JuniorFileChange[]
}

export interface JuniorFileChange {
  path: string
  status: "added" | "modified" | "deleted"
  additions: number
  deletions: number
  diff: string
  suggestions: JuniorSuggestion[]
}

export interface JuniorSuggestion {
  line: number
  severity: "info" | "warning" | "error"
  message: string
  category: string
}

interface JuniorReviewInterfaceProps {
  analysisId: string
  assignmentId?: string
  analysis?: JuniorAnalysisData | null
  loading?: boolean
  error?: string | null
  onRefresh?: () => void
}

export function JuniorReviewInterface({ 
  analysisId, 
  assignmentId,
  analysis: propAnalysis,
  loading: propLoading = false,
  error: propError = null,
  onRefresh
}: JuniorReviewInterfaceProps) {
  const [selectedFile, setSelectedFile] = useState<JuniorFileChange | null>(null)
  const [comment, setComment] = useState("")
  const [reviewComments, setReviewComments] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

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
    setSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    alert("Review approuvee ! Le developpeur sera notifie.")
    setSubmitting(false)
  }

  const handleSuggestChanges = async () => {
    if (reviewComments.length === 0) {
      alert("Veuillez ajouter au moins un commentaire avant de suggerer des modifications")
      return
    }
    setSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    alert("Suggestions envoyees ! Le developpeur examinera vos commentaires.")
    setSubmitting(false)
  }

  const handleEscalate = async () => {
    setSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    alert("Review escaladee vers un reviewer senior !")
    setSubmitting(false)
  }

  // Loading state
  if (propLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
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

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header with Junior Reviewer Badge */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="card-heading text-foreground">Revue de Code</h1>
            <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-none">
              <Star className="h-3 w-3 mr-1" />
              Reviewer Junior
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {propAnalysis.repo} - {propAnalysis.pr_label} par {propAnalysis.author}
          </p>
        </div>
        {assignmentId && (
          <Badge variant="outline" className="text-sm">
            Assignation: {assignmentId}
          </Badge>
        )}
      </motion.div>

      {/* Junior Reviewer Info Alert */}
      <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
        <Info className="h-4 w-4 text-teal-400" />
        <AlertDescription className="text-blue-900 dark:text-blue-100">
          <strong>Mode Reviewer Junior :</strong> Vous pouvez approuver les modifications et suggerer des ameliorations. 
          Si vous trouvez des problemes critiques, utilisez le bouton &quot;Escalader vers Senior&quot;.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Resume des Modifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-2xl font-bold text-foreground">
                    {propAnalysis.summary.total_files}
                  </div>
                  <div className="text-sm text-muted-foreground">Fichiers Modifies</div>
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
                  <div className="text-sm text-muted-foreground">Problemes Trouves</div>
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
                <TabsList className="w-full justify-start overflow-x-auto">
                  {propAnalysis.files.map((file) => (
                    <TabsTrigger key={file.path} value={file.path} className="flex items-center gap-2">
                      <Badge variant={
                        file.status === "added" ? "default" : 
                        file.status === "deleted" ? "destructive" : 
                        "secondary"
                      } className="text-xs">
                        {file.status === "added" ? "A" : file.status === "deleted" ? "D" : "M"}
                      </Badge>
                      {file.path.split("/").pop()}
                    </TabsTrigger>
                  ))}
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

                      {/* AI Suggestions */}
                      {file.suggestions.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-purple-500" />
                            Analyse IA
                          </h4>
                          {file.suggestions.map((suggestion, idx) => (
                            <Alert
                              key={idx}
                              className={
                                suggestion.severity === "error" ? "border-red-200 bg-red-50 dark:bg-red-950/20" :
                                suggestion.severity === "warning" ? "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20" :
                                "border-blue-200 bg-blue-50 dark:bg-blue-950/20"
                              }
                            >
                              <Badge variant="outline" className="mb-2">
                                {suggestion.category}
                              </Badge>
                              <AlertDescription className="text-sm">
                                <strong>Line {suggestion.line}:</strong> {suggestion.message}
                              </AlertDescription>
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
                placeholder="Partagez vos reflexions ou suggestions..."
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

              {/* Review Comments List */}
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

          {/* Action Buttons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Actions de Review</CardTitle>
              <CardDescription>
                Choisissez une action pour cette review
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={handleApprove}
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={submitting}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approuver les Modifications
              </Button>

              <Button
                onClick={handleSuggestChanges}
                variant="outline"
                className="w-full"
                disabled={submitting || reviewComments.length === 0}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Suggerer des Modifications
              </Button>

              <Separator />

              <Button
                onClick={handleEscalate}
                variant="outline"
                className="w-full text-[color:var(--orange)] border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                disabled={submitting}
              >
                <ArrowUp className="h-4 w-4 mr-2" />
                Escalader vers Senior
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Escaladez si vous trouvez des problemes critiques de securite ou d'architecture
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
