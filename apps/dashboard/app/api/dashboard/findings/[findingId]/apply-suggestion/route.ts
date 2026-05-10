import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import {
  commitTreeChanges,
  createBranch,
  createPullRequest,
  fetchFileContent,
  resolveGithubTokenForUser,
} from "@/lib/github-client"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

const TIMEOUT_MS = parseInt(process.env.DASHBOARD_BACKEND_WRITE_TIMEOUT_MS || "30000", 10)

type ApplySuggestionBody = {
  branchName?: string
  createPr?: boolean
  prTitle?: string
  prBody?: string
}

type FindingDetails = {
  finding_id: string
  file_path: string
  suggestion: string
  repo: string
  base_branch: string
  pr_number: number | null
  line_start: number | null
  line_end: number | null
}

async function refreshDashboardAuth(request: Request): Promise<void> {
  const syncUrl = new URL("/api/auth/sync", request.url)

  try {
    await fetch(syncUrl, {
      method: "POST",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    })
  } catch {
    // Best-effort refresh only
  }
}

export async function POST(request: Request, context: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await context.params
  if (!findingId || findingId.trim().length === 0) {
    return NextResponse.json({ error: "Invalid finding id" }, { status: 400 })
  }

  const { userId, getToken } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getToken()
  if (!token) {
    return NextResponse.json({ error: "Missing Clerk token" }, { status: 401 })
  }

  let body: ApplySuggestionBody
  try {
    body = (await request.json()) as ApplySuggestionBody
  } catch {
    body = {}
  }

  const branchName = body.branchName || `fix/auto-suggestion-${findingId.substring(0, 8)}`
  const createPr = body.createPr ?? false
  const prTitle = body.prTitle || `Fix: Apply suggestion for finding ${findingId.substring(0, 8)}`
  const prBody = body.prBody || "This PR automatically applies a code review suggestion."

  // Step 1: Get finding details from backend
  const getFindingDetails = async (): Promise<Response> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(
        `${BACKEND_API_BASE_URL}/v1/findings/${findingId}/apply-suggestion`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-User-Id": userId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ branch_name: branchName, create_pr: createPr, pr_title: prTitle, pr_body: prBody }),
          cache: "no-store",
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  let backendResponse: Response
  try {
    backendResponse = await getFindingDetails()
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Request timeout", timeout_ms: TIMEOUT_MS }, { status: 504 })
    }
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 })
  }

  if (backendResponse.status === 403) {
    await refreshDashboardAuth(request)
    try {
      backendResponse = await getFindingDetails()
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return NextResponse.json({ error: "Request timeout", timeout_ms: TIMEOUT_MS }, { status: 504 })
      }
      return NextResponse.json({ error: "Backend unavailable" }, { status: 502 })
    }
  }

  if (!backendResponse.ok) {
    const rawBackendBody = await backendResponse.text()
    let parsedBackendBody: unknown = {}
    if (rawBackendBody) {
      try {
        parsedBackendBody = JSON.parse(rawBackendBody)
      } catch {
        parsedBackendBody = { detail: rawBackendBody }
      }
    }
    return NextResponse.json(parsedBackendBody, { status: backendResponse.status })
  }

  const findingDetails = (await backendResponse.json()) as FindingDetails

  // Step 2: Get GitHub token for the user
  let githubToken: string | null = null
  try {
    githubToken = await resolveGithubTokenForUser(userId)
  } catch (error) {
    return NextResponse.json(
      {
        error: "GitHub token not configured",
        message: "Please connect your GitHub account in settings",
      },
      { status: 400 }
    )
  }

  if (!githubToken) {
    return NextResponse.json(
      {
        error: "GitHub token not found",
        message: "Please connect your GitHub account in settings",
      },
      { status: 400 }
    )
  }

  // Parse repo (owner/repo format)
  const repoParts = findingDetails.repo.split("/")
  if (repoParts.length !== 2) {
    return NextResponse.json(
      { error: "Invalid repo format", message: "Repo must be in owner/repo format" },
      { status: 400 }
    )
  }
  const [owner, repo] = repoParts

  try {
    // Step 3: Fetch current file content
    const baseBranch = findingDetails.base_branch || "main"
    const currentFile = await fetchFileContent(owner, repo, findingDetails.file_path, baseBranch, githubToken)

    // Step 4: Apply the suggestion to the file content
    let updatedContent: string
    
    if (findingDetails.line_start !== null && findingDetails.line_start !== undefined) {
      // Precise application: insert/replace at specific line(s)
      const lines = currentFile.content.split('\n')
      const lineStart = Math.max(0, findingDetails.line_start - 1) // Convert to 0-indexed
      const lineEnd = findingDetails.line_end ? Math.max(0, findingDetails.line_end - 1) : lineStart
      
      // Build the new content with the suggestion applied
      const beforeLines = lines.slice(0, lineStart)
      const afterLines = lines.slice(lineEnd + 1)
      
      // Insert the suggestion as a comment + the original lines (commented out)
      const affectedLines = lines.slice(lineStart, lineEnd + 1)
      const commentedOriginal = affectedLines.map(line => `// ${line}`).join('\n')
      const suggestionComment = `// Applied suggestion: ${findingDetails.suggestion}`
      
      updatedContent = [
        ...beforeLines,
        suggestionComment,
        commentedOriginal,
        '',
        ...afterLines
      ].join('\n')
    } else {
      // Fallback: append at the end if no line information
      updatedContent = `${currentFile.content}\n\n// Applied suggestion:\n// ${findingDetails.suggestion}\n`
    }

    // Step 5: Create a new branch
    await createBranch({
      owner,
      repo,
      newBranch: branchName,
      baseBranch,
      token: githubToken,
    })

    // Step 6: Commit the changes to the new branch
    const commitResult = await commitTreeChanges({
      owner,
      repo,
      branch: branchName,
      message: `Apply suggestion: ${findingDetails.suggestion.substring(0, 50)}...`,
      changes: [
        {
          path: findingDetails.file_path,
          content: updatedContent,
        },
      ],
      token: githubToken,
    })

    // Step 7: Optionally create a PR
    let prNumber: number | undefined
    let prUrl: string | undefined
    if (createPr) {
      const prResult = (await createPullRequest({
        owner,
        repo,
        title: prTitle,
        body: `${prBody}\n\n---\n**Finding ID:** ${findingId}\n**File:** \`${findingDetails.file_path}\`\n**Suggestion:** ${findingDetails.suggestion}`,
        head: branchName,
        base: baseBranch,
        token: githubToken,
      })) as { number?: number; html_url?: string }

      prNumber = prResult.number
      prUrl = prResult.html_url
    }

    return NextResponse.json({
      success: true,
      branch: branchName,
      commit_sha: commitResult.commitSha,
      pr_number: prNumber,
      pr_url: prUrl,
      file_path: findingDetails.file_path,
      message: createPr
        ? `Successfully applied suggestion and created PR #${prNumber}`
        : `Successfully applied suggestion to branch ${branchName}`,
    })
  } catch (error) {
    console.error("Error applying suggestion:", error)
    return NextResponse.json(
      {
        error: "Failed to apply suggestion",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    )
  }
}
