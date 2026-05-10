"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { X, MessageSquare, AlertTriangle, AlertCircle, Info, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import type { PendingComment } from "@/lib/review-types"

interface InlineCommentFormProps {
  analysisId: string
  filePath: string
  lineStart: number
  lineEnd?: number
  codeSnippet?: string
  onSubmit: (comment: PendingComment) => void
  onCancel: () => void
}

const commentTypes = [
  { value: "comment", label: "Comment", icon: MessageSquare },
  { value: "suggestion", label: "Suggestion", icon: Info },
  { value: "question", label: "Question", icon: Info },
  { value: "praise", label: "Praise", icon: Info },
  { value: "change_request", label: "Change Request", icon: AlertTriangle },
] as const

const severityOptions = [
  { value: "info", label: "Info", icon: Info, color: "text-blue-500" },
  { value: "warn", label: "Warning", icon: AlertTriangle, color: "text-[color:var(--orange)]" },
  { value: "blocker", label: "Blocker", icon: AlertCircle, color: "text-destructive" },
] as const

export function InlineCommentForm({
  filePath,
  lineStart,
  lineEnd,
  codeSnippet,
  onSubmit,
  onCancel,
}: InlineCommentFormProps) {
  const [content, setContent] = useState("")
  const [commentType, setCommentType] = useState<PendingComment["comment_type"]>("comment")
  const [severity, setSeverity] = useState<PendingComment["severity"]>(undefined)
  const [isBlocking, setIsBlocking] = useState(false)

  const handleSubmit = () => {
    if (!content.trim()) return

    const pendingComment: PendingComment = {
      id: crypto.randomUUID(),
      file_path: filePath,
      line_start: lineStart,
      line_end: lineEnd,
      code_snippet: codeSnippet,
      content: content.trim(),
      comment_type: commentType,
      severity,
      is_blocking: isBlocking,
    }

    onSubmit(pendingComment)
    setContent("")
    setCommentType("comment")
    setSeverity(undefined)
    setIsBlocking(false)
  }

  const lineRange = lineEnd && lineEnd !== lineStart
    ? `${lineStart}-${lineEnd}`
    : `${lineStart}`

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -10, height: 0 }}
      className="mx-4 my-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
            Add comment
          </span>
          <Badge variant="outline" className="text-xs">
            Line {lineRange}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Code snippet preview */}
      {codeSnippet && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <pre className="text-xs font-mono text-muted-foreground truncate">
            {codeSnippet}
          </pre>
        </div>
      )}

      {/* Form */}
      <div className="p-4 space-y-4">
        {/* Comment content */}
        <div>
          <Textarea
            placeholder="Write a comment..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[100px] resize-none"
            autoFocus
          />
        </div>

        {/* Options row */}
        <div className="flex flex-wrap gap-3">
          {/* Comment Type */}
          <div className="flex-1 min-w-[140px]">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label>
            <Select value={commentType} onValueChange={(v) => setCommentType(v as PendingComment["comment_type"])}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {commentTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <type.icon className="h-3.5 w-3.5" />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Severity */}
          <div className="flex-1 min-w-[140px]">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Severity</Label>
            <Select value={severity || "none"} onValueChange={(v) => setSeverity(v === "none" ? undefined : v as PendingComment["severity"])}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {severityOptions.map((sev) => (
                  <SelectItem key={sev.value} value={sev.value}>
                    <div className="flex items-center gap-2">
                      <sev.icon className={`h-3.5 w-3.5 ${sev.color}`} />
                      {sev.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Blocking checkbox */}
          <div className="flex items-end pb-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_blocking"
                checked={isBlocking}
                onCheckedChange={(checked) => setIsBlocking(checked === true)}
              />
              <Label htmlFor="is_blocking" className="text-sm cursor-pointer">
                Blocks merge
              </Label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!content.trim()}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Add to review
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
