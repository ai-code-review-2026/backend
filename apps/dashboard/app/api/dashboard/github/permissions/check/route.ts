import { NextResponse } from "next/server"

import { readRepositoryFromRequest, resolvePermissionValidation } from "../_shared"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const repositoryOrResponse = await readRepositoryFromRequest(request)
  if (repositoryOrResponse instanceof NextResponse) {
    return repositoryOrResponse
  }

  const result = await resolvePermissionValidation(repositoryOrResponse)
  if (result instanceof NextResponse) {
    return result
  }

  return NextResponse.json(result.permissions, { status: 200 })
}
