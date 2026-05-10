"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { GitBranch, CheckCircle2, AlertCircle, XCircle, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface PublishToGitHubButtonProps {
  analysisId: string
  repo?: string
  prNumber?: number
  disabled?: boolean
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  onPublished?: (result: PublishResult) => void
}

interface PublishResult {
  status: "published" | "already_published" | "skipped" | "disabled" | "failed"
  message: string
  published_at?: string
  repo?: string
  pr_number?: number
  findings_count?: number
  comment_id?: string
  error?: string
}

export function PublishToGitHubButton({
  analysisId,
  repo,
  prNumber,
  disabled = false,
  variant = "default",
  size = "default",
  className = "",
  onPublished,
}: PublishToGitHubButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showForceDialog, setShowForceDialog] = useState(false)
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null)
  const { toast } = useToast()

  const handlePublish = async (force: boolean = false) => {
    setIsLoading(true)
    setShowConfirmDialog(false)
    setShowForceDialog(false)

    try {
      const response = await fetch(`/api/dashboard/analyses/${analysisId}/publish-github`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force }),
      })

      const result = (await response.json()) as PublishResult

      setPublishResult(result)

      if (response.ok) {
        switch (result.status) {
          case "published":
            toast({
              title: "Published to GitHub",
              description: result.message || `Successfully published to PR #${result.pr_number || prNumber}`,
              variant: "default",
            })
            break
          case "already_published":
            toast({
              title: "Already Published",
              description: result.message || "This analysis was already published to GitHub",
              variant: "default",
            })
            // Show option to force republish
            if (!force) {
              setShowForceDialog(true)
            }
            break
          case "skipped":
            toast({
              title: "Publication Skipped",
              description: result.message || "Analysis cannot be published",
              variant: "default",
            })
            break
          case "disabled":
            toast({
              title: "Publication Disabled",
              description: result.message || "GitHub publication is disabled",
              variant: "destructive",
            })
            break
          default:
            toast({
              title: "Unknown Status",
              description: result.message || "Unexpected publication status",
              variant: "default",
            })
        }

        onPublished?.(result)
      } else {
        toast({
          title: "Publication Failed",
          description: result.message || result.error || "Failed to publish to GitHub",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const getButtonContent = () => {
    if (isLoading) {
      return (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Publishing...
        </>
      )
    }

    if (publishResult?.status === "published") {
      return (
        <>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Published
        </>
      )
    }

    return (
      <>
        <GitBranch className="mr-2 h-4 w-4" />
        Publish to GitHub
      </>
    )
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || isLoading}
        onClick={() => setShowConfirmDialog(true)}
      >
        {getButtonContent()}
      </Button>

      {/* Confirm initial publish */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Review to GitHub?</AlertDialogTitle>
            <AlertDialogDescription>
              This will post the code review results as a comment on{" "}
              {prNumber ? (
                <>
                  PR <span className="font-semibold">#{prNumber}</span>
                </>
              ) : (
                "the pull request"
              )}
              {repo && (
                <>
                  {" "}
                  in <span className="font-semibold">{repo}</span>
                </>
              )}
              .
              <br />
              <br />
              The comment will include:
              <ul className="mt-2 ml-4 list-disc space-y-1 text-sm">
                <li>Analysis summary</li>
                <li>Found issues grouped by severity</li>
                <li>Risk analysis and merge readiness</li>
                <li>Metrics and statistics</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handlePublish(false)}>Publish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm force republish */}
      <AlertDialog open={showForceDialog} onOpenChange={setShowForceDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <AlertCircle className="inline mr-2 h-5 w-5 text-yellow-600" />
              Already Published
            </AlertDialogTitle>
            <AlertDialogDescription>
              This analysis has already been published to GitHub
              {publishResult?.published_at && (
                <>
                  {" "}
                  on <span className="font-semibold">{new Date(publishResult.published_at).toLocaleString()}</span>
                </>
              )}
              .
              <br />
              <br />
              Do you want to publish it again? This will create a new comment on the PR.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handlePublish(true)}>Republish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
