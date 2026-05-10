import { requireDashboardRole } from "@/lib/route-guards"

export default async function JiraRoutesLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardRole("admin")
  return <>{children}</>
}
