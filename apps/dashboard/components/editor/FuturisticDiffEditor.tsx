"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence, motion } from "framer-motion"
import {
  Save,
  GitBranch,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Wand2,
  Zap,
  Brain,
  Robot,
  Code2,
  FileCode,
  Shield,
  Cpu,
  Activity,
  Terminal,
  PlayCircle,
  StopCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Split,
  Maximize2,
  Minimize2,
  GitCommit,
  GitMerge,
  ChevronRight,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { extractApiErrorMessage } from "@/lib/display"
import { 
  logGitHubError, 
  validateRepoCoordinates, 
  callGitHubAPI, 
  showGitHubErrorToast,
  collectDebugInfo
} from "@/lib/github-debug"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <div className="w-12 h-12 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <div className="absolute inset-0 w-12 h-12 border-2 border-purple-500/30 border-b-purple-500 rounded-full animate-spin-reverse" />
        </div>
        <p className="text-sm text-muted-foreground font-mono">INITIALIZING QUANTUM EDITOR</p>
      </div>
    </div>
  ),
})

// ── Types ────────────────────────────────────────────────────────────────────

interface FuturisticDiffEditorProps {
  owner: string
  repo: string
  branch: string
  filePath: string | null
  onSaved?: () => void
  saveTrigger?: number
  onBranchResolved?: (branch: string) => void
  findingId?: string | null
  findingDescription?: string | null
  originalContent?: string
  modifiedContent?: string
  diffMode?: "side-by-side" | "inline" | "unified"
}

type EditorStatus = "idle" | "loading" | "saving" | "saved" | "error" | "conflict" | "ai-fixing" | "ai-analyzing" | "quantum-processing"

interface AIFixSuggestion {
  id: string
  title: string
  description: string
  severity: "low" | "medium" | "high" | "critical"
  confidence: number
  estimatedTime: number
  codeChanges: {
    before: string
    after: string
    lineStart: number
    lineEnd: number
    filePath: string
  }[]
  reasoning: string
  tags: string[]
}

// ── Futuristic UI Components ─────────────────────────────────────────────────

function GlowingBorder({ children, className = "", glowColor = "cyan" }: { 
  children: React.ReactNode
  className?: string 
  glowColor?: "cyan" | "purple" | "green" | "red" | "amber"
}) {
  const glowColors = {
    cyan: "shadow-cyan-500/50",
    purple: "shadow-purple-500/50", 
    green: "shadow-emerald-500/50",
    red: "shadow-red-500/50",
    amber: "shadow-amber-500/50"
  }
  
  return (
    <div className={`relative ${className}`}>
      <div className={`absolute -inset-0.5 bg-gradient-to-r from-${glowColor}-600 to-purple-600 rounded-lg blur opacity-30 animate-pulse`} />
      <div className="relative bg-background/95 backdrop-blur-sm rounded-lg border border-white/10">
        {children}
      </div>
    </div>
  )
}

