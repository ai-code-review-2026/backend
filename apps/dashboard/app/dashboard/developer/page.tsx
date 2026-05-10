import { DeveloperDashboard } from "@/components/dashboard/DeveloperDashboard"
import { requireDashboardRole } from "@/lib/route-guards"

export default async function DeveloperDashboardPage() {
  await requireDashboardRole("developer")
  return <DeveloperDashboard />
}
