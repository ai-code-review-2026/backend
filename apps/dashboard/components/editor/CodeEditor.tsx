"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import dynamic from "next/dynamic"
import {
  Save,
  GitBranch,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Undo2,
  X,
  Sparkles,
  Wand2,
  SplitSquareVertical,
  GitCompareArrows,
  Edit3,
  Play,
} from "lucide-react"
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
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin mr-2" />
      Loading editor...
    </div>
  ),
})

// ── Types ────────────────────────────────────────────────────────────────────

interface CodeEditorProps {
  owner: string
  repo: string
  branch: string
  filePath: string | null
  onSaved?: () => void
  saveTrigger?: number
  onBranchResolved?: (branch: string) => void
  findingId?: string | null
  findingDescription?: string | null
}

type EditorStatus = "idle" | "loading" | "saving" | "saved" | "error" | "conflict" | "ai-fixing"

// ── Language detection ───────────────────────────────────────────────────────

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    rb: "ruby",
    php: "php",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    r: "r",
    sql: "sql",
    html: "html",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    md: "markdown",
    mdx: "markdown",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    dockerfile: "dockerfile",
    toml: "ini",
    ini: "ini",
    cfg: "ini",
    env: "plaintext",
    txt: "plaintext",
    gitignore: "plaintext",
    lock: "plaintext",
  }
  return langMap[ext] ?? "plaintext"
}

function getFileName(path: string): string {
  const parts = path.split("/")
  return parts[parts.length - 1] || path
}

