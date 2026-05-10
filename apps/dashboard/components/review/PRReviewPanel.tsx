"use client"

import React, { useEffect, useState } from "react"

export default function PRReviewPanel() {
  const [owner, setOwner] = useState("")
  const [repo, setRepo] = useState("")
  const [prs, setPRs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any | null>(null)
  const [comment, setComment] = useState("")

  async function fetchPRs() {
    if (!owner || !repo) return
    setLoading(true)
    try {
      const resp = await fetch("/api/dashboard/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_prs", payload: { owner, repo, state: "open" } }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || "Failed to fetch PRs")
      setPRs(Array.isArray(data?.result) ? data.result : [])
    } catch (err: any) {
      console.error("fetchPRs", err)
      alert("Failed to fetch PRs: " + (err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  async function addCommentToPR(prNumber: number) {
    if (!owner || !repo || !prNumber || !comment) return
    try {
      const resp = await fetch("/api/dashboard/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_comment", payload: { owner, repo, issueNumber: prNumber, body: comment } }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || "Failed to add comment")
      alert("Comment added")
      setComment("")
    } catch (err: any) {
      console.error("addCommentToPR", err)
      alert("Failed to add comment: " + (err?.message || err))
    }
  }

  async function submitReview(prNumber: number, event: string) {
    if (!owner || !repo || !prNumber) return
    try {
      const resp = await fetch("/api/dashboard/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit_pr_review", payload: { owner, repo, pullNumber: prNumber, event, body: comment } }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || "Failed to submit review")
      alert("Review submitted")
      setComment("")
    } catch (err: any) {
      console.error("submitReview", err)
      alert("Failed to submit review: " + (err?.message || err))
    }
  }

  return (
    <div className="space-y-4 border p-4 rounded">
      <div className="flex gap-2">
        <input placeholder="owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <input placeholder="repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
        <button onClick={fetchPRs} disabled={loading}>
          {loading ? "Loading..." : "Fetch PRs"}
        </button>
      </div>

      <div>
        <strong>Open PRs</strong>
        <ul>
          {prs.map((p: any) => (
            <li key={p.number} style={{ marginTop: 6 }}>
              <button onClick={() => setSelected(p)} style={{ fontWeight: selected?.number === p.number ? "bold" : "normal" }}>
                #{p.number} {p.title} — {p.user?.login}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <div className="mt-2">
          <h4>Selected PR #{selected.number}: {selected.title}</h4>
          <textarea placeholder="Add a comment or review message" value={comment} onChange={(e) => setComment(e.target.value)} style={{ width: "100%", height: 80 }} />
          <div className="flex gap-2 mt-2">
            <button onClick={() => addCommentToPR(selected.number)}>Add comment</button>
            <button onClick={() => submitReview(selected.number, "APPROVE")}>Approve</button>
            <button onClick={() => submitReview(selected.number, "REQUEST_CHANGES")}>Request changes</button>
          </div>
        </div>
      )}
    </div>
  )
}
