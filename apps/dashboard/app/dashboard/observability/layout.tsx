import { requireDashboardRole } from "@/lib/route-guards"

export default async function ObservabilityRoutesLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardRole("admin")
  return <>{children}</>
}
