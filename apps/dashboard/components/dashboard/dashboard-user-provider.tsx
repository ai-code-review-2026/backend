"use client"

import { createContext, useContext } from "react"
import type { ReactNode } from "react"

import type { DashboardAuthUser } from "@/lib/dashboard-user"

const DashboardUserContext = createContext<DashboardAuthUser | null>(null)

export function DashboardUserProvider({
  children,
  user,
}: Readonly<{ children: ReactNode; user: DashboardAuthUser }>) {
  return <DashboardUserContext.Provider value={user}>{children}</DashboardUserContext.Provider>
}

export function useDashboardUser(): DashboardAuthUser {
  const context = useContext(DashboardUserContext)
  if (!context) {
    throw new Error("useDashboardUser must be used inside DashboardUserProvider")
  }
  return context
}
