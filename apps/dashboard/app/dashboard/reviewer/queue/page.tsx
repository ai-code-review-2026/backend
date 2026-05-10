import { redirect } from "next/navigation"

export default function LegacyReviewerQueuePage() {
  redirect("/dashboard/lead/queue")
}
