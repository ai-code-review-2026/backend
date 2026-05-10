import { redirect } from "next/navigation"

import { getAuthenticatedDashboardUser } from "@/lib/auth"

export default async function AuthRedirectPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
    redirect("/")
  }

  const user = await getAuthenticatedDashboardUser()
  if (user) {
    redirect("/auth/role-redirect")
  }

  redirect("/sign-in")
}