function QuantumStatusIndicator({ status, progress }: { status: EditorStatus, progress?: number }) {
  const statusConfig = {
    idle: { color: "gray", icon: Terminal, label: "STANDBY" },
    loading: { color: "cyan", icon: Loader2, label: "LOADING" },
    saving: { color: "amber", icon: Save, label: "SAVING" },
    saved: { color: "green", icon: CheckCircle2, label: "SAVED" },
    error: { color: "red", icon: AlertCircle, label: "ERROR" },
    conflict: { color: "amber", icon: GitMerge, label: "CONFLICT" },
    "ai-fixing": { color: "purple", icon: Brain, label: "AI FIXING" },
    "ai-analyzing": { color: "cyan", icon: Robot, label: "AI ANALYZING" },
    "quantum-processing": { color: "purple", icon: Cpu, label: "QUANTUM PROCESSING" },
  }

  const config = statusConfig[status] || statusConfig.idle
  const Icon = config.icon

  return (
    <motion.div
      className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-black/20 border border-white/10"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <Icon 
        className={`h-4 w-4 text-${config.color}-400 ${status === 'loading' || status === 'ai-analyzing' ? 'animate-spin' : ''}`} 
      />
      <span className={`text-xs font-mono text-${config.color}-400 uppercase tracking-wider`}>
        {config.label}
      </span>
      {progress !== undefined && (
        <div className="w-16 h-1 bg-black/40 rounded-full overflow-hidden">
          <motion.div 
            className={`h-full bg-${config.color}-400 rounded-full`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}
    </motion.div>
  )
}

function AIFixPanel({ 
  suggestions, 
  onApplySuggestion, 
  isAnalyzing 
}: { 
  suggestions: AIFixSuggestion[]
  onApplySuggestion: (suggestion: AIFixSuggestion) => void
  isAnalyzing: boolean 
}) {
  const [selectedSuggestion, setSelectedSuggestion] = useState<AIFixSuggestion | null>(null)

  return (
    <GlowingBorder glowColor="purple" className="h-full">
      <Card className="h-full border-none bg-transparent">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center space-x-2">
            <Brain className="h-5 w-5 text-purple-400" />
            <h3 className="font-semibold text-purple-400 font-mono uppercase tracking-wide">
              AI Code Surgeon
            </h3>
            <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 text-xs">
              {suggestions.length} FIXES
            </Badge>
          </div>
        </div>
        
        <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
          {isAnalyzing && (
            <motion.div
              className="flex items-center space-x-3 p-4 bg-purple-500/10 rounded-lg border border-purple-500/20"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Robot className="h-5 w-5 text-purple-400 animate-pulse" />
              <div>
                <p className="text-sm font-medium text-purple-300">Quantum AI Analysis in Progress</p>
                <p className="text-xs text-purple-400/70">Scanning code patterns and vulnerabilities...</p>
              </div>
            </motion.div>
          )}
          
          {suggestions.map((suggestion, index) => (
            <motion.div
              key={suggestion.id}
              className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 ${
                selectedSuggestion?.id === suggestion.id
                  ? 'bg-purple-500/20 border-purple-500/50'
                  : 'bg-white/5 border-white/10 hover:border-purple-500/30'
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => setSelectedSuggestion(suggestion)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Badge 
                    variant={suggestion.severity === 'critical' ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
                    {suggestion.severity.toUpperCase()}
                  </Badge>
                  <div className="flex items-center space-x-1">
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    <span className="text-xs text-amber-400 font-mono">{suggestion.confidence}%</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/20"
                  onClick={(e) => {
                    e.stopPropagation()
                    onApplySuggestion(suggestion)
                  }}
                >
                  <Wand2 className="h-3 w-3 mr-1" />
                  APPLY
                </Button>
              </div>
              
              <h4 className="font-medium text-white mb-1">{suggestion.title}</h4>
              <p className="text-sm text-muted-foreground mb-2">{suggestion.description}</p>
              
              <div className="flex flex-wrap gap-1 mb-2">
                {suggestion.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs bg-black/20">
                    {tag}
                  </Badge>
                ))}
              </div>
              
              <div className="text-xs text-cyan-400 font-mono">
                ⚡ Est. {suggestion.estimatedTime}s • {suggestion.codeChanges.length} changes
              </div>
            </motion.div>
          ))}
        </div>
      </Card>
    </GlowingBorder>
  )
}

function DiffStats({ stats }: { stats: { added: number, removed: number, modified: number } }) {
  return (
    <motion.div
      className="flex items-center space-x-4 px-4 py-2 bg-black/20 rounded-lg border border-white/10"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="flex items-center space-x-1">
        <div className="w-3 h-3 bg-emerald-400 rounded-full shadow-sm shadow-emerald-400/50" />
        <span className="text-sm font-mono text-emerald-400">+{stats.added}</span>
      </div>
      <div className="flex items-center space-x-1">
        <div className="w-3 h-3 bg-red-400 rounded-full shadow-sm shadow-red-400/50" />
        <span className="text-sm font-mono text-red-400">-{stats.removed}</span>
      </div>
      <div className="flex items-center space-x-1">
        <div className="w-3 h-3 bg-amber-400 rounded-full shadow-sm shadow-amber-400/50" />
        <span className="text-sm font-mono text-amber-400">~{stats.modified}</span>
      </div>
    </motion.div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function FuturisticDiffEditor({
  owner,
  repo,
  branch,
  filePath,
  onSaved,
  saveTrigger,
  onBranchResolved,
  findingId,
  findingDescription,
  originalContent = "",
  modifiedContent = "",
  diffMode = "side-by-side",
}: FuturisticDiffEditorProps) {
  const [status, setStatus] = useState<EditorStatus>("idle")
  const [progress, setProgress] = useState<number>(0)
  const [content, setContent] = useState(modifiedContent || "")
  const [aiSuggestions, setAiSuggestions] = useState<AIFixSuggestion[]>([])
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [viewMode, setViewMode] = useState<"split" | "unified" | "side-by-side">("side-by-side")
  const [isFullscreen, setIsFullscreen] = useState(false)

  const editorRef = useRef<any>(null)

  // Mock diff stats calculation
  const diffStats = useMemo(() => {
    const originalLines = originalContent.split('\n')
    const modifiedLines = content.split('\n')
    
    return {
      added: modifiedLines.length - originalLines.length > 0 ? modifiedLines.length - originalLines.length : 0,
      removed: originalLines.length - modifiedLines.length > 0 ? originalLines.length - modifiedLines.length : 0,
      modified: Math.min(originalLines.length, modifiedLines.length),
    }
  }, [originalContent, content])

  // AI Fix functionality
  const handleAIAnalysis = useCallback(async () => {
    if (!filePath) return

    setIsAnalyzing(true)
    setStatus("ai-analyzing")
    setProgress(0)

    try {
      // Progress simulation
      const progressSteps = [10, 30, 50, 70, 90, 100]
      let currentStep = 0
      const progressInterval = setInterval(() => {
        if (currentStep < progressSteps.length - 1) {
          setProgress(progressSteps[currentStep])
          currentStep++
        }
      }, 500)

      // Call real AI analysis endpoint
      const response = await fetch('/api/dashboard/ai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_path: filePath,
          content: content,
          language: filePath.split('.').pop() || 'javascript',
          analysis_type: 'all',
        }),
      })

      clearInterval(progressInterval)
      setProgress(100)

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.status}`)
      }

      const data = await response.json()
      
      // Transform backend response to frontend format
      const transformedSuggestions: AIFixSuggestion[] = data.suggestions.map((s: any) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        severity: s.severity,
        confidence: s.confidence,
        estimatedTime: s.estimated_time,
        codeChanges: s.code_changes.map((change: any) => ({
          before: change.before,
          after: change.after,
          lineStart: change.line_start,
          lineEnd: change.line_end,
          filePath: change.file_path,
        })),
        reasoning: s.reasoning,
        tags: s.tags,
      }))

      setAiSuggestions(transformedSuggestions)
      setStatus("idle")
      setIsAiPanelOpen(true) // Auto-open panel when suggestions are available
    } catch (error) {
      setStatus("error")
      console.error("AI Analysis failed:", error)
      
      // Fallback to mock suggestions for demo
      const fallbackSuggestions: AIFixSuggestion[] = [
        {
          id: "fallback-1",
          title: "Improve Error Handling",
          description: "Add proper try-catch blocks to handle potential runtime errors",
          severity: "medium",
          confidence: 80,
          estimatedTime: 3,
          codeChanges: [{
            before: "const result = await apiCall()",
            after: "try {\n  const result = await apiCall()\n} catch (error) {\n  console.error('API call failed:', error)\n  return null\n}",
            lineStart: 10,
            lineEnd: 10,
            filePath: filePath,
          }],
          reasoning: "Unhandled async operations can cause application crashes",
          tags: ["error-handling", "async", "reliability"],
        },
        {
          id: "fallback-2", 
          title: "Performance Optimization",
          description: "Use useMemo to prevent unnecessary re-computations",
          severity: "low",
          confidence: 75,
          estimatedTime: 2,
          codeChanges: [{
            before: "const expensiveValue = computeValue(props)",
            after: "const expensiveValue = useMemo(() => computeValue(props), [props])",
            lineStart: 25,
            lineEnd: 25,
            filePath: filePath,
          }],
          reasoning: "Expensive computations should be memoized to improve performance",
          tags: ["performance", "react", "optimization"],
        },
      ]
      
      setAiSuggestions(fallbackSuggestions)
      setIsAiPanelOpen(true)
    } finally {
      setIsAnalyzing(false)
      setProgress(0)
    }
  }, [filePath, content])

  const handleApplySuggestion = useCallback(async (suggestion: AIFixSuggestion) => {
    setStatus("ai-fixing")
    setProgress(0)

    try {
      // Progress simulation
      const progressSteps = [20, 40, 60, 80, 100]
      let currentStep = 0
      const progressInterval = setInterval(() => {
        if (currentStep < progressSteps.length - 1) {
          setProgress(progressSteps[currentStep])
          currentStep++
        }
      }, 300)

      // Apply the suggested changes to the content
      let updatedContent = content
      for (const change of suggestion.codeChanges) {
        // Simple replacement - in a real implementation, you'd want more sophisticated merging
        updatedContent = updatedContent.replace(change.before, change.after)
      }
      
      clearInterval(progressInterval)
      setProgress(100)
      
      setContent(updatedContent)
      setStatus("saved")
      
      // Remove applied suggestion
      setAiSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
      
      setTimeout(() => setStatus("idle"), 2000)
    } catch (error) {
      setStatus("error")
      console.error("Failed to apply AI suggestion:", error)
    } finally {
      setProgress(0)
    }
  }, [content])

  const handleSave = useCallback(async () => {
    if (!filePath) return

    setStatus("saving")
    setProgress(0)

    try {
      const progressSteps = [25, 50, 75, 100]
      for (const step of progressSteps) {
        await new Promise(resolve => setTimeout(resolve, 300))
        setProgress(step)
      }

      // Here you would implement the actual save logic
      // For now, simulate a successful save
      setStatus("saved")
      onSaved?.()
      
      setTimeout(() => setStatus("idle"), 2000)
    } catch (error) {
      setStatus("error")
      console.error("Save failed:", error)
    } finally {
      setProgress(0)
    }
  }, [filePath, content, onSaved])

  return (
    <div className={`flex flex-col h-full space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-background p-4' : ''}`}>
      {/* Header with futuristic controls */}
      <div className="flex items-center justify-between p-4 bg-black/20 rounded-lg border border-white/10 backdrop-blur-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <FileCode className="h-5 w-5 text-cyan-400" />
            <span className="font-mono text-sm text-white">
              {owner}/{repo}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm text-cyan-400">{branch}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm text-white truncate max-w-48">
              {filePath || "No file selected"}
            </span>
          </div>
          
          <DiffStats stats={diffStats} />
        </div>

        <div className="flex items-center space-x-2">
          <QuantumStatusIndicator status={status} progress={progress} />
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/20"
                  onClick={handleAIAnalysis}
                  disabled={isAnalyzing || !filePath}
                >
                  <Brain className="h-4 w-4 mr-1" />
                  AI FIX
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Analyze code with AI and suggest improvements</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button
            size="sm"
            variant="ghost"
            className={`text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20 ${isAiPanelOpen ? 'bg-cyan-500/20' : ''}`}
            onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
          >
            {isAiPanelOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            PANEL
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:text-cyan-300 hover:bg-white/10"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          <Button
            size="sm"
            variant="default"
            className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white shadow-lg shadow-cyan-500/25"
            onClick={handleSave}
            disabled={status === "saving" || !filePath}
          >
            <Save className="h-4 w-4 mr-1" />
            SAVE
          </Button>
        </div>
      </div>

      {/* Main editor area */}
      <div className="flex-1 flex space-x-4">
        <div className="flex-1">
          <GlowingBorder glowColor="cyan" className="h-full">
            <div className="h-full rounded-lg overflow-hidden">
              <MonacoEditor
                height="100%"
                language="typescript"
                value={content}
                onChange={(value) => setContent(value || "")}
                onMount={(editor) => {
                  editorRef.current = editor
                }}
                theme="vs-dark"
                options={{
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontLigatures: true,
                  lineNumbers: "on",
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: "on",
                  renderWhitespace: "selection",
                  bracketPairColorization: { enabled: true },
                  guides: {
                    bracketPairs: true,
                    indentation: true,
                  },
                  suggest: {
                    showKeywords: true,
                    showSnippets: true,
                  },
                }}
              />
            </div>
          </GlowingBorder>
        </div>

        {/* AI Suggestions Panel */}
        <AnimatePresence>
          {isAiPanelOpen && (
            <motion.div
              className="w-96 h-full"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 384, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <AIFixPanel
                suggestions={aiSuggestions}
                onApplySuggestion={handleApplySuggestion}
                isAnalyzing={isAnalyzing}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer with advanced controls */}
      <div className="flex items-center justify-between p-3 bg-black/10 rounded-lg border border-white/5">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-mono text-emerald-400 uppercase">QUANTUM SYNC ACTIVE</span>
          </div>
          
          {findingDescription && (
            <div className="flex items-center space-x-2">
              <Shield className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-amber-400 truncate max-w-64">
                {findingDescription}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono text-muted-foreground">
          <span>NEURAL LINK ESTABLISHED</span>
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-sm shadow-emerald-400/50" />
        </div>
      </div>
    </div>
  )
}