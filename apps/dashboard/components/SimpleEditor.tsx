"use client"

import React, { useState } from "react"

export default function SimpleEditor() {
  const [owner, setOwner] = useState("")
  const [repo, setRepo] = useState("")
  const [branch, setBranch] = useState("main")
  const [path, setPath] = useState("")
  const [content, setContent] = useState("")
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<string | null>(null)

  async function callAction(action: string, payload: Record<string, unknown>) {
    setStatus("working")
    try {
      const res = await fetch(`/api/dashboard/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      })
      const json = await res.json()
      if (!res.ok) {
        setStatus(`error: ${json?.error ?? res.statusText}`)
        return json
      }
      setStatus("ok")
      return json
    } catch (err: any) {
      setStatus(`error: ${err?.message ?? String(err)}`)
      return { error: err?.message }
    }
  }

  async function handleCreateBranch() {
    await callAction("create_branch", { owner, repo, newBranch: branch })
  }

  async function handleCommit() {
    await callAction("commit_file", { owner, repo, path, content, branch, message })
  }

  async function handleCreatePR() {
    const title = message || `Update ${path}`
    await callAction("create_pr", { owner, repo, title, head: branch, base: "main", body: message })
  }

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-white shadow-sm">
      <h3 className="text-lg font-semibold">Editor (experimental)</h3>
      <div className="flex gap-2">
        <input className="input" placeholder="owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <input className="input" placeholder="repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
        <input className="input" placeholder="branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
      </div>
      <input className="input" placeholder="path (e.g. src/index.ts)" value={path} onChange={(e) => setPath(e.target.value)} />
      <textarea className="w-full font-mono" style={{ minHeight: 200 }} value={content} onChange={(e) => setContent(e.target.value)} />
      <input className="input" placeholder="commit / PR message" value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn" onClick={handleCreateBranch}>Create branch</button>
        <button className="btn" onClick={handleCommit}>Commit file</button>
        <button className="btn" onClick={handleCreatePR}>Create PR</button>
      </div>
      <div>
        <strong>Status:</strong> {status}
      </div>
    </div>
  )
}
