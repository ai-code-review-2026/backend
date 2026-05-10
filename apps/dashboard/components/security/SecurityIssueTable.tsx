"use client"

import { motion } from "framer-motion"
import { AlertTriangle, Shield, Clock, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

export interface SecurityIssue {
  id: string
  title: string
  severity: "critical" | "high" | "medium" | "low"
  category: string
  repository: string
  status: "active" | "resolved"
  updatedAt: string
}

interface SecurityIssueTableProps {
  issues: SecurityIssue[]
  loading?: boolean
}

const severityColors = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-amber-100 text-amber-800 border-amber-200",
  medium: "bg-blue-100 text-blue-800 border-blue-200",
  low: "bg-gray-100 text-gray-800 border-gray-200",
}

const severityIcons = {
  critical: "🔴",
  high: "🟠",
  medium: "🔵",
  low: "⚪",
}

export function SecurityIssueTable({ issues, loading }: SecurityIssueTableProps) {
  if (loading) {
    return (
      <Card className="overflow-hidden">
        <div className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Chargement des problemes de securite...</p>
        </div>
      </Card>
    )
  }

  if (!issues || issues.length === 0) {
    return (
      <Card className="overflow-hidden">
        <div className="p-8 text-center">
          <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Aucun probleme de securite detecte</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Nom
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Severite
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Repository
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Statut
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {issues.map((issue, index) => (
              <motion.tr
                key={issue.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center">
                    {issue.severity === "critical" ? (
                      <Shield className="h-5 w-5 text-red-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900">{issue.title}</span>
                    <span className="mt-1 text-xs text-gray-500">dans {issue.repository}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <Badge
                    variant="outline"
                    className={`border ${severityColors[issue.severity]}`}
                  >
                    {severityIcons[issue.severity]} {issue.severity}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <Badge variant="outline" className="font-mono text-xs">
                    {issue.category}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={issue.status === "active" ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {issue.status === "active" ? "Actif" : "Resolu"}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {issue.updatedAt}
                    </div>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
