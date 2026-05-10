"use client"

import { motion } from "framer-motion"
import { CheckCircle, AlertTriangle, Info, XCircle, Code } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export interface CodeSuggestion {
  line: number
  severity: "error" | "warning" | "info"
  title: string
  description: string
}

interface InlineCodeReviewProps {
  suggestions: CodeSuggestion[]
  filename?: string
  prNumber?: string
  codeLines?: string[]
  duration?: number
  loading?: boolean
}

export function InlineCodeReview({ 
  suggestions, 
  filename = "code.ts",
  prNumber,
  codeLines = [],
  duration,
  loading 
}: InlineCodeReviewProps) {
  const issueCount = suggestions.length

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Analyse du code en cours...</p>
          </div>
        </Card>
        <Card className="p-8 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
            <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
          </div>
        </Card>
      </div>
    )
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
              <span className="ml-2 font-mono text-sm font-medium text-gray-700">
                {filename}
              </span>
              {prNumber && <Badge className="ml-auto bg-blue-600 text-white">PR #{prNumber}</Badge>}
            </div>
          </div>
          <div className="bg-gray-50 p-6">
            {codeLines.length > 0 ? (
              codeLines.map((line, idx) => (
                <div key={idx} className="mb-2 flex gap-3 font-mono text-sm">
                  <span className="w-8 text-right text-muted-foreground">{idx + 1}</span>
                  <span className="text-gray-700">{line}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <Code className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Aucun code a afficher</p>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-[color:var(--green-status)]" />
              <h3 className="font-semibold text-foreground">Aucun probleme</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Le code ne presente aucun probleme detecte</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Code Section */}
      <Card className="overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-400" />
            <div className="h-3 w-3 rounded-full bg-yellow-400" />
            <div className="h-3 w-3 rounded-full bg-green-400" />
            <span className="ml-2 font-mono text-sm font-medium text-gray-700">
              {filename}
            </span>
            {prNumber && <Badge className="ml-auto bg-blue-600 text-white">PR #{prNumber}</Badge>}
          </div>
        </div>

        <div className="bg-gray-50 p-6 font-mono text-sm">
          {codeLines.length > 0 ? (
            codeLines.map((line, idx) => {
              const lineNumber = idx + 1
              const suggestion = suggestions.find(s => s.line === lineNumber)
              const bgClass = suggestion 
                ? suggestion.severity === "error" ? "bg-red-50" 
                : suggestion.severity === "warning" ? "bg-amber-50" 
                : "bg-blue-50"
                : ""
              
              return (
                <div key={idx} className={`mb-2 flex gap-3 rounded ${bgClass}`}>
                  <span className="w-8 text-right text-muted-foreground">{lineNumber}</span>
                  <span className="flex-1 text-gray-700">{line}</span>
                  {suggestion && (
                    suggestion.severity === "error" ? <AlertTriangle className="h-4 w-4 text-destructive" />
                    : suggestion.severity === "warning" ? <Info className="h-4 w-4 text-[color:var(--orange)]" />
                    : <Info className="h-4 w-4 text-blue-500" />
                  )}
                </div>
              )
            })
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              Aucune ligne de code disponible
            </div>
          )}
        </div>
      </Card>

      {/* Suggestions Panel */}
      <Card>
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-teal-400" />
            <h3 className="font-semibold text-foreground">Revue terminee</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {issueCount} probleme{issueCount > 1 ? "s" : ""} detecte{issueCount > 1 ? "s" : ""}
            {duration && ` · ${duration}s`}
          </p>
        </div>

        <div className="space-y-4 p-6">
          {suggestions.map((suggestion, index) => {
            const isError = suggestion.severity === "error"
            const isWarning = suggestion.severity === "warning"
            
            const bgClass = isError ? "border-red-200 bg-red-50" 
              : isWarning ? "border-amber-200 bg-amber-50" 
              : "border-blue-200 bg-blue-50"
            
            const iconClass = isError ? "text-destructive" 
              : isWarning ? "text-[color:var(--orange)]" 
              : "text-teal-400"
            
            const textClass = isError ? "text-red-900" 
              : isWarning ? "text-amber-900" 
              : "text-blue-900"
            
            const descClass = isError ? "text-red-800" 
              : isWarning ? "text-amber-800" 
              : "text-blue-800"

            const Icon = isError ? XCircle : isWarning ? AlertTriangle : Info

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className={`rounded-lg border p-4 ${bgClass}`}
              >
                <div className="mb-2 flex items-start gap-2">
                  <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${iconClass}`} />
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge 
                        variant={isError ? "destructive" : "secondary"}
                        className={`text-xs font-bold ${!isError ? (isWarning ? "bg-amber-600 text-white" : "bg-blue-600 text-white") : ""}`}
                      >
                        {suggestion.title}
                      </Badge>
                      <span className={`text-sm font-semibold ${textClass}`}>
                        Ligne {suggestion.line}
                      </span>
                    </div>
                    <p className={`text-sm ${descClass}`}>
                      {suggestion.description}
                    </p>
                    {isError && (
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          Voir les details
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          Ignorer
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
