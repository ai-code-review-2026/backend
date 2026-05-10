"use client"

import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

// ─── PIPELINE STEPS ─────────────────────────────────────────
export const ANALYSIS_STEPS = [
  { id: "start", label: "Start", description: "Initialisation de l'analyse" },
  { id: "code_review_request", label: "CodeReviewRequest", description: "Récupération du code" },
  { id: "assign_reviewer", label: "AssignReviewer", description: "Attribution du reviewer IA" },
  { id: "review_code", label: "ReviewCode", description: "Analyse du code en cours" },
  { id: "provide_feedback", label: "ProvideFeedback", description: "Génération des commentaires" },
  { id: "implement_changes", label: "ImplementChanges", description: "Suggestions d'améliorations" },
  { id: "final_approval", label: "FinalApproval", description: "Validation finale" },
  { id: "end", label: "End", description: "Analyse terminée" },
] as const

export type StepId = typeof ANALYSIS_STEPS[number]["id"]

export type StepStatus = "pending" | "active" | "completed" | "failed"

export interface PipelineStep {
  id: StepId
  label: string
  description: string
  status: StepStatus
  startedAt?: string
  completedAt?: string
  error?: string
}

// ─── STATUS DOT COMPONENT ───────────────────────────────────
const STATUS_DOT_CLASSES: Record<StepStatus, string> = {
  pending:   "bg-muted-foreground/40",
  active:    "bg-[color:var(--green-status)]",
  completed: "bg-[color:var(--green-status)]",
  failed:    "bg-destructive",
}

function StepDot({ status }: { status: StepStatus }) {
  if (status === "active") {
    return (
      <span className="relative flex w-3 h-3 flex-shrink-0">
        <span className={cn(
          "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
          STATUS_DOT_CLASSES.active
        )} />
        <span className={cn("relative inline-flex rounded-full w-2 h-2 m-[1px]", STATUS_DOT_CLASSES.active)} />
      </span>
    )
  }

  if (status === "failed") {
    return (
      <motion.span
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className={cn("w-3 h-3 rounded-full flex-shrink-0 block", STATUS_DOT_CLASSES.failed)}
      />
    )
  }

  return (
    <motion.span
      initial={{ scale: status === "completed" ? 0 : 1 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className={cn("w-3 h-3 rounded-full flex-shrink-0 block", STATUS_DOT_CLASSES[status])}
    />
  )
}

// ─── CONNECTOR LINE ─────────────────────────────────────────
function Connector({ fromStatus, toStatus }: { fromStatus: StepStatus; toStatus: StepStatus }) {
  const isActive = fromStatus === "completed" || fromStatus === "active"
  
  return (
    <div className="flex-1 h-[2px] mx-1 relative overflow-hidden bg-muted/30 min-w-[20px]">
      {isActive && (
        <motion.div
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 bg-[color:var(--green-status)]"
        />
      )}
    </div>
  )
}

// ─── STEP PILL COMPONENT ────────────────────────────────────
function StepPill({ 
  step, 
  isFirst, 
  isLast,
  showDescription 
}: { 
  step: PipelineStep
  isFirst: boolean
  isLast: boolean
  showDescription?: boolean
}) {
  const { status, label, description } = step

  const bgClasses = {
    pending: "bg-muted/50 border-muted",
    active: "bg-[color:var(--green-status)]/10 border-[color:var(--green-status)]/30",
    completed: "bg-[color:var(--green-status)]/10 border-[color:var(--green-status)]/20",
    failed: "bg-destructive/10 border-destructive/30",
  }

  const textClasses = {
    pending: "text-muted-foreground",
    active: "text-[color:var(--green-status)] font-medium",
    completed: "text-[color:var(--green-status)]",
    failed: "text-destructive",
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-1"
    >
      <motion.div
        whileHover={{ scale: 1.02 }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all",
          bgClasses[status]
        )}
      >
        <StepDot status={status} />
        <span className={cn("text-xs font-mono whitespace-nowrap", textClasses[status])}>
          {label}
        </span>
      </motion.div>
      
      {/* Description tooltip on hover or when active */}
      {(showDescription || status === "active") && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-[10px] text-muted-foreground text-center max-w-[100px] truncate"
        >
          {description}
        </motion.span>
      )}
    </motion.div>
  )
}

