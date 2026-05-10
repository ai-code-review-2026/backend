import { requireDashboardRole } from "@/lib/route-guards"

export default async function AdminRoutesLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardRole("admin")

  return <>{children}</>
}
