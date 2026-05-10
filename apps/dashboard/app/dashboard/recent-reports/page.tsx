"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { EnhancedRecentReports } from "@/components/dashboard/EnhancedRecentReports"

function RecentReportsContent() {
  const searchParams = useSearchParams()
  const period = searchParams.get("period") ?? "all"

  return (
    <div className="mx-auto w-full max-w-[1260px] px-4 py-6 md:px-6 md:py-8">
      <EnhancedRecentReports limit={50} showHeader={true} defaultPeriod={period} />
    </div>
  )
}

export default function RecentReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      }
    >
      <RecentReportsContent />
    </Suspense>
  )
}