// ─── MAIN PIPELINE COMPONENT ────────────────────────────────
export interface AnalysisPipelineProps {
  /** Current step ID (determines which steps are active/completed) */
  currentStepId?: StepId
  /** Override individual step statuses */
  stepStatuses?: Partial<Record<StepId, StepStatus>>
  /** Analysis status from API */
  analysisStatus?: string
  /** Show descriptions under each step */
  showDescriptions?: boolean
  /** Compact mode for inline display */
  compact?: boolean
  /** Custom class name */
  className?: string
  /** Poll for updates (analysis ID required) */
  analysisId?: string
  /** Callback when status changes */
  onStatusChange?: (stepId: StepId, status: StepStatus) => void
}

export function AnalysisPipeline({
  currentStepId,
  stepStatuses = {},
  analysisStatus,
  showDescriptions = false,
  compact = false,
  className,
  analysisId,
  onStatusChange,
}: AnalysisPipelineProps) {
  const [steps, setSteps] = useState<PipelineStep[]>(() => 
    ANALYSIS_STEPS.map(s => ({ ...s, status: "pending" as StepStatus }))
  )

  // Map analysis status to pipeline step
  const mapStatusToStep = useCallback((status: string): StepId => {
    const statusLower = status.toLowerCase()
    
    if (statusLower === "queued" || statusLower === "received") return "start"
    if (statusLower === "fetching" || statusLower === "cloning") return "code_review_request"
    if (statusLower === "preparing" || statusLower === "assigning") return "assign_reviewer"
    if (statusLower === "running" || statusLower === "analyzing" || statusLower === "reviewing") return "review_code"
    if (statusLower === "generating" || statusLower === "feedback") return "provide_feedback"
    if (statusLower === "suggesting" || statusLower === "implementing") return "implement_changes"
    if (statusLower === "finalizing" || statusLower === "approving") return "final_approval"
    if (statusLower === "done" || statusLower === "completed") return "end"
    if (statusLower === "failed" || statusLower === "error") return "end"
    
    return "start"
  }, [])

  // Update steps based on currentStepId or analysisStatus
  useEffect(() => {
    let activeStepId = currentStepId

    // If analysisStatus is provided, map it to a step
    if (analysisStatus && !currentStepId) {
      activeStepId = mapStatusToStep(analysisStatus)
    }

    if (!activeStepId) return

    const activeIndex = ANALYSIS_STEPS.findIndex(s => s.id === activeStepId)
    const isFailed = analysisStatus?.toLowerCase() === "failed" || analysisStatus?.toLowerCase() === "error"

    setSteps(prev => 
      prev.map((step, index) => {
        // Check for override
        if (stepStatuses[step.id]) {
          return { ...step, status: stepStatuses[step.id]! }
        }

        // Determine status based on position
        if (index < activeIndex) {
          return { ...step, status: "completed" }
        } else if (index === activeIndex) {
          if (isFailed) {
            return { ...step, status: "failed" }
          }
          // If it's the last step and completed
          if (activeStepId === "end" && (analysisStatus?.toLowerCase() === "done" || analysisStatus?.toLowerCase() === "completed")) {
            return { ...step, status: "completed" }
          }
          return { ...step, status: "active" }
        } else {
          return { ...step, status: "pending" }
        }
      })
    )
  }, [currentStepId, analysisStatus, stepStatuses, mapStatusToStep])

  // Poll for updates if analysisId is provided
  useEffect(() => {
    if (!analysisId) return

    let cancelled = false
    let currentStatus = analysisStatus

    const pollStatus = async () => {
      try {
        // Use the existing analysis details endpoint
        const response = await fetch(`/api/dashboard/analyses/${analysisId}`)
        if (response.ok) {
          const data = await response.json()
          if (!cancelled && data.status && data.status !== currentStatus) {
            currentStatus = data.status
            const stepId = mapStatusToStep(data.status)
            
            // Update local state
            const activeIndex = ANALYSIS_STEPS.findIndex(s => s.id === stepId)
            const isFailed = data.status.toLowerCase() === "failed" || data.status.toLowerCase() === "error"
            const isComplete = data.status.toLowerCase() === "done" || data.status.toLowerCase() === "completed"
            
            setSteps(prev => 
              prev.map((step, index) => {
                if (index < activeIndex) {
                  return { ...step, status: "completed" }
                } else if (index === activeIndex) {
                  if (isFailed) return { ...step, status: "failed" }
                  if (isComplete && stepId === "end") return { ...step, status: "completed" }
                  return { ...step, status: "active" }
                } else {
                  return { ...step, status: "pending" }
                }
              })
            )
            
            if (onStatusChange) {
              onStatusChange(stepId, isFailed ? "failed" : isComplete ? "completed" : "active")
            }
            
            // Stop polling if terminal state
            if (isFailed || isComplete) {
              return
            }
          }
        }
      } catch (err) {
        console.error("Failed to poll analysis status:", err)
      }
      
      // Continue polling if not cancelled and not terminal
      if (!cancelled) {
        setTimeout(pollStatus, 3000)
      }
    }

    // Initial poll after short delay
    const initialTimeout = setTimeout(pollStatus, 1000)

    return () => {
      cancelled = true
      clearTimeout(initialTimeout)
    }
  }, [analysisId, analysisStatus, mapStatusToStep, onStatusChange])

  // Calculate progress percentage
  const completedCount = steps.filter(s => s.status === "completed").length
  const progress = Math.round((completedCount / steps.length) * 100)

  if (compact) {
    // Compact horizontal view
    return (
      <div className={cn("w-full", className)}>
        {/* Progress bar */}
        <div className="h-1 bg-muted/30 rounded-full overflow-hidden mb-3">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
            className="h-full bg-green-500"
          />
        </div>
        
        {/* Steps row */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <StepPill 
                step={step} 
                isFirst={index === 0} 
                isLast={index === steps.length - 1}
                showDescription={showDescriptions}
              />
              {index < steps.length - 1 && (
                <Connector 
                  fromStatus={step.status} 
                  toStatus={steps[index + 1].status} 
                />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Full view with more details
  return (
    <div className={cn("w-full space-y-4", className)}>
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Pipeline Progress
        </span>
        <span className="text-sm font-mono text-muted-foreground">
          {progress}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
          className="h-full bg-gradient-to-r from-green-500 to-emerald-400"
        />
      </div>

      {/* Steps */}
      <div className="flex items-start justify-between gap-1 overflow-x-auto py-2">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1 min-w-0">
            <StepPill 
              step={step} 
              isFirst={index === 0} 
              isLast={index === steps.length - 1}
              showDescription={showDescriptions}
            />
            {index < steps.length - 1 && (
              <Connector 
                fromStatus={step.status} 
                toStatus={steps[index + 1].status} 
              />
            )}
          </div>
        ))}
      </div>

      {/* Current step description */}
      <AnimatePresence mode="wait">
        {steps.find(s => s.status === "active") && (
          <motion.div
            key={steps.find(s => s.status === "active")?.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="text-center"
          >
            <span className="text-sm text-muted-foreground">
              {steps.find(s => s.status === "active")?.description}...
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── MINI PIPELINE (for timeline cards) ─────────────────────
export function MiniPipeline({ 
  analysisStatus,
  className 
}: { 
  analysisStatus: string
  className?: string 
}) {
  const mapStatusToStep = (status: string): number => {
    const statusLower = status.toLowerCase()
    
    if (statusLower === "queued" || statusLower === "received") return 0
    if (statusLower === "fetching" || statusLower === "cloning") return 1
    if (statusLower === "preparing" || statusLower === "assigning") return 2
    if (statusLower === "running" || statusLower === "analyzing" || statusLower === "reviewing") return 3
    if (statusLower === "generating" || statusLower === "feedback") return 4
    if (statusLower === "suggesting" || statusLower === "implementing") return 5
    if (statusLower === "finalizing" || statusLower === "approving") return 6
    if (statusLower === "done" || statusLower === "completed") return 7
    
    return 0
  }

  const currentStep = mapStatusToStep(analysisStatus)
  const totalSteps = 8

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: totalSteps }).map((_, index) => {
        let status: "pending" | "active" | "completed" = "pending"
        if (index < currentStep) status = "completed"
        else if (index === currentStep) status = "active"

        const colors = {
          pending: "bg-muted/40",
          active: "bg-green-500",
          completed: "bg-green-500/60",
        }

        return (
          <div key={index} className="flex items-center">
            {status === "active" ? (
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className={cn("w-2 h-2 rounded-full", colors[status])}
              />
            ) : (
              <div className={cn("w-1.5 h-1.5 rounded-full", colors[status])} />
            )}
            {index < totalSteps - 1 && (
              <div 
                className={cn(
                  "w-2 h-0.5 mx-0.5",
                  index < currentStep ? "bg-green-500/40" : "bg-muted/20"
                )} 
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
