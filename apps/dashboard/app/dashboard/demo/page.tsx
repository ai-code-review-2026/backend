import { Metadata } from "next"
import { InlineCodeReview } from "@/components/review/InlineCodeReview"
import SimpleEditor from "@/components/SimpleEditor"
import MonacoEditor from "@/components/MonacoEditor"

export const metadata: Metadata = {
  title: "Code Review Demo - Devora",
  description: "Experience AI-powered code review in action",
}

export default function CodeReviewDemoPage() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="card-heading text-foreground">Live Code Review Demo</h1>
        <p className="mt-2 text-muted-foreground">
          See how our AI detects issues and provides actionable suggestions in real-time
        </p>
      </div>

      <InlineCodeReview />

      <SimpleEditor />

      <MonacoEditor />
    </div>
  )
}