function statusChip(status: EditorStatus): {
  label: string
  color: string
  border: string
  background: string
} {
  if (status === "loading" || status === "saving") {
    return {
      label: status === "loading" ? "Loading" : "Committing",
      color: "#9bb1d8",
      border: "rgba(143,177,255,0.35)",
      background: "rgba(143,177,255,0.1)",
    }
  }
  if (status === "ai-fixing") {
    return {
      label: "AI Fixing...",
      color: "#c084fc",
      border: "rgba(192,132,252,0.4)",
      background: "rgba(192,132,252,0.12)",
    }
  }
  if (status === "saved") {
    return {
      label: "Saved",
      color: "#8ce6ad",
      border: "rgba(76,175,80,0.4)",
      background: "rgba(76,175,80,0.12)",
    }
  }
  if (status === "conflict") {
    return {
      label: "Conflict",
      color: "#ffb4b0",
      border: "rgba(255,95,87,0.45)",
      background: "rgba(255,95,87,0.12)",
    }
  }
  return {
    label: "Error",
    color: "#ffb4b0",
    border: "rgba(255,95,87,0.45)",
    background: "rgba(255,95,87,0.12)",
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function CodeEditor({
  owner,
  repo,
  branch,
  filePath,
  onSaved,
  saveTrigger,
  onBranchResolved,
  findingId,
  findingDescription,
}: CodeEditorProps) {
  const [content, setContent] = useState("")
  const [originalContent, setOriginalContent] = useState("")
  const [status, setStatus] = useState<EditorStatus>("idle")
  const [statusMessage, setStatusMessage] = useState("")
  const [isDirty, setIsDirty] = useState(false)
  const [commitMessage, setCommitMessage] = useState("")
  const [effectiveBranch, setEffectiveBranch] = useState(branch)
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<"edit" | "diff" | "split">("edit")
  const editorRef = useRef<unknown>(null)
  const lastExternalSaveTrigger = useRef<number | undefined>(saveTrigger)
  const mountedRef = useRef(false)
  const resetStatusTimerRef = useRef<number | null>(null)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      if (resetStatusTimerRef.current) {
        clearTimeout(resetStatusTimerRef.current)
        resetStatusTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setEffectiveBranch(branch)
  }, [branch])

  // Validate repository coordinates on mount
  useEffect(() => {
    const repoString = `${owner}/${repo}`
    const validation = validateRepoCoordinates(repoString)
    
    if (!validation.isValid) {
      console.error("[CodeEditor] Invalid repository coordinates:", {
        input: repoString,
        error: validation.error,
        normalized: validation.normalized
      })
      setStatus("error")
      setStatusMessage(`Invalid repository format: ${validation.error}`)
      return
    }
    
    console.log("[CodeEditor] Repository validation passed:", validation)
  }, [owner, repo])

  const ghPost = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      const repoString = `${owner}/${repo}`
      
      try {
        return await callGitHubAPI(action, payload, {
          repository: repoString,
          operation: action
        })
      } catch (error) {
        // Enhanced error logging is already handled in callGitHubAPI
        throw error
      }
    },
    [owner, repo],
  )

  // Load file content when filePath changes
  useEffect(() => {
    if (!filePath || !owner || !repo) {
      setContent("")
      setOriginalContent("")
      setIsDirty(false)
      setStatus("idle")
      return
    }

    let cancelled = false
    setStatus("loading")
    setStatusMessage("Loading file...")

    const tryLoadFromBranch = async (candidateBranch: string) => {
      const { response, data } = await ghPost("get_file", {
        owner,
        repo,
        path: filePath,
        ref: candidateBranch,
      })
      return { response, data, branch: candidateBranch }
    }

    const load = async () => {
      try {
        const firstTry = await tryLoadFromBranch(branch)

        let successfulLoad = firstTry
        if (!firstTry.response.ok && firstTry.response.status === 404) {
          const listBranches = await ghPost("list_branches", { owner, repo })
          if (!listBranches.response.ok) {
            throw new Error(
              extractApiErrorMessage(listBranches.data, "Failed to resolve repository branches"),
            )
          }

          const branchNames = Array.isArray(listBranches.data?.result)
            ? listBranches.data.result
                .map((item: unknown) =>
                  typeof (item as { name?: unknown })?.name === "string"
                    ? (item as { name: string }).name.trim()
                    : "",
                )
                .filter((name: string) => name.length > 0)
            : []

          const fallbackCandidates = Array.from(
            new Set([
              ...branchNames,
              "main",
              "master",
            ]),
          ).filter((candidate) => candidate !== branch)

          let loadedFromFallback = false
          for (const candidate of fallbackCandidates) {
            const tryCandidate = await tryLoadFromBranch(candidate)
            if (tryCandidate.response.ok) {
              successfulLoad = tryCandidate
              loadedFromFallback = true
              break
            }
          }

          if (!loadedFromFallback && !successfulLoad.response.ok) {
            throw new Error(extractApiErrorMessage(firstTry.data, "Failed to load file"))
          }
        } else if (!firstTry.response.ok) {
          throw new Error(extractApiErrorMessage(firstTry.data, "Failed to load file"))
        }

        if (cancelled) return

        const fileContent =
          typeof successfulLoad.data?.content === "string"
            ? successfulLoad.data.content
            : ""
        setContent(fileContent)
        setOriginalContent(fileContent)
        setIsDirty(false)
        setStatus("idle")
        setStatusMessage("")
        setCommitMessage("")

        setEffectiveBranch(successfulLoad.branch)
        if (successfulLoad.branch !== branch) {
          onBranchResolved?.(successfulLoad.branch)
        }
      } catch (err) {
        if (cancelled) return
        
        // Enhanced error logging with context
        logGitHubError(err, {
          operation: "load_file",
          owner,
          repo,
          filePath,
          branch,
          additionalInfo: {
            effectiveBranch,
            debugInfo: collectDebugInfo({ repo: `${owner}/${repo}` }, { owner, repo })
          }
        })
        
        setStatus("error")
        const errorMessage = err instanceof Error ? err.message : "Failed to load file"
        setStatusMessage(errorMessage)
        
        // Show user-friendly error toast
        showGitHubErrorToast(err as any, { operation: "load file" })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [filePath, owner, repo, branch, ghPost, onBranchResolved])

  // Track changes
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const newContent = value ?? ""
      setContent(newContent)
      setIsDirty(newContent !== originalContent)
    },
    [originalContent],
  )

  // Save file (commit to GitHub)
  const handleSave = useCallback(async () => {
    if (!filePath || !isDirty) return

    setStatus("saving")
    setStatusMessage("Committing to GitHub...")

    try {
      const { response: res, data } = await callGitHubAPI("commit_file", {
        owner,
        repo,
        path: filePath,
        content,
        branch: effectiveBranch,
        message:
          commitMessage.trim() ||
          `Update ${filePath.split("/").pop()} via Devora`,
      }, {
        repository: `${owner}/${repo}`,
        operation: "commit_file"
      })

      if (res.status === 409) {
        if (!mountedRef.current) return
        setStatus("conflict")
        setStatusMessage(
          "Merge conflict detected. The file was modified on GitHub. Please refresh and merge your changes.",
        )
        return
      }

      if (!res.ok) throw new Error(extractApiErrorMessage(data, "Failed to save"))
      if (!mountedRef.current) return

      setOriginalContent(content)
      setIsDirty(false)
      setStatus("saved")
      setStatusMessage("Committed successfully!")
      setCommitMessage("")
      onSaved?.()

      if (resetStatusTimerRef.current) {
        clearTimeout(resetStatusTimerRef.current)
      }
      resetStatusTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return
        setStatus((current) => (current === "saved" ? "idle" : current))
        resetStatusTimerRef.current = null
      }, 3000)
    } catch (err) {
      if (!mountedRef.current) return

      // Enhanced error logging with context
      logGitHubError(err, {
        operation: "commit_file",
        owner,
        repo,
        filePath,
        branch: effectiveBranch,
        additionalInfo: {
          contentLength: content.length,
          commitMessage: commitMessage.trim(),
          debugInfo: collectDebugInfo({ repo: `${owner}/${repo}` }, { owner, repo })
        }
      })
      
      setStatus("error")
      const errorMessage = err instanceof Error ? err.message : "Failed to save file"
      setStatusMessage(errorMessage)
      
      // Show user-friendly error toast
      showGitHubErrorToast(err as any, { operation: "save file" })
    }
  }, [filePath, isDirty, content, owner, repo, effectiveBranch, commitMessage, onSaved])

  const handleEditorBeforeMount = useCallback((monaco: unknown) => {
    const instance = monaco as {
      editor: {
        defineTheme: (
          themeName: string,
          themeData: {
            base: string
            inherit: boolean
            colors: Record<string, string>
            rules: Array<{ token: string; foreground?: string; fontStyle?: string }>
          },
        ) => void
      }
    }

    instance.editor.defineTheme("ai-carbon-dark", {
      base: "vs-dark",
      inherit: true,
      colors: {
        "editor.background": "#101113",
        "editor.foreground": "#d7dce5",
        "editorLineNumber.foreground": "#515763",
        "editorLineNumber.activeForeground": "#8e97a8",
        "editorLineHighlightBackground": "#171a20",
        "editorCursor.foreground": "#90a8ff",
        "editor.selectionBackground": "#2d3d5980",
        "editor.inactiveSelectionBackground": "#27354d66",
        "editorWhitespace.foreground": "#2a2f38",
        "editorIndentGuide.background1": "#20252f",
        "editorIndentGuide.activeBackground1": "#343d4e",
        "editorGutter.addedBackground": "#2f8f4f",
        "editorGutter.deletedBackground": "#a23f3f",
        "editorGutter.modifiedBackground": "#3b6ca8",
        "editorOverviewRuler.border": "#00000000",
      },
      rules: [
        { token: "comment", foreground: "6f7787", fontStyle: "italic" },
        { token: "keyword", foreground: "ff8a65" },
        { token: "string", foreground: "9acb7f" },
        { token: "number", foreground: "d8c47a" },
        { token: "function", foreground: "8ab4ff" },
        { token: "type", foreground: "5dd0ff" },
      ],
    })
  }, [])

  // Keyboard shortcut: Ctrl+S
  const handleEditorMount = useCallback(
    (editor: unknown) => {
      editorRef.current = editor
      const monacoEditor = editor as {
        addCommand: (keyBinding: number, handler: () => void) => void
      }
      const monaco = (
        window as Window & {
          monaco?: {
            KeyMod: { CtrlCmd: number }
            KeyCode: { KeyS: number }
          }
        }
      ).monaco
      if (monaco) {
        monacoEditor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => handleSave(),
        )
      }
    },
    [handleSave],
  )

  // Allow parent components to trigger a real GitHub commit.
  useEffect(() => {
    if (saveTrigger === undefined) return
    if (saveTrigger === lastExternalSaveTrigger.current) return
    lastExternalSaveTrigger.current = saveTrigger
    void handleSave()
  }, [saveTrigger, handleSave])

  // Revert changes
  const handleRevert = useCallback(() => {
    setContent(originalContent)
    setIsDirty(false)
    setStatus("idle")
    setStatusMessage("")
    setAiSuggestion(null)
  }, [originalContent])

  // Fix with AI
  const handleAiFix = useCallback(async () => {
    if (!filePath || !content) return

    setStatus("ai-fixing")
    setStatusMessage("AI is analyzing and fixing the code...")

    try {
      const res = await fetch("/api/dashboard/ai/fix-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath,
          content,
          language: detectLanguage(filePath),
          findingId,
          findingDescription,
          context: {
            owner,
            repo,
            branch: effectiveBranch,
          },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "AI fix failed"))
      }

      if (!mountedRef.current) return

      if (data.fixedContent && data.fixedContent !== content) {
        setAiSuggestion(data.fixedContent)
        setContent(data.fixedContent)
        setIsDirty(true)
        setStatus("idle")
        setStatusMessage("")
        setCommitMessage(data.commitMessage || `AI fix: ${findingDescription || 'Code improvement'}`)
      } else {
        setStatus("idle")
        setStatusMessage("No changes suggested by AI")
        if (resetStatusTimerRef.current) {
          clearTimeout(resetStatusTimerRef.current)
        }
        resetStatusTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current) return
          setStatusMessage("")
          resetStatusTimerRef.current = null
        }, 3000)
      }
    } catch (err) {
      if (!mountedRef.current) return
      setStatus("error")
      setStatusMessage(
        err instanceof Error ? err.message : "AI fix failed",
      )
    }
  }, [filePath, content, findingId, findingDescription, owner, repo, effectiveBranch])

  // Accept AI suggestion
  const handleAcceptAiSuggestion = useCallback(() => {
    // Already applied in handleAiFix
    setAiSuggestion(null)
  }, [])

  // Reject AI suggestion
  const handleRejectAiSuggestion = useCallback(() => {
    if (aiSuggestion) {
      setContent(originalContent)
      setIsDirty(false)
      setAiSuggestion(null)
      setCommitMessage("")
    }
  }, [aiSuggestion, originalContent])

  if (!filePath) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-md border"
        style={{ borderColor: "#232832", background: "#0f1012", color: "#7f8ca3" }}
      >
        <div className="text-center">
          <p className="text-lg font-medium">No file selected</p>
          <p className="text-sm mt-1">
            Select a file from the explorer to start editing
          </p>
        </div>
      </div>
    )
  }

  const language = detectLanguage(filePath)
  const fileName = getFileName(filePath)
  const statusInfo =
    status === "error" || status === "conflict" || status === "loading" || status === "saving" || status === "saved" || status === "ai-fixing"
      ? statusChip(status)
      : null

  return (
    <>
      <div
        className="flex h-full flex-col overflow-hidden rounded-md border"
        style={{ borderColor: "#232832", background: "#0f1012", color: "#d7dce5" }}
      >
      <div
        className="flex h-7 items-center border-b px-3"
        style={{ borderColor: "#232832", background: "#15171a" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
        </div>
        <span className="ml-auto text-[10px]" style={{ color: "#606878" }}>
          {owner}/{repo}
        </span>
      </div>

      <div
        className="flex h-9 items-end border-b px-2"
        style={{ borderColor: "#232832", background: "#101214" }}
      >
        <div
          className="flex h-8 items-center gap-2 rounded-t-md border border-b-0 px-3"
          style={{ borderColor: "#2b313c", background: "#121418" }}
        >
          <span className="text-[11px] font-medium" style={{ color: "#c6cedd" }}>
            {fileName}
          </span>
          <X className="h-3.5 w-3.5" style={{ color: "#555d6a" }} />
        </div>
        <div className="ml-auto flex items-center gap-1 pb-1">
          <span
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px]"
            style={{ borderColor: "#2f3643", background: "#171b22", color: "#8fa2c8" }}
          >
            <GitBranch className="h-3 w-3" />
            {effectiveBranch}
          </span>
          <span
            className="rounded border px-2 py-0.5 text-[10px]"
            style={{ borderColor: "#2f3643", background: "#171b22", color: "#95a4c6" }}
          >
            {language}
          </span>
          {isDirty && status !== "saving" && (
            <span
              className="rounded border px-2 py-0.5 text-[10px]"
              style={{ borderColor: "rgba(255,188,46,0.45)", background: "rgba(255,188,46,0.12)", color: "#ffd27b" }}
            >
              Modified
            </span>
          )}
          {statusInfo && (
            <span
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px]"
              style={{
                borderColor: statusInfo.border,
                background: statusInfo.background,
                color: statusInfo.color,
              }}
            >
              {(status === "loading" || status === "saving") && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {status === "saved" && <CheckCircle2 className="h-3 w-3" />}
              {(status === "error" || status === "conflict") && (
                <AlertCircle className="h-3 w-3" />
              )}
              {statusInfo.label}
            </span>
          )}
        </div>
      </div>

      {/* Error / conflict message */}
      {(status === "error" || status === "conflict") && statusMessage && (
        <div
          className="border-b px-3 py-2 text-xs"
          style={{
            borderColor:
              status === "conflict"
                ? "rgba(255,188,46,0.35)"
                : "rgba(255,95,87,0.35)",
            background:
              status === "conflict"
                ? "rgba(255,188,46,0.1)"
                : "rgba(255,95,87,0.1)",
            color: status === "conflict" ? "#ffd27b" : "#ffb4b0",
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0 border-b" style={{ borderColor: "#232832" }}>
        <MonacoEditor
          height="100%"
          beforeMount={handleEditorBeforeMount}
          language={language}
          value={content}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          theme="ai-carbon-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            fontLigatures: true,
            lineNumbers: "on",
            lineNumbersMinChars: 4,
            wordWrap: "off",
            tabSize: 2,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            renderWhitespace: "selection",
            renderLineHighlight: "line",
            cursorStyle: "line-thin",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: true,
            guides: { indentation: true, bracketPairs: true },
            padding: { top: 10, bottom: 10 },
          }}
        />
      </div>

      {/* Commit bar */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: "#14171c" }}
      >
        <GitBranch className="h-3.5 w-3.5 shrink-0" style={{ color: "#7f8ca3" }} />
        <span className="text-xs shrink-0" style={{ color: "#7f8ca3" }}>{effectiveBranch}</span>

        <input
          placeholder="Commit message (optional)"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          className="h-8 flex-1 rounded border px-2 text-xs outline-none"
          style={{
            borderColor: "#2e3440",
            background: "#101317",
            color: "#d7dce5",
          }}
          disabled={!isDirty || status === "saving"}
        />

        {/* AI Fix Button */}
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded border px-2 text-xs font-medium disabled:opacity-50"
          style={{
            borderColor: "rgba(168,85,247,0.4)",
            background: "rgba(168,85,247,0.15)",
            color: "#c084fc",
          }}
          onClick={handleAiFix}
          disabled={status === "saving" || status === "loading" || status === "ai-fixing" || !content}
          title="Fix code issues with AI"
        >
          {status === "ai-fixing" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          Fix with AI
        </button>

        {/* AI Suggestion Actions */}
        {aiSuggestion && (
          <>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded border px-2 text-xs"
              style={{
                borderColor: "rgba(76,175,80,0.4)",
                background: "rgba(76,175,80,0.12)",
                color: "#8ce6ad",
              }}
              onClick={handleAcceptAiSuggestion}
              title="Accept AI suggestion"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Accept
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded border px-2 text-xs"
              style={{
                borderColor: "rgba(255,95,87,0.35)",
                background: "rgba(255,95,87,0.1)",
                color: "#ffb4b0",
              }}
              onClick={handleRejectAiSuggestion}
              title="Reject AI suggestion"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
          </>
        )}

        {isDirty && !aiSuggestion && (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded border px-2 text-xs"
            style={{
              borderColor: "#364052",
              background: "#171d27",
              color: "#9eb0d3",
            }}
            onClick={handleRevert}
            title="Revert changes"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Revert
          </button>
        )}

        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded border px-3 text-xs font-medium disabled:opacity-50"
          style={{
            borderColor: "#1e5e35",
            background: "#1e7a43",
            color: "#e7fff0",
          }}
          onClick={handleSave}
          disabled={!isDirty || status === "saving" || status === "loading"}
        >
          {status === "saving" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Commit
        </button>
        </div>
      </div>

      {/* Toolbar with Split, Diff, Edit, Save, Run buttons */}
      <div
        className="flex h-10 items-center justify-between border-b px-3"
        style={{ borderColor: "#232832", background: "#101214" }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors"
            style={{
              borderColor: editorMode === "split" ? "#3d5a80" : "#2e3440",
              background: editorMode === "split" ? "#1e3a5f" : "#171b22",
              color: editorMode === "split" ? "#90b4ff" : "#8fa2c8",
            }}
            onClick={() => setEditorMode("split")}
            title="Split view"
          >
            <SplitSquareVertical className="h-3.5 w-3.5" />
            Split
          </button>
          
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors"
            style={{
              borderColor: editorMode === "diff" ? "#3d5a80" : "#2e3440",
              background: editorMode === "diff" ? "#1e3a5f" : "#171b22",
              color: editorMode === "diff" ? "#90b4ff" : "#8fa2c8",
            }}
            onClick={() => setEditorMode("diff")}
            title="Diff view"
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
            Diff
          </button>
          
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors"
            style={{
              borderColor: editorMode === "edit" ? "#3d5a80" : "#2e3440",
              background: editorMode === "edit" ? "#1e3a5f" : "#171b22",
              color: editorMode === "edit" ? "#90b4ff" : "#8fa2c8",
            }}
            onClick={() => setEditorMode("edit")}
            title="Edit mode"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              borderColor: "#1e5e35",
              background: "#1e7a43",
              color: "#e7fff0",
            }}
            onClick={handleSave}
            disabled={!isDirty || status === "saving" || status === "loading"}
            title="Save changes"
          >
            {status === "saving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </button>
          
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors"
            style={{
              borderColor: "#2e3440",
              background: "#171b22",
              color: "#8fa2c8",
            }}
            onClick={() => {
              // TODO: Add run functionality
              console.log("Run clicked")
            }}
            title="Run code"
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </button>
        </div>
      </div>
    </>
  )
}
