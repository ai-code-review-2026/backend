export function normalizeRepositoryId(repoId: string): string {
  const trimmed = repoId.trim()
  if (!trimmed) return ""

  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

export function getRepositoryPath(repoId: string): string {
  return `/dashboard/projects/${encodeURIComponent(normalizeRepositoryId(repoId))}`
}

export function getRepositorySettingsPath(repoId: string): string {
  return `${getRepositoryPath(repoId)}/settings`
}

function normalizeGitHubFullName(fullName: string): string {
  const normalized = normalizeRepositoryId(fullName)
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/g, "")

  return normalized
}

export function getGitHubRepositoryUrl(fullName: string): string {
  return `https://github.com/${normalizeGitHubFullName(fullName)}`
}

export function getGitHubCloneUrl(fullName: string): string {
  return `${getGitHubRepositoryUrl(fullName)}.git`
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard API unavailable")
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  const copied = document.execCommand("copy")
  document.body.removeChild(textarea)

  if (!copied) {
    throw new Error("Copy command failed")
  }
}
