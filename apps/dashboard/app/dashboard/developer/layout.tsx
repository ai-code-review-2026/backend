import { requireDashboardRole } from "@/lib/route-guards"

export default async function DeveloperRoutesLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardRole("developer")
  return <>{children}</>
}
