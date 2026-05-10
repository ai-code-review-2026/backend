"use client"

import { useAuth } from "@clerk/nextjs"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  AlertCircle,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { FileTree, type TreeEntry } from "@/components/editor/FileTree"
import { CodeEditor } from "@/components/editor/CodeEditor"
import { extractApiErrorMessage } from "@/lib/display"

interface BranchInfo {
  name: string
  protected: boolean
}

interface GitHubActionResult {
  ok?: boolean
  result?: unknown
  error?: string
  details?: unknown
  tree?: TreeEntry[]
}

function parseRepoParts(owner: string | undefined, repo: string | undefined): { owner: string; repo: string } | null {
  const cleanOwner = owner?.trim()
  const cleanRepo = repo?.trim().replace(/\.git$/i, "")
  if (!cleanOwner || !cleanRepo || cleanOwner.includes(" ") || cleanRepo.includes(" ")) {
    return null
  }

  return {
    owner: cleanOwner,
    repo: cleanRepo,
  }
}

function parseRepoInput(value: string): { owner: string; repo: string } | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const sshMatch = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s?#]+?)(?:\.git)?(?:[?#].*)?$/i)
  if (sshMatch) {
    return parseRepoParts(sshMatch[1], sshMatch[2])
  }

  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase().replace(/^www\./, "")
    if (host === "github.com") {
      const [owner, repo] = url.pathname.split("/").filter(Boolean)
      return parseRepoParts(owner, repo)
    }
  } catch {
    // Plain "owner/repo" input is handled below.
  }

  const normalized = trimmed
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, "")
    .replace(/^(?:www\.)?github\.com\//i, "")
  const [owner, repo] = normalized.split("/").filter(Boolean)
  return parseRepoParts(owner, repo)
}

