import { requireDashboardRole } from "@/lib/route-guards"

export default async function OrganizationRoutesLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardRole("tech_lead", "admin")
  return <>{children}</>
}
