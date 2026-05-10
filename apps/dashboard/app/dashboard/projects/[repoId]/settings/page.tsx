"use client"

import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Copy, ExternalLink, Settings, ShieldCheck } from "lucide-react"
import { Github } from "@/components/ui/social-icons"
import { toast } from "sonner"

import { AutoAnalysisToggle } from "@/components/settings/AutoAnalysisToggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  copyTextToClipboard,
  getGitHubCloneUrl,
  getGitHubRepositoryUrl,
  getRepositoryPath,
  normalizeRepositoryId,
} from "@/lib/repository-links"

export default function RepositorySettingsPage() {
  const router = useRouter()
  const params = useParams() as { repoId?: string | string[] }
  const repoId = normalizeRepositoryId(
    Array.isArray(params.repoId) ? params.repoId[0] ?? "" : params.repoId ?? "",
  )

  const githubUrl = getGitHubRepositoryUrl(repoId)
  const cloneUrl = getGitHubCloneUrl(repoId)

  const handleBack = () => {
    router.push(getRepositoryPath(repoId))
  }

  const handleOpenGitHub = () => {
    const popup = window.open(githubUrl, "_blank", "noopener,noreferrer")
    if (!popup) {
      toast.error("Unable to open GitHub in a new tab")
    }
  }

  const handleCopyCloneUrl = async () => {
    try {
      await copyTextToClipboard(cloneUrl)
      toast.success("Clone URL copied to clipboard")
    } catch (error) {
      console.error("Failed to copy clone URL:", error)
      toast.error("Unable to copy clone URL")
    }
  }

  if (!repoId) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8 text-center">
          <p className="text-sm text-destructive">Repository identifier is missing.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/dashboard/repositories")}
          >
            Back to Repositories
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="h-4 w-4" />
            Repository Settings
          </div>
          <h1 className="text-3xl font-bold">{repoId.split("/").pop() ?? repoId}</h1>
          <p className="max-w-2xl text-muted-foreground">
            Configure repository-specific analysis behavior, keep auto-analysis under control,
            and jump to the GitHub project when needed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button variant="outline" onClick={handleOpenGitHub} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Open in GitHub
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)]">
        <AutoAnalysisToggle projectId={repoId} className="w-full" />

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                Repository Links
              </CardTitle>
              <CardDescription>Quick access to the source repository and clone URL.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    GitHub
                  </span>
                  <Badge variant="secondary">External</Badge>
                </div>
                <p className="break-all rounded-lg border bg-muted/30 px-3 py-2 font-mono text-xs">
                  {githubUrl}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Clone URL
                  </span>
                  <Badge variant="outline">Copy ready</Badge>
                </div>
                <p className="break-all rounded-lg border bg-muted/30 px-3 py-2 font-mono text-xs">
                  {cloneUrl}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Button onClick={handleCopyCloneUrl} className="gap-2">
                  <Copy className="h-4 w-4" />
                  Copy Clone URL
                </Button>
                <Button variant="outline" onClick={handleOpenGitHub} className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Open Repository
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                What this page controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>- Enable or disable auto-analysis for this repository.</p>
              <p>- Temporarily pause reviews when the repo is in maintenance.</p>
              <p>- Review the audit log for every settings change.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
