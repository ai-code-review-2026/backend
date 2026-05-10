"use client"

import type { ReactNode } from "react"
import { TwoLevelSidebar } from "@/components/ui/two-level-sidebar"

export function DashboardLayout({ children }: { children: ReactNode }) {
  return <TwoLevelSidebar>{children}</TwoLevelSidebar>
}
