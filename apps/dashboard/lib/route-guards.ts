import "server-only"

import { redirect } from "next/navigation"

import { getAuthenticatedDashboardUser } from "@/lib/auth"
import { getRoleHomePath, type AppRole } from "@/lib/roles"

export async function requireDashboardUser() {
  const user = await getAuthenticatedDashboardUser()
  if (!user) {
    redirect("/sign-in")
  }
  return user
}

export async function requireDashboardRole(...allowedRoles: AppRole[]) {
  const user = await requireDashboardUser()
  if (!allowedRoles.includes(user.canonicalRole)) {
    redirect(getRoleHomePath(user.canonicalRole))
  }
  return user
}
