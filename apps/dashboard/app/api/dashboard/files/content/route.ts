import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { fetchFileContent, resolveGithubTokenForUser } from "@/lib/github-client"

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const repo = searchParams.get("repo")
  const path = searchParams.get("path")
  const branch = searchParams.get("branch") || "main"

  if (!repo || !path) {
    return NextResponse.json(
      { error: "Missing required parameters: repo and path" },
      { status: 400 }
    )
  }

  // Parse repo (owner/repo format)
  const repoParts = repo.split("/")
  if (repoParts.length !== 2) {
    return NextResponse.json(
      { error: "Invalid repo format. Expected: owner/repo" },
      { status: 400 }
    )
  }
  const [owner, repoName] = repoParts

  try {
    // Get GitHub token for the user
    const githubToken = await resolveGithubTokenForUser(userId)
    if (!githubToken) {
      return NextResponse.json(
        { error: "GitHub token not found. Please connect your GitHub account." },
        { status: 400 }
      )
    }

    // Fetch file content from GitHub
    const fileData = await fetchFileContent(owner, repoName, path, branch, githubToken)

    return NextResponse.json({
      content: fileData.content,
      sha: fileData.sha,
      path: path,
      branch: branch,
    })
  } catch (error) {
    console.error("Error fetching file content:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch file content",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
