"use client"

import React, { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"

// Dynamic import to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false }) as any

// This component wires Yjs + Monaco for realtime editing and exposes simple save/branch/pr actions
export default function MonacoYEditor({
  owner = "",
  repo = "",
  path = "README.md",
  branch = "main",
  room = "default-room",
  initial = "",
}: {
  owner?: string
  repo?: string
  path?: string
  branch?: string
  room?: string
  initial?: string
}) {
  const editorRef = useRef<any>(null)
  const changeDisposable = useRef<any>(null)
  const providerRef = useRef<any>(null)
  const [peers, setPeers] = useState<any[]>([])
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [conflict, setConflict] = useState<any | null>(null)
  const savingRef = useRef(false)

  useEffect(() => {
    let ydoc: any = null
    let provider: any = null
    let monacoBinding: any = null

    async function init() {
      try {
        setStatus("loading")
        const Y = (await import("yjs")).default || (await import("yjs"))
        const { WebsocketProvider } = await import("y-websocket")
        const { MonacoBinding } = await import("y-monaco")

        ydoc = new Y.Doc()
        provider = new WebsocketProvider((process.env.NEXT_PUBLIC_Y_WEBSOCKET_URL as string) || "wss://demos.yjs.dev", room, ydoc)
        const ytext = ydoc.getText("monaco")

        // Wait for editor to be ready
        const editor = editorRef.current?.editor || null
        if (!editor) {
          setStatus("editor-unavailable")
          return
        }
        // Apply initial content if empty
        if (ytext.length === 0 && initial) {
          ytext.insert(0, initial)
        }
        monacoBinding = new MonacoBinding(ytext, editor.getModel(), new Set([editor]), provider.awareness)
        // mark editor as dirty when local edits occur
        changeDisposable.current = editor.onDidChangeModelContent(() => {
          setDirty(true)
        })

        // awareness / presence
        providerRef.current = provider
        const awareness = provider.awareness
        try {
          if (awareness) {
            awareness.setLocalStateField("user", { name: "anonymous", color: "#" + Math.floor(Math.random() * 16777215).toString(16) })
            const updatePeers = () => {
              const states = Array.from(awareness.getStates().values()).map((s: any) => (s?.user || {}))
              setPeers(states)
            }
            awareness.on("change", updatePeers)
            updatePeers()
          }
        } catch (e) {
          // ignore awareness errors
        }
        changeDisposable.current = editor.onDidChangeModelContent(() => {
          setDirty(true)
        })
        setStatus("connected")
        setReady(true)
      } catch (err: any) {
        console.error("MonacoYEditor init error", err)
        setStatus(`error: ${err?.message ?? String(err)}`)
      }
    }

    init()

    return () => {
      try {
        if (changeDisposable.current) changeDisposable.current.dispose?.()
      } catch (_e) {
        // ignore
      }
    }
  }, [room, initial])

  // Save file by calling the dashboard github proxy route. Requires auth (Clerk) in server.
  async function saveFile(message?: string) {
    if (!editorRef.current?.editor) {
      setStatus("no-editor")
      return
    }
    if (!owner || !repo || !path || !branch) {
      setStatus("missing-repo-info")
      return
    }
    const content = editorRef.current.editor.getValue()
    setStatus("saving")
    savingRef.current = true
    try {
      const resp = await fetch("/api/dashboard/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit_file",
          payload: { owner, repo, path, content, branch, message: message ?? `Autosave by MonacoYEditor` },
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || "Save failed")
      setLastSavedAt(Date.now())
      setDirty(false)
      setStatus("saved")
      return data
    } catch (err: any) {
      console.error("saveFile error", err)
      setStatus(`error: ${err?.message ?? String(err)}`)
      throw err
    } finally {
      savingRef.current = false
    }
  }

  async function createBranch(newBranchName: string) {
    if (!owner || !repo || !newBranchName) return setStatus("missing-branch-info")
    setStatus("creating-branch")
    try {
      const resp = await fetch("/api/dashboard/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_branch",
          payload: { owner, repo, newBranch: newBranchName, baseBranch: branch },
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || "create branch failed")
      setStatus("branch-created")
      return data
    } catch (err: any) {
      console.error("createBranch error", err)
      setStatus(`error: ${err?.message ?? String(err)}`)
      throw err
    }
  }

  async function createPR(title: string, bodyText?: string, headBranch?: string) {
    if (!owner || !repo || !title || !headBranch) return setStatus("missing-pr-info")
    setStatus("creating-pr")
    try {
      const resp = await fetch("/api/dashboard/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_pr",
          payload: { owner, repo, title, head: headBranch, base: branch, body: bodyText ?? "" },
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || "create PR failed")
      setStatus("pr-created")
      return data
    } catch (err: any) {
      console.error("createPR error", err)
      setStatus(`error: ${err?.message ?? String(err)}`)
      throw err
    }
  }

  async function handleSave(message?: string) {
    if (!editorRef.current?.editor) {
      setStatus("no-editor")
      return
    }
    if (!owner || !repo || !path || !branch) {
      setStatus("missing-repo-info")
      return
    }
    const content = editorRef.current.editor.getValue()
    setStatus("saving")
    savingRef.current = true
    try {
      const resp = await fetch("/api/dashboard/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit_file",
          payload: { owner, repo, path, content, branch, message: message ?? `Manual save by MonacoYEditor` },
        }),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok) {
        if (data?.details?.conflict) {
          setConflict(data.details)
          setStatus("conflict")
          return data
        }
        throw new Error(data?.error || "Save failed")
      }
      setLastSavedAt(Date.now())
      setDirty(false)
      setStatus("saved")
      return data
    } catch (err: any) {
      console.error("handleSave error", err)
      setStatus(`error: ${err?.message ?? String(err)}`)
      throw err
    } finally {
      savingRef.current = false
    }
  }

  async function forceCommitFile(newBranchName?: string, message?: string) {
    if (!owner || !repo || !path) {
      setStatus("missing-repo-info")
      return
    }
    setStatus("force-creating-branch")
    try {
      const resp = await fetch("/api/dashboard/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "force_commit_file",
          payload: { owner, repo, path, content: editorRef.current?.editor?.getValue() ?? "", newBranch: newBranchName },
        }),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error(data?.error || "Force commit failed")
      setConflict(null)
      setStatus("force-commit-success")
      alert(`Committed to branch ${data.branch}`)
      return data
    } catch (err: any) {
      console.error("forceCommitFile error", err)
      setStatus(`error: ${err?.message ?? String(err)}`)
      throw err
    }
  }

  // Simple autosave timer - commits only when editor is dirty and not already saving
  useEffect(() => {
    const interval = setInterval(() => {
      if (dirty && !savingRef.current) {
        saveFile().catch(() => {
          /* swallow - status updated in saveFile */
        })
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [dirty])

  return (
    <div>
      <div style={{ height: 420, border: "1px solid #e5e7eb" }}>
        <MonacoEditor
          height="420"
          defaultLanguage="typescript"
          defaultValue={initial}
          onMount={(editor: any) => {
            editorRef.current = { editor }
          }}
        />
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <strong>Status:</strong>
          <span>{status ?? "idle"}</span>
          {peers.length ? <span style={{ marginLeft: 8, color: "var(--teal)" }}> • {peers.length} online: {peers.map(p => p.name || 'anon').join(', ')}</span> : null}
          {dirty ? <span style={{ color: "#b91c1c" }}>• unsaved</span> : null}
          {lastSavedAt ? <span style={{ color: "#065f46" }}> • saved {new Date(lastSavedAt).toLocaleTimeString()}</span> : null}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => handleSave("Manual save from editor").catch((e) => console.warn(e))}
            disabled={savingRef.current}
          >
            Save
          </button>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <details>
          <summary>Advanced</summary>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <input placeholder="new-branch-name" id="new-branch-name" />
            <button
              onClick={async () => {
                const el: any = document.getElementById("new-branch-name") as HTMLInputElement
                const name = el?.value?.trim()
                if (!name) return setStatus("branch-name-required")
                try {
                  await createBranch(name)
                  setStatus("branch-created-success")
                } catch (e) {
                  /* handled in createBranch */
                }
              }}
            >
              Create Branch
            </button>
            <input placeholder="PR title" id="pr-title" />
            <button
              onClick={async () => {
                const titleEl: any = document.getElementById("pr-title") as HTMLInputElement
                const title = titleEl?.value?.trim()
                const branchEl: any = document.getElementById("new-branch-name") as HTMLInputElement
                const head = branchEl?.value?.trim()
                if (!title || !head) return setStatus("pr-requires-title-and-head")
                try {
                  await createPR(title, undefined, head)
                  setStatus("pr-created-success")
                } catch (e) {
                  /* handled */
                }
              }}
            >
              Create PR from branch
            </button>
            <div style={{ marginLeft: 16 }}>
              <input placeholder="PR #" id="inline-pr-number" style={{ width: 100 }} />
              <button
                onClick={async () => {
                  const prEl: any = document.getElementById("inline-pr-number") as HTMLInputElement
                  const prNum = prEl?.value?.trim() ? Number(prEl.value.trim()) : NaN
                  if (!prNum || !owner || !repo) { setStatus('missing-pr-or-repo'); return }
                  try {
                    const editor = editorRef.current?.editor
                    const sel = editor.getSelection()
                    const selectedText = editor.getModel().getValueInRange(sel)
                    const context = editor.getModel().getValueInRange({
                      startLineNumber: Math.max(1, sel.startLineNumber - 3),
                      startColumn: 1,
                      endLineNumber: Math.min(editor.getModel().getLineCount(), sel.endLineNumber + 3),
                      endColumn: 1e9,
                    })
                    const body = `Inline comment on file ${path}\n\nSelection:\n${selectedText}\n\nContext:\n${context}`
                    const resp = await fetch("/api/dashboard/github", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "pr_inline_comment", payload: { owner, repo, pullNumber: prNum, path, startLine: sel.startLineNumber, endLine: sel.endLineNumber, body } }),
                    })
                    const data = await resp.json()
                    if (!resp.ok) throw new Error(data?.error || 'Failed to post comment')
                    alert('Comment posted to PR #' + prNum)
                  } catch (err: any) {
                    console.error(err)
                    alert('Failed to post comment: ' + (err?.message || err))
                  }
                }}
              >
                Add inline comment to PR
              </button>
            </div>
          </div>
        </details>

        {conflict ? (
          <div style={{ marginTop: 8, border: "1px solid #f59e0b", padding: 12, background: "#fffbeb" }}>
            <strong>Merge conflict detected</strong>
            <p style={{ marginTop: 8 }}>Latest file content on branch:</p>
            <pre style={{ whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto", background: "#fff", padding: 8 }}>{conflict?.latest?.content ?? ""}</pre>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input placeholder="new-branch-name (optional)" id="conflict-branch-name" />
              <button
                onClick={async () => {
                  const el: any = document.getElementById("conflict-branch-name") as HTMLInputElement
                  const name = el?.value?.trim()
                  try {
                    await forceCommitFile(name)
                  } catch (e) {
                    console.error(e)
                  }
                }}
              >
                Create branch &amp; commit
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
