import { redirect } from "next/navigation"

import { EnhancedReportDetail } from "@/components/dashboard/EnhancedReportDetail"
import { getAuthenticatedDashboardUser } from "@/lib/auth"

interface AnalysisDetailPageProps {
  params: {
    id: string
  }
}

export default async function AnalysisDetailPage({ params }: AnalysisDetailPageProps) {
  const user = await getAuthenticatedDashboardUser()
  if (!user) {
    redirect("/sign-in")
  }

  return <EnhancedReportDetail analysisId={params.id} />
}