"use client"

import { Suspense } from "react"
import dynamic from "next/dynamic"
import { OrganizationWorkspace } from "@/components/dashboard/OrganizationWorkspace"

const GitHubOrganizationData = dynamic(() => import("@/components/dashboard/GitHubOrganizationData").then(mod => ({ default: mod.GitHubOrganizationData })), {
  ssr: false,
  loading: () => <div className="p-6 text-muted-foreground">Loading GitHub organization data...</div>
})

export default function OrganizationPage() {
  return (
    <div className="space-y-6">
      <OrganizationWorkspace
        profilePath="/dashboard/organization"
        showOrganizationProfile={false}
      />
      
      <Suspense fallback={<div className="p-6 text-muted-foreground">Loading GitHub organization data...</div>}>
        <GitHubOrganizationData />
      </Suspense>
    </div>
  )
}
