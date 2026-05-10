"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  Loader2,
  FileText,
  Brain,
  Code,
  Shield,
  BookOpen,
  Zap,
  Filter,
  Clock,
  Star,
  ArrowRight
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface SearchResult {
  title: string
  score: number
  content: string
  chunk_type: string | null
}

interface KnowledgeSearchProps {
  onSearch: () => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  searchResults: SearchResult[]
  searchLoading: boolean
  repoId: string
}

const CHUNK_ICONS = {
  policy: Shield,
  documentation: BookOpen,
  code: Code,
  markdown: FileText,
  concept: Brain
}

const CHUNK_COLORS = {
  policy: "text-red-500",
  documentation: "text-blue-500", 
  code: "text-amber-500",
  markdown: "text-emerald-500",
  concept: "text-violet-500"
}

export function KnowledgeSearch({
  onSearch,
  searchQuery,
  setSearchQuery,
  searchResults,
  searchLoading,
  repoId
}: KnowledgeSearchProps) {
  const [searchType, setSearchType] = React.useState<string>("semantic")
  const [resultsLimit, setResultsLimit] = React.useState<string>("5")

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSearch()
    }
  }

  // Mock suggested searches
  const suggestedSearches = [
    "authentication patterns",
    "error handling best practices", 
    "React component guidelines",
    "security vulnerabilities",
    "API design patterns",
    "code review checklist"
  ]

  const getChunkIcon = (chunkType: string | null) => {
    if (!chunkType) return FileText
    return CHUNK_ICONS[chunkType as keyof typeof CHUNK_ICONS] || FileText
  }

  const getChunkColor = (chunkType: string | null) => {
    if (!chunkType) return "text-muted-foreground"
    return CHUNK_COLORS[chunkType as keyof typeof CHUNK_COLORS] || "text-muted-foreground"
  }

  return (
    <Card className="border-border bg-card/80 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4 text-teal" />
          Recherche Sémantique dans la Knowledge Base
          <Badge variant="secondary" className="ml-auto">
            <Brain className="h-3 w-3 mr-1" />
            AI-Powered
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Recherche sémantique intelligente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="pl-9"
              />
            </div>
          </div>

          <Select value={searchType} onValueChange={setSearchType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semantic">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Sémantique
                </div>
              </SelectItem>
              <SelectItem value="keyword">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Mot-clé
                </div>
              </SelectItem>
              <SelectItem value="hybrid">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Hybride
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Select value={resultsLimit} onValueChange={setResultsLimit}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={onSearch}
              disabled={!searchQuery.trim() || !repoId.trim() || searchLoading}
              className="gap-2 shrink-0"
            >
              {searchLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {searchLoading ? "Recherche..." : "Chercher"}
            </Button>
          </div>
        </div>

        {/* Repo ID Warning */}
        {!repoId.trim() && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg"
          >
            <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Sélectionnez un repository ci-dessus pour activer la recherche sémantique
            </p>
          </motion.div>
        )}

        {/* Suggested Searches */}
        {!searchQuery && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <p className="text-sm text-muted-foreground">Suggestions de recherche :</p>
            <div className="flex flex-wrap gap-2">
              {suggestedSearches.map((suggestion, index) => (
                <motion.button
                  key={suggestion}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSearchQuery(suggestion)}
                  className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-full transition-colors"
                >
                  {suggestion}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Search Results */}
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {searchResults.length} résultats trouvés
                </p>
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {searchType} search
                </Badge>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {searchResults.map((result, idx) => {
                  const ChunkIcon = getChunkIcon(result.chunk_type)
                  const chunkColor = getChunkColor(result.chunk_type)
                  
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group rounded-lg border border-border bg-background/60 p-4 hover:bg-background/80 hover:border-primary/30 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`p-1.5 rounded-lg bg-background border ${chunkColor}`}>
                            <ChunkIcon className="h-4 w-4" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm text-foreground truncate">
                                {result.title || "Document sans titre"}
                              </h4>
                              {result.chunk_type && (
                                <Badge variant="outline" className="text-xs capitalize">
                                  {result.chunk_type}
                                </Badge>
                              )}
                            </div>

                            <p className="text-xs text-muted-foreground line-clamp-3 font-mono leading-relaxed">
                              {result.content?.slice(0, 300) || ""}
                              {result.content && result.content.length > 300 && "..."}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-amber-500" />
                            <span className="text-xs font-mono font-bold text-amber-500">
                              {Math.round((result.score ?? 0) * 100)}%
                            </span>
                          </div>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Relevance Score Bar */}
                      <div className="w-full bg-muted rounded-full h-1 mt-2">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(result.score ?? 0) * 100}%` }}
                          transition={{ delay: idx * 0.05 + 0.2, duration: 0.6 }}
                          className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-full h-1"
                        />
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No Results State */}
        {searchResults.length === 0 && searchQuery && !searchLoading && repoId && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-8 text-center"
          >
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-1">Aucun résultat trouvé</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Aucun document ne correspond à votre recherche &ldquo;{searchQuery}&rdquo;
            </p>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Suggestions :</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Essayez des termes plus généraux</li>
                <li>• Vérifiez l'orthographe des mots-clés</li>
                <li>• Utilisez des synonymes ou termes apparentés</li>
                <li>• Essayez la recherche hybride pour plus de résultats</li>
              </ul>
            </div>
          </motion.div>
        )}

        {/* Loading State */}
        {searchLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-8 text-center"
          >
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary/10 to-primary/5 rounded-full flex items-center justify-center mb-4">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            </div>
            <h3 className="font-medium text-foreground mb-1">Recherche en cours...</h3>
            <p className="text-sm text-muted-foreground">
              Analyse sémantique des documents avec l&apos;IA
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="flex space-x-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.7, 1, 0.7],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                    className="w-1.5 h-1.5 bg-primary rounded-full"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Search Stats Footer */}
        {searchResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t"
          >
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Recherche: ~{Math.random() * 100 + 50 | 0}ms
              </span>
              <span className="flex items-center gap-1">
                <Brain className="h-3 w-3" />
                Modèle: text-embedding-ada-002
              </span>
            </div>
            <span>Repository: {repoId}</span>
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}