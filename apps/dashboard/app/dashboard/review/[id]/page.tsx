import { Metadata } from "next"
import { redirect } from "next/navigation"

import { AnnotatedDiff } from "@/components/dashboard/AnnotatedDiff"
import { getAuthenticatedDashboardUser } from "@/lib/auth"

export const metadata: Metadata = {
  title: "Code Review",
  description: "Review analysis findings, diff changes, and submit feedback",
}

export default async function ReviewPage() {
  const user = await getAuthenticatedDashboardUser()
  if (!user) {
    redirect("/sign-in")
  }

  return (
    <div className="h-full min-h-0">
      <AnnotatedDiff />
    </div>
  )
}
