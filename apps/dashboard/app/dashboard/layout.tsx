import { redirect } from "next/navigation"

import { DashboardLayout } from "@/components/dashboard/DashboardLayout"
import { DashboardUserProvider } from "@/components/dashboard/dashboard-user-provider"
import { getAuthenticatedDashboardUser } from "@/lib/auth"

export default async function DashboardRoutesLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
    redirect("/")
  }

  const user = await getAuthenticatedDashboardUser()
  if (!user) {
    redirect("/")
  }

  return (
    <DashboardUserProvider user={user}>
      <DashboardLayout>{children}</DashboardLayout>
    </DashboardUserProvider>
  )
}
