"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider"
import { isReviewer, isReviewerLead } from "@/lib/roles"
import { JuniorReviewInterface } from "./JuniorReviewInterface"
import { SeniorReviewInterface } from "./SeniorReviewInterface"
import { LeadReviewInterface } from "./LeadReviewInterface"
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle, Shield } from "lucide-react"

interface ReviewInterfaceProps {
  analysisId: string
  assignmentId?: string
}

export function ReviewInterface({ analysisId, assignmentId }: ReviewInterfaceProps) {
  const currentUser = useDashboardUser()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate initial data loading
    setTimeout(() => setLoading(false), 500)
  }, [])

  // Check if user has reviewer role
  if (!isReviewer(currentUser.role)) {
    return (
      <div className="container mx-auto py-12">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-8 text-center">
            <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              You need reviewer permissions to access this page.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-96 bg-gray-200 rounded-lg"></div>
            <div className="h-64 bg-gray-200 rounded-lg"></div>
          </div>
          <div className="space-y-4">
            <div className="h-48 bg-gray-200 rounded-lg"></div>
            <div className="h-64 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    )
  }

  if (isReviewerLead(currentUser.role)) {
    return (
      <LeadReviewInterface
        analysisId={analysisId} 
        assignmentId={assignmentId}
      />
    )
  }

  if (currentUser.role === "developer") {
    return (
      <JuniorReviewInterface 
        analysisId={analysisId} 
        assignmentId={assignmentId}
      />
    )
  }

  if (isReviewer(currentUser.role)) {
    return (
      <SeniorReviewInterface
        analysisId={analysisId}
        assignmentId={assignmentId}
      />
    )
  }

  // Fallback
  return (
    <div className="container mx-auto py-12">
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Unknown Role</h2>
          <p className="text-muted-foreground">
            Your role is not recognized. Please contact an administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
