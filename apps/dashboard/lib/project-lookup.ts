type DashboardProjectLookupItem = {
  id?: string
  repo?: string
  full_name?: string
  name?: string
}

type DashboardProjectLookupResponse = {
  items?: DashboardProjectLookupItem[]
}

function normalizeRepoKey(repo: string): string {
  return repo.trim().toLowerCase()
}

function matchesRepo(candidate: unknown, normalizedRepo: string): boolean {
  return typeof candidate === "string" && candidate.trim().toLowerCase() === normalizedRepo
}

async function fetchProjectMatches(repo: string): Promise<DashboardProjectLookupItem[]> {
  const searchParams = new URLSearchParams({
    page: "1",
    limit: "100",
    search: repo,
  })

  const response = await fetch(`/api/dashboard/projects?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  if (!response.ok) {
    return []
  }

  const payload = (await response.json().catch(() => ({}))) as DashboardProjectLookupResponse
  return Array.isArray(payload.items) ? payload.items : []
}

export async function resolveProjectIdForRepo(repo: string): Promise<string | null> {
  const normalizedRepo = normalizeRepoKey(repo)
  if (!normalizedRepo) {
    return null
  }

  try {
    const items = await fetchProjectMatches(normalizedRepo)
    const match = items.find((item) =>
      [item.id, item.repo, item.full_name, item.name].some((candidate) =>
        matchesRepo(candidate, normalizedRepo),
      ),
    )

    const projectId = typeof match?.id === "string" ? match.id.trim() : ""
    return projectId.length > 0 ? projectId : null
  } catch {
    return null
  }
}
