"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  X,
  AlertCircle,
  Info,
  Send,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { PendingComment, ReviewVerdict } from "@/lib/review-types"
import { cn } from "@/components/ui/utils"

interface ReviewSubmissionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysisId: string
  pendingComments: PendingComment[]
  onSubmit: (verdict: ReviewVerdict, summary: string) => void
  onRemoveComment: (id: string) => void
  isSubmitting?: boolean
}

const verdictOptions = [
  {
    value: "approve" as const,
    label: "Approve",
    description: "Submit feedback and approve the changes",
    icon: CheckCircle2,
    color: "text-[color:var(--green-status)]",
    bgColor: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
  },
  {
    value: "request_changes" as const,
    label: "Request changes",
    description: "Submit feedback requiring changes before approval",
    icon: AlertTriangle,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
  },
  {
    value: "comment_only" as const,
    label: "Comment",
    description: "Submit feedback without explicit approval",
    icon: MessageSquare,
    color: "text-teal-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
  },
]

function severityIcon(severity: string | undefined) {
  if (severity === "blocker") {
    return <AlertCircle className="h-3.5 w-3.5 text-destructive" />
  }
  if (severity === "warn") {
    return <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--orange)]" />
  }
  if (severity === "info") {
    return <Info className="h-3.5 w-3.5 text-blue-500" />
  }
  return null
}

export function ReviewSubmissionDialog({
  open,
  onOpenChange,
  pendingComments,
  onSubmit,
  onRemoveComment,
  isSubmitting = false,
}: ReviewSubmissionDialogProps) {
  const [verdict, setVerdict] = useState<ReviewVerdict>("comment_only")
  const [summary, setSummary] = useState("")

  const blockingCount = pendingComments.filter((c) => c.is_blocking).length
  const hasBlockingComments = blockingCount > 0

  const handleSubmit = () => {
    onSubmit(verdict, summary)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">Submit your review</DialogTitle>
          <DialogDescription>
            Choose how you want to submit your feedback
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-6 py-4">
          {/* Review verdict selection */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Review verdict</Label>
            <RadioGroup
              value={verdict}
              onValueChange={(v) => setVerdict(v as ReviewVerdict)}
              className="space-y-3"
            >
              {verdictOptions.map((option) => {
                const isSelected = verdict === option.value
                return (
                  <motion.div
                    key={option.value}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <Label
                      htmlFor={option.value}
                      className={cn(
                        "flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                        isSelected
                          ? option.bgColor
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      )}
                    >
                      <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <option.icon className={cn("h-5 w-5", option.color)} />
                          <span className={cn("font-medium", isSelected && option.color)}>
                            {option.label}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {option.description}
                        </p>
                      </div>
                    </Label>
                  </motion.div>
                )
              })}
            </RadioGroup>

            {/* Warning for approve with blocking comments */}
            {verdict === "approve" && hasBlockingComments && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-[color:var(--orange)] dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      You have {blockingCount} blocking {blockingCount === 1 ? "comment" : "comments"}
                    </p>
                    <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                      Consider requesting changes instead, or remove the blocking flag from your comments.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Summary */}
          <div>
            <Label htmlFor="summary" className="text-sm font-medium mb-2 block">
              Summary (optional)
            </Label>
            <Textarea
              id="summary"
              placeholder="Add a summary of your review..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Pending comments list */}
          {pendingComments.length > 0 && (
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Comments to submit ({pendingComments.length})
              </Label>
              <ScrollArea className="h-[200px] rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="p-2 space-y-2">
                  {pendingComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-muted-foreground">
                            {comment.file_path.split("/").pop()}:{comment.line_start}
                          </span>
                          {severityIcon(comment.severity)}
                          {comment.is_blocking && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Blocking
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                            {comment.comment_type.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="text-sm text-secondary-foreground line-clamp-2">
                          {comment.content}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900 flex-shrink-0"
                        onClick={() => onRemoveComment(comment.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={cn(
              verdict === "approve" && "bg-green-600 hover:bg-green-700",
              verdict === "request_changes" && "bg-orange-600 hover:bg-orange-700",
              verdict === "comment_only" && "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {isSubmitting ? (
              <>Submitting...</>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit review
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
