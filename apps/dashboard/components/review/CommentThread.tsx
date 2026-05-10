"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  MessageSquare,
  Reply,
  Check,
  RotateCcw,
  AlertTriangle,
  AlertCircle,
  Info,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ReviewComment, CommentAuthor } from "@/lib/review-types"
import { cn } from "@/components/ui/utils"
import { formatCompactRelativeTime as formatRelativeTime } from "@/lib/domain/dates"

interface CommentThreadProps {
  rootComment: ReviewComment
  replies: ReviewComment[]
  authors: Map<string, CommentAuthor>
  currentUserId: string
  onReply: (parentId: string, content: string) => void
  onResolve: (commentId: string) => void
  onUnresolve: (commentId: string) => void
  onEdit?: (commentId: string, newContent: string) => void
}

function severityIcon(severity: string | null | undefined) {
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

function CommentItem({
  comment,
  author,
  isReply = false,
  currentUserId,
  onResolve,
  onUnresolve,
  onEdit,
}: {
  comment: ReviewComment
  author?: CommentAuthor
  isReply?: boolean
  currentUserId: string
  onResolve: (commentId: string) => void
  onUnresolve: (commentId: string) => void
  onEdit?: (commentId: string, newContent: string) => void
}) {
  const isResolved = comment.status === "resolved"
  const isOwner = comment.author_id === currentUserId
  const authorName = author?.name || "Unknown"
  const authorInitials = authorName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div
      className={cn(
        "group relative",
        isReply && "ml-8 border-l-2 border-gray-200 dark:border-gray-700 pl-4",
        isResolved && "opacity-60"
      )}
    >
      <div className="flex gap-3">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-500 text-white">
            {authorInitials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm text-foreground dark:text-gray-100">
              {authorName}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(comment.created_at)}
            </span>
            {severityIcon(comment.severity)}
            {comment.is_blocking && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                Blocking
              </Badge>
            )}
            {isResolved && (
              <Badge variant="success" className="text-[10px] px-1.5 py-0">
                <Check className="h-2.5 w-2.5 mr-0.5" />
                Resolved
              </Badge>
            )}

            {/* Actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwner && onEdit && (
                  <DropdownMenuItem>Edit</DropdownMenuItem>
                )}
                {!isResolved ? (
                  <DropdownMenuItem onClick={() => onResolve(comment.id)}>
                    <Check className="h-4 w-4 mr-2" />
                    Resolve
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onUnresolve(comment.id)}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Unresolve
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Comment type badge */}
          {comment.comment_type !== "comment" && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mb-2 capitalize">
              {comment.comment_type.replace("_", " ")}
            </Badge>
          )}

          {/* Content */}
          <p className={cn(
            "text-sm text-secondary-foreground whitespace-pre-wrap",
            isResolved && "line-through"
          )}>
            {comment.content}
          </p>

          {/* Code snippet */}
          {comment.code_snippet && (
            <div className="mt-2 p-2 bg-card-inner rounded border border-border">
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto">
                {comment.code_snippet}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function CommentThread({
  rootComment,
  replies,
  authors,
  currentUserId,
  onReply,
  onResolve,
  onUnresolve,
  onEdit,
}: CommentThreadProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replyContent, setReplyContent] = useState("")

  const isResolved = rootComment.status === "resolved"
  const hasReplies = replies.length > 0

  const handleSubmitReply = () => {
    if (!replyContent.trim()) return
    onReply(rootComment.id, replyContent.trim())
    setReplyContent("")
    setShowReplyForm(false)
  }

  const lineRange = rootComment.line_end && rootComment.line_end !== rootComment.line_start
    ? `${rootComment.line_start}-${rootComment.line_end}`
    : `${rootComment.line_start}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border bg-white dark:bg-gray-900 shadow-sm overflow-hidden",
        isResolved
          ? "border-green-200 dark:border-green-800/50"
          : "border-gray-200 dark:border-gray-700"
      )}
    >
      {/* Thread header */}
      <div
        className={cn(
          "px-4 py-2 border-b flex items-center justify-between cursor-pointer",
          isResolved
            ? "bg-[color:var(--green-status)]/10 border-[color:var(--green-status)]/20"
            : "bg-card-inner border-border"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground">
            Line {lineRange}
          </span>
          {hasReplies && (
            <Badge variant="outline" className="text-[10px]">
              {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isResolved && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onResolve(rootComment.id)
              }}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Resolve
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Thread content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4">
              {/* Root comment */}
              <CommentItem
                comment={rootComment}
                author={authors.get(rootComment.author_id)}
                currentUserId={currentUserId}
                onResolve={onResolve}
                onUnresolve={onUnresolve}
                onEdit={onEdit}
              />

              {/* Replies */}
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  author={authors.get(reply.author_id)}
                  isReply
                  currentUserId={currentUserId}
                  onResolve={onResolve}
                  onUnresolve={onUnresolve}
                  onEdit={onEdit}
                />
              ))}

              {/* Reply form */}
              <AnimatePresence>
                {showReplyForm ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="ml-8 border-l-2 border-blue-300 dark:border-blue-700 pl-4"
                  >
                    <Textarea
                      placeholder="Write a reply..."
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      className="min-h-[80px] mb-2"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSubmitReply} disabled={!replyContent.trim()}>
                        Reply
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowReplyForm(false)
                          setReplyContent("")
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground ml-8"
                      onClick={() => setShowReplyForm(true)}
                    >
                      <Reply className="h-3.5 w-3.5 mr-1.5" />
                      Reply
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
