import { redirect } from "next/navigation"

import { getAuthenticatedDashboardUser } from "@/lib/auth"
import { getRoleHomePath } from "@/lib/roles"

export default async function RoleRedirectPage() {
  const user = await getAuthenticatedDashboardUser()

  if (!user) {
    redirect("/sign-in")
  }

  redirect(getRoleHomePath(user.role))
}
