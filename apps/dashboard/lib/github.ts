/**
 * Mobile-compatible GitHub utilities
 * 
 * This is a stub version for mobile builds.
 * Server-side GitHub token fetching is not available in static export.
 * GitHub operations should be done through the backend API.
 */

/**
 * This function is not available in mobile builds.
 * GitHub tokens should be handled by the backend API.
 */
export async function getGitHubToken(userId: string): Promise<string | null> {
  console.warn(
    "[Mobile Build] getGitHubToken() called - this is a mobile build stub. " +
    "GitHub operations should be done through the backend API."
  )
  return null
}

/**
 * Create GitHub API headers with authentication
 */
export function getGitHubHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "AI-Code-Review-Platform"
  }
}
