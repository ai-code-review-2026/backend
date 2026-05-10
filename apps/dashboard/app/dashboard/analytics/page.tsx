"use client"

import { ReportsAnalytics } from "@/components/dashboard/ReportsAnalytics"

export default function AnalyticsPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your code review performance and trends
        </p>
      </div>
      
      <ReportsAnalytics />
    </div>
  )
}