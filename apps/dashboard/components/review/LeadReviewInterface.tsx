"use client"

import { useState, useEffect } from "react"
import { SeniorReviewInterface } from "./SeniorReviewInterface"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Crown, Users, UserPlus, ArrowRight, Loader2, RefreshCw } from "lucide-react"
import { motion } from "motion/react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Types for team members
interface TeamMember {
  id: string
  name: string
  role: string
  availability: string
  current_reviews: number
}

interface LeadReviewInterfaceProps {
  analysisId: string
  assignmentId?: string
  teamMembers?: TeamMember[]
  loading?: boolean
  error?: string | null
  onRefresh?: () => void
}

export function LeadReviewInterface({ 
  analysisId, 
  assignmentId,
  teamMembers: propTeamMembers,
  loading: propLoading = false,
  error: propError = null,
  onRefresh
}: LeadReviewInterfaceProps) {
  const [showReassign, setShowReassign] = useState(false)
  const [selectedReviewer, setSelectedReviewer] = useState("")

  // Default team members if none provided
  const teamMembers = propTeamMembers || [
    { id: "rev_001", name: "Alice Chen", role: "Reviewer Senior", availability: "available", current_reviews: 2 },
    { id: "rev_002", name: "Bob Smith", role: "Reviewer Junior", availability: "available", current_reviews: 1 },
  ]

  const handleReassign = async () => {
    if (!selectedReviewer) return
    
    const reviewer = teamMembers.find(m => m.id === selectedReviewer)
    await new Promise(resolve => setTimeout(resolve, 500))
    alert(`Review reassignee a ${reviewer?.name} !\n\nIl/Elle sera notifie immediatement.`)
    setShowReassign(false)
  }

  // Loading state
  if (propLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-3 text-muted-foreground">Chargement de l'equipe...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (propError) {
    return (
      <div className="space-y-6">
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="h-12 w-12 text-destructive mb-4">⚠️</div>
              <h3 className="text-lg font-semibold text-red-700 dark:text-destructive mb-2">
                Erreur de chargement
              </h3>
              <p className="text-destructive mb-4">{propError}</p>
              {onRefresh && (
                <Button onClick={onRefresh} variant="outline" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Reessayer
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Lead Reviewer Enhanced Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Crown className="h-6 w-6 text-[color:var(--orange)]" />
                <div>
                  <div className="flex items-center gap-2">
                    <span>Outils Reviewer Lead</span>
                    <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-none">
                      Acces Complet
                    </Badge>
                  </div>
                  <p className="text-sm font-normal text-muted-foreground mt-1">
                    Gestion d'equipe, reassignment, et capacites de override
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReassign(!showReassign)}
                className="ml-4"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                {showReassign ? "Masquer" : "Reassigner"}
              </Button>
            </CardTitle>
          </CardHeader>
          
          {showReassign && (
            <CardContent className="border-t border-amber-200 dark:border-amber-800 pt-4">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Reassigner cette Review
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Transferer cette review a un autre membre de l'equipe
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      onClick={() => setSelectedReviewer(member.id)}
                      className={`
                        p-3 rounded-lg border-2 cursor-pointer transition-all
                        ${selectedReviewer === member.id 
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" 
                          : "border-gray-200 dark:border-gray-700 hover:border-amber-300"
                        }
                        ${member.availability === "busy" ? "opacity-60" : ""}
                      `}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{member.name}</span>
                        <Badge 
                          variant="outline" 
                          className={member.availability === "available" ? "text-[color:var(--green-status)]" : "text-[color:var(--orange)]"}
                        >
                          {member.availability === "available" ? "Disponible" : "Occupe"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {member.role} • {member.current_reviews} reviews actives
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={handleReassign}
                  disabled={!selectedReviewer}
                  className="w-full bg-amber-600 hover:bg-amber-700"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Reassigner la Review
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </motion.div>

      {/* Inherit all Senior Reviewer capabilities */}
      <SeniorReviewInterface 
        analysisId={analysisId} 
        assignmentId={assignmentId}
      />
    </div>
  )
}
