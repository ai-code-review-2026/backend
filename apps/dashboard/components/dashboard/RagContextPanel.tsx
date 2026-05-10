"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, Database, FileCode2, BookOpen, Tag } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { DashboardRagChunkReference } from "@/lib/dashboard-analysis-details"

interface RagContextPanelProps {
  ragContext: DashboardRagChunkReference[]
  ragContextChunksCount: number
  ragRetrievalMode: string | null
}

function chunkTypeIcon(chunkType: string | null) {
  if (chunkType === "function" || chunkType === "class" || chunkType === "symbol") {
    return <FileCode2 className="h-3.5 w-3.5 text-blue-500" />
  }
  if (chunkType === "document" || chunkType === "markdown" || chunkType === "pdf") {
    return <BookOpen className="h-3.5 w-3.5 text-purple-500" />
  }
  return <Database className="h-3.5 w-3.5 text-muted-foreground" />
}

function scoreColor(score: number | null): string {
  if (score === null) return "bg-gray-200 text-gray-700"
  if (score >= 0.8) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
  if (score >= 0.6) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
  return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
}

export function RagContextPanel({ ragContext, ragContextChunksCount, ragRetrievalMode }: RagContextPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (ragContext.length === 0 && ragContextChunksCount === 0) {
    return null
  }

  const displayedChunks = ragContext.slice(0, 15)

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
      <Card variant="glass" className="border-teal-500/30">
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              <span>Sources RAG utilisées</span>
              <Badge variant="secondary" className="text-xs font-mono">
                {ragContextChunksCount} chunk{ragContextChunksCount !== 1 ? "s" : ""}
              </Badge>
              {ragRetrievalMode && (
                <Badge variant="outline" className="text-xs">
                  {ragRetrievalMode}
                </Badge>
              )}
            </div>
            <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </motion.div>
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-1">
            Documents et chunks de code récupérés depuis la Knowledge Base pour contextualiser l&apos;analyse.
          </p>
        </CardHeader>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="rag-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ overflow: "hidden" }}
            >
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {displayedChunks.map((chunk, idx) => (
                    <motion.div
                      key={`${chunk.path}-${idx}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="flex items-start gap-3 p-3 rounded-lg bg-card-inner border border-border hover:border-teal-500/40 transition-colors"
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {chunkTypeIcon(chunk.chunkType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-secondary-foreground truncate max-w-[240px]">
                            {chunk.title ?? chunk.path ?? "unknown"}
                          </span>
                          {chunk.score !== null && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${scoreColor(chunk.score)}`}>
                              {(chunk.score * 100).toFixed(0)}%
                            </span>
                          )}
                          {chunk.chunkType && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {chunk.chunkType}
                            </Badge>
                          )}
                        </div>
                        {chunk.path && chunk.title && chunk.path !== chunk.title && (
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {chunk.path}
                          </p>
                        )}
                        {chunk.symbolName && (
                          <p className="text-xs text-teal-400 font-mono">
                            {chunk.symbolName}
                          </p>
                        )}
                        {chunk.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {chunk.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                              >
                                <Tag className="h-2.5 w-2.5" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {chunk.source && (
                        <span className="flex-shrink-0 text-xs text-muted-foreground hidden sm:block">
                          {chunk.source}
                        </span>
                      )}
                    </motion.div>
                  ))}

                  {ragContext.length > 15 && (
                    <p className="text-xs text-center text-muted-foreground pt-1">
                      ...et {ragContext.length - 15} autre(s) chunk(s) non affichés
                    </p>
                  )}

                  {ragContext.length === 0 && ragContextChunksCount > 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {ragContextChunksCount} chunk(s) utilisés — détails non disponibles dans cette réponse.
                    </p>
                  )}
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}
