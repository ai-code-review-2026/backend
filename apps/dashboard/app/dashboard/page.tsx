import { redirect } from "next/navigation"

import { getRoleHomePath } from "@/lib/roles"
import { requireDashboardUser } from "@/lib/route-guards"

export default async function DashboardPage() {
  const user = await requireDashboardUser()
  redirect(getRoleHomePath(user.canonicalRole))
}
