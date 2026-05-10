import { Metadata } from "next"
import { Shield } from "lucide-react"

import { SeverityIndicator } from "@/components/ui/severity-indicator"
import { SecurityIssueTable } from "@/components/security/SecurityIssueTable"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Security Dashboard - Devora",
  description: "Monitor and manage security issues across all repositories",
}

export default function SecurityDashboardPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="card-heading text-foreground">Security Dashboard</h1>
          <p className="mt-2 text-muted-foreground">
            Real-time security scanning and vulnerability management across all repositories
          </p>
        </div>
        <Shield className="h-12 w-12 text-teal-400" />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Issues Overview</CardTitle>
            <CardDescription>Current security findings</CardDescription>
          </CardHeader>
          <CardContent>
            <SeverityIndicator critical={1} high={30} medium={4} low={2} size="lg" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scan Status</CardTitle>
            <CardDescription>Latest security scans</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Completed Scans</span>
                <span className="text-2xl font-bold text-[color:var(--green-status)]">127</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">In Progress</span>
                <span className="text-2xl font-bold text-teal-400">3</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Failed</span>
                <span className="text-2xl font-bold text-destructive">2</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resolution Time</CardTitle>
            <CardDescription>Average time to fix</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Critical</span>
                <span className="text-xl font-bold text-destructive">2.3h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">High</span>
                <span className="text-xl font-bold text-[color:var(--orange)]">8.5h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Medium</span>
                <span className="text-xl font-bold text-teal-400">24h</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Issues Table */}
      <div>
        <h2 className="mb-4 text-2xl font-bold">Active Security Issues</h2>
        <SecurityIssueTable />
      </div>
    </div>
  )
}
