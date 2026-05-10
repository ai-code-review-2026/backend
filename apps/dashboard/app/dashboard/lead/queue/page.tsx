import { Metadata } from "next"
import { ReviewQueue } from "@/components/reviewer/ReviewQueue"

export const metadata: Metadata = {
  title: "Review Queue",
  description: "Manage your review assignments and available reviews",
}

export default function ReviewQueuePage() {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="card-heading text-foreground">Review Queue</h1>
        <p className="text-muted-foreground mt-2">
          Manage your assigned reviews and claim new ones from the available pool.
        </p>
      </div>
      <ReviewQueue />
    </div>
  )
}