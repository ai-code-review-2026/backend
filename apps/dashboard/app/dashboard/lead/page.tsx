import { Metadata } from "next"
import { ReviewerDashboard } from "@/components/reviewer/ReviewerDashboard"

export const metadata: Metadata = {
  title: "Tech Lead Dashboard",
  description: "Operational dashboard for tech leads",
}

export default function LeadDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="card-heading text-foreground">Tech Lead Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Manage team reviews, assignments, and delivery metrics.
        </p>
      </div>
      <ReviewerDashboard />
    </div>
  )
}
