"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Wand2, CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ApplySuggestionButtonProps {
  findingId: string
  suggestion?: string
  filePath?: string
  disabled?: boolean
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  onApplied?: (result: ApplyResult) => void
}

interface ApplyResult {
  success: boolean
  branch: string
  commit_sha: string
  pr_number?: number
  pr_url?: string
  file_path: string
  message: string
  error?: string
}

export function ApplySuggestionButton({
  findingId,
  suggestion,
  filePath,
  disabled = false,
  variant = "default",
  size = "sm",
  className = "",
  onApplied,
}: ApplySuggestionButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)
  const { toast } = useToast()

  // Form state
  const [branchName, setBranchName] = useState(`fix/auto-suggestion-${findingId.substring(0, 8)}`)
  const [createPr, setCreatePr] = useState(true)
  const [prTitle, setPrTitle] = useState(`Fix: Apply suggestion for finding ${findingId.substring(0, 8)}`)
  const [prBody, setPrBody] = useState(
    suggestion
      ? `This PR automatically applies the following suggestion:\n\n${suggestion}`
      : "This PR automatically applies a code review suggestion."
  )

  const handleApply = async () => {
    setIsLoading(true)
    setShowDialog(false)

    try {
      const response = await fetch(`/api/dashboard/findings/${findingId}/apply-suggestion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchName,
          createPr,
          prTitle,
          prBody,
        }),
      })

      const result = (await response.json()) as ApplyResult

      setApplyResult(result)

      if (response.ok && result.success) {
        toast({
          title: "Suggestion Applied Successfully",
          description: createPr
            ? `Created PR #${result.pr_number} on branch ${result.branch}`
            : `Committed changes to branch ${result.branch}`,
          variant: "default",
        })

        onApplied?.(result)
      } else {
        toast({
          title: "Failed to Apply Suggestion",
          description: result.error || result.message || "An unexpected error occurred",
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
          Applying...
        </>
      )
    }

    if (applyResult?.success) {
      return (
        <>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Applied
        </>
      )
    }

    return (
      <>
        <Wand2 className="mr-2 h-4 w-4" />
        Apply Suggestion
      </>
    )
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || isLoading || !suggestion}
        onClick={() => setShowDialog(true)}
      >
        {getButtonContent()}
      </Button>

      {/* Configuration Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Apply Suggestion to GitHub</DialogTitle>
            <DialogDescription>
              This will create a new branch with the suggested code changes
              {filePath && (
                <>
                  {" "}
                  in <span className="font-semibold">{filePath}</span>
                </>
              )}
              .
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Suggestion Preview */}
            {suggestion && (
              <div className="space-y-2">
                <Label>Suggestion to Apply</Label>
                <div className="rounded-md bg-muted p-3 text-sm max-h-32 overflow-y-auto">
                  <code className="text-xs">{suggestion}</code>
                </div>
              </div>
            )}

            {/* Branch Name */}
            <div className="space-y-2">
              <Label htmlFor="branch-name">Branch Name</Label>
              <Input
                id="branch-name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="fix/auto-suggestion"
              />
            </div>

            {/* Create PR Toggle */}
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="create-pr" className="flex flex-col space-y-1">
                <span>Create Pull Request</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Automatically create a PR with these changes
                </span>
              </Label>
              <Switch id="create-pr" checked={createPr} onCheckedChange={setCreatePr} />
            </div>

            {/* PR Details (conditional) */}
            {createPr && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="pr-title">PR Title</Label>
                  <Input
                    id="pr-title"
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    placeholder="Fix: Apply suggestion"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pr-body">PR Description</Label>
                  <Textarea
                    id="pr-body"
                    value={prBody}
                    onChange={(e) => setPrBody(e.target.value)}
                    placeholder="Description of the changes..."
                    rows={4}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleApply}>
              <Wand2 className="mr-2 h-4 w-4" />
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Result Dialog */}
      {applyResult?.success && (
        <Dialog open={!!applyResult} onOpenChange={() => setApplyResult(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Suggestion Applied Successfully
              </DialogTitle>
              <DialogDescription>Your changes have been committed to GitHub.</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Branch</p>
                <code className="text-xs bg-muted px-2 py-1 rounded">{applyResult.branch}</code>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">Commit SHA</p>
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                  {applyResult.commit_sha.substring(0, 8)}
                </code>
              </div>

              {applyResult.pr_url && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Pull Request</p>
                  <a
                    href={applyResult.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    PR #{applyResult.pr_number}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => setApplyResult(null)}>Close</Button>
              {applyResult.pr_url && (
                <Button variant="outline" asChild>
                  <a href={applyResult.pr_url} target="_blank" rel="noopener noreferrer">
                    View PR
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