export default function EditorPage() {
  const searchParams = useSearchParams()
  const { orgId, orgSlug } = useAuth()

  const [repoInput, setRepoInput] = useState("")
  const [owner, setOwner] = useState("")
  const [repo, setRepo] = useState("")

  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [defaultBranch, setDefaultBranch] = useState("main")
  const [selectedBranch, setSelectedBranch] = useState("main")
  const [branchLoading, setBranchLoading] = useState(false)

  const [treeEntries, setTreeEntries] = useState<TreeEntry[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeError, setTreeError] = useState("")
  const [actionError, setActionError] = useState("")
  const [actionMessage, setActionMessage] = useState("")

  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const ghPost = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      const response = await fetch("/api/dashboard/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      })
      const data = (await response.json().catch(() => ({}))) as GitHubActionResult
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(data, `GitHub action failed: ${action}`))
      }
      return data
    },
    [],
  )

  const loadBranches = useCallback(
    async (repoOwner: string, repoName: string, preferredBranch?: string | null) => {
      setBranchLoading(true)
      setActionError("")
      try {
        const data = await ghPost("list_branches", {
          owner: repoOwner,
          repo: repoName,
        })
        const branchList = Array.isArray(data.result) ? (data.result as BranchInfo[]) : []
        setBranches(branchList)

        const resolvedDefaultBranch =
          branchList.find((branch) => branch.name === "main")?.name ??
          branchList.find((branch) => branch.name === "master")?.name ??
          branchList[0]?.name ??
          "main"

        setDefaultBranch(resolvedDefaultBranch)
        setSelectedBranch(
          preferredBranch && branchList.some((branch) => branch.name === preferredBranch)
            ? preferredBranch
            : resolvedDefaultBranch,
        )
      } catch (error) {
        console.error("Failed to load branches:", error)
        setBranches([])
        setActionError(
          error instanceof Error ? error.message : "Failed to load branches",
        )
      } finally {
        setBranchLoading(false)
      }
    },
    [ghPost],
  )

  const loadTree = useCallback(
    async (repoOwner: string, repoName: string, branchName: string) => {
      setTreeLoading(true)
      setTreeError("")
      try {
        const data = await ghPost("get_tree", {
          owner: repoOwner,
          repo: repoName,
          ref: branchName,
        })
        setTreeEntries(Array.isArray(data.tree) ? (data.tree as TreeEntry[]) : [])
      } catch (error) {
        setTreeEntries([])
        setTreeError(
          error instanceof Error ? error.message : "Failed to load repository tree",
        )
      } finally {
        setTreeLoading(false)
      }
    },
    [ghPost],
  )

  const connectToRepository = useCallback(
    async (
      repoOwner: string,
      repoName: string,
      options?: { preferredBranch?: string | null; preferredFile?: string | null },
    ) => {
      setOwner(repoOwner)
      setRepo(repoName)
      setRepoInput(`${repoOwner}/${repoName}`)
      setSelectedFile(options?.preferredFile ?? null)
      setTreeEntries([])
      setActionError("")
      setActionMessage("")
      await loadBranches(repoOwner, repoName, options?.preferredBranch)
    },
    [loadBranches],
  )

  const handleConnect = useCallback(async () => {
    const parsed = parseRepoInput(repoInput)
    if (!parsed) {
      setActionMessage("")
      setActionError(
        "Enter a valid GitHub repository, for example owner/repo or https://github.com/owner/repo.",
      )
      return
    }
    await connectToRepository(parsed.owner, parsed.repo)
  }, [connectToRepository, repoInput])

  useEffect(() => {
    if (!owner || !repo || !selectedBranch) return
    loadTree(owner, repo, selectedBranch)
  }, [owner, repo, selectedBranch, loadTree])

  useEffect(() => {
    const repoParam = searchParams.get("repo")
    if (!repoParam) return

    const parsed = parseRepoInput(repoParam)
    if (!parsed) return

    const preferredBranch = searchParams.get("branch")
    const preferredFile = searchParams.get("file")
    const isDifferentRepo = parsed.owner !== owner || parsed.repo !== repo
    const isDifferentBranch =
      preferredBranch != null && preferredBranch.length > 0 && preferredBranch !== selectedBranch
    const isDifferentFile =
      preferredFile != null && preferredFile.length > 0 && preferredFile !== selectedFile

    if (isDifferentRepo || isDifferentBranch || isDifferentFile) {
      connectToRepository(parsed.owner, parsed.repo, {
        preferredBranch,
        preferredFile,
      }).catch((error) => {
        setActionError(
          error instanceof Error ? error.message : "Failed to open repository",
        )
      })
    }
  }, [connectToRepository, owner, repo, searchParams, selectedBranch, selectedFile])

  const refreshRepository = useCallback(() => {
    if (!owner || !repo || !selectedBranch) return
    setActionMessage("")
    loadTree(owner, repo, selectedBranch)
  }, [loadTree, owner, repo, selectedBranch])

  const handleCreateFile = useCallback(
    async (path: string) => {
      if (!owner || !repo) return
      setActionError("")
      try {
        await ghPost("commit_file", {
          owner,
          repo,
          path,
          content: "",
          branch: selectedBranch,
          message: `Create ${path}`,
        })
        setActionMessage(`Committed new file ${path} to ${selectedBranch}.`)
        setSelectedFile(path)
        await loadTree(owner, repo, selectedBranch)
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Failed to create file",
        )
      }
    },
    [ghPost, loadTree, owner, repo, selectedBranch],
  )

  const handleCreateFolder = useCallback(
    async (path: string) => {
      if (!owner || !repo) return
      setActionError("")
      try {
        await ghPost("create_folder", {
          owner,
          repo,
          path,
          branch: selectedBranch,
          message: `Create folder ${path}`,
        })
        setActionMessage(`Committed new folder ${path} to ${selectedBranch}.`)
        await loadTree(owner, repo, selectedBranch)
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Failed to create folder",
        )
      }
    },
    [ghPost, loadTree, owner, repo, selectedBranch],
  )

  const handleRenamePath = useCallback(
    async (oldPath: string, newPath: string) => {
      if (!owner || !repo) return
      setActionError("")
      try {
        await ghPost("rename_path", {
          owner,
          repo,
          oldPath,
          newPath,
          branch: selectedBranch,
          message: `Rename ${oldPath} to ${newPath}`,
        })
        if (selectedFile === oldPath) {
          setSelectedFile(newPath)
        }
        setActionMessage(`Committed rename from ${oldPath} to ${newPath}.`)
        await loadTree(owner, repo, selectedBranch)
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Failed to rename path",
        )
      }
    },
    [ghPost, loadTree, owner, repo, selectedBranch, selectedFile],
  )

  const handleDeletePath = useCallback(
    async (path: string, type: "file" | "folder") => {
      if (!owner || !repo) return
      const confirmed = window.confirm(
        `Delete ${type} ${path}? This will create a real GitHub commit on ${selectedBranch}.`,
      )
      if (!confirmed) return

      setActionError("")
      try {
        await ghPost("delete_path", {
          owner,
          repo,
          path,
          branch: selectedBranch,
          message: `Delete ${path}`,
        })
        if (selectedFile === path || selectedFile?.startsWith(`${path}/`)) {
          setSelectedFile(null)
        }
        setActionMessage(`Committed deletion of ${path}.`)
        await loadTree(owner, repo, selectedBranch)
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Failed to delete path",
        )
      }
    },
    [ghPost, loadTree, owner, repo, selectedBranch, selectedFile],
  )

  const handleCreateBranch = useCallback(async () => {
    if (!owner || !repo) return
    const newBranch = window.prompt("New branch name")
    if (!newBranch?.trim()) return

    setActionError("")
    try {
      await ghPost("create_branch", {
        owner,
        repo,
        newBranch: newBranch.trim(),
        baseBranch: selectedBranch || defaultBranch,
      })
      setActionMessage(
        `Created branch ${newBranch.trim()} from ${selectedBranch || defaultBranch}.`,
      )
      await loadBranches(owner, repo, newBranch.trim())
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to create branch",
      )
    }
  }, [defaultBranch, ghPost, loadBranches, owner, repo, selectedBranch])

  const handleCreatePullRequest = useCallback(async () => {
    if (!owner || !repo) return
    if (!selectedBranch || selectedBranch === defaultBranch) {
      setActionError(
        "Create or switch to a feature branch before opening a pull request.",
      )
      return
    }

    const title = window.prompt("Pull request title")
    if (!title?.trim()) return
    const body = window.prompt("Pull request description (optional)") ?? ""

    setActionError("")
    try {
      const data = await ghPost("create_pr", {
        owner,
        repo,
        title: title.trim(),
        head: selectedBranch,
        base: defaultBranch,
        body,
      })
      const result = data.result as { html_url?: string; number?: number } | undefined
      setActionMessage(
        result?.html_url
          ? `Pull request created: ${result.html_url}`
          : `Pull request #${result?.number ?? ""} created.`,
      )
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to create pull request",
      )
    }
  }, [defaultBranch, ghPost, owner, repo, selectedBranch])

  const handleFileSaved = useCallback(() => {
    refreshRepository()
    setActionMessage(`Committed changes on ${selectedBranch}.`)
  }, [refreshRepository, selectedBranch])

  const orgBadgeLabel = useMemo(() => {
    if (!orgId) return "Personal mode"
    return orgSlug ? `Team ${orgSlug}` : `Team ${orgId}`
  }, [orgId, orgSlug])

  if (!owner || !repo) {
    return (
      <div className="flex items-center justify-center h-full min-h-[calc(100vh-4rem)]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <FolderGit2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h2 className="text-lg font-semibold">Open a GitHub Repository</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Real edits, real commits, real branches, directly on GitHub.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="owner/repo or GitHub URL"
                value={repoInput}
                onChange={(event) => {
                  setRepoInput(event.target.value)
                  if (actionError) setActionError("")
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleConnect()
                }}
                className="flex-1"
              />
              <Button onClick={() => void handleConnect()} disabled={!repoInput.trim()}>
                Open
              </Button>
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{orgBadgeLabel}</Badge>
              <span>Example: openai/openai-python or https://github.com/openai/openai-python</span>
            </div>
            {actionError ? (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {actionError}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0">
        <Badge variant="outline" className="gap-1.5 text-sm font-mono">
          <FolderGit2 className="h-3.5 w-3.5" />
          {owner}/{repo}
        </Badge>

        <Badge variant="secondary" className="gap-1.5 text-xs">
          <Shield className="h-3 w-3" />
          {orgBadgeLabel}
        </Badge>

        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          {branchLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="h-8 w-[190px] text-xs">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.name} value={branch.name}>
                    <span className="flex items-center gap-1.5">
                      {branch.name}
                      {branch.protected ? (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          protected
                        </Badge>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={() => void handleCreateBranch()}
          >
            <Plus className="h-3.5 w-3.5" />
            Branch
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={() => void handleCreatePullRequest()}
          >
            <GitPullRequest className="h-3.5 w-3.5" />
            Create PR
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1"
            onClick={refreshRepository}
            disabled={treeLoading}
          >
            {treeLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setOwner("")
              setRepo("")
              setRepoInput("")
              setBranches([])
              setSelectedFile(null)
              setTreeEntries([])
              setActionError("")
              setActionMessage("")
            }}
          >
            Change Repo
          </Button>
        </div>
      </div>

      {actionError ? (
        <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {actionError}
        </div>
      ) : null}

      {!actionError && actionMessage ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          {actionMessage}
        </div>
      ) : null}

      <div className="flex flex-1 min-h-0">
        <div className="w-72 border-r flex-shrink-0 overflow-hidden">
          <FileTree
            entries={treeEntries}
            selectedPath={selectedFile}
            onSelectFile={setSelectedFile}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onRenamePath={handleRenamePath}
            onDeletePath={handleDeletePath}
            onRefresh={refreshRepository}
            isLoading={treeLoading}
          />
        </div>

        <div className="flex-1 min-w-0">
          {treeError ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
                <p className="text-sm text-destructive">{treeError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1"
                  onClick={refreshRepository}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            <CodeEditor
              owner={owner}
              repo={repo}
              branch={selectedBranch}
              filePath={selectedFile}
              onSaved={handleFileSaved}
            />
          )}
        </div>
      </div>
    </div>
  )
}
