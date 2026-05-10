"use client"

import { motion } from "framer-motion"
import { MessageSquare, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { PendingComment } from "@/lib/review-types"

interface PendingReviewBannerProps {
  pendingComments: PendingComment[]
  onFinishReview: () => void
  onClearAll: () => void
  onRemoveComment: (id: string) => void
}

export function PendingReviewBanner({
  pendingComments,
  onFinishReview,
  onClearAll,
  onRemoveComment,
}: PendingReviewBannerProps) {
  if (pendingComments.length === 0) return null

  const blockingCount = pendingComments.filter((c) => c.is_blocking).length

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-0 left-[280px] right-0 z-50 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg"
    >
      <div className="max-w-[1200px] mx-auto px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Left: pending info */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="relative">
                <MessageSquare className="h-5 w-5 text-teal-400" />
                <Badge
                  variant="default"
                  className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-blue-600"
                >
                  {pendingComments.length}
                </Badge>
              </div>
              <span className="font-medium text-foreground dark:text-gray-100">
                {pendingComments.length} pending {pendingComments.length === 1 ? "comment" : "comments"}
              </span>
            </div>

            {blockingCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {blockingCount} blocking
              </Badge>
            )}

            {/* Preview of pending comments */}
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
              {pendingComments.slice(0, 3).map((comment) => (
                <div
                  key={comment.id}
                  className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-md"
                >
                  <span className="text-xs font-mono">{comment.file_path.split("/").pop()}:{comment.line_start}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-red-100 dark:hover:bg-red-900"
                    onClick={() => onRemoveComment(comment.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {pendingComments.length > 3 && (
                <span className="text-xs">+{pendingComments.length - 3} more</span>
              )}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="text-muted-foreground hover:text-destructive"
            >
              Clear all
            </Button>
            <Button
              onClick={onFinishReview}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            >
              <Send className="h-4 w-4 mr-2" />
              Finish review
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
