"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { format, formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Activity,
  User,
  Users,
  GitBranch,
  Building2,
  Clock,
  Filter,
  ChevronDown,
  ExternalLink,
  Loader2
} from "lucide-react"
import { AuditAction, AuditActionType } from "@/types/audit"
import { auditService } from "@/lib/audit-service"

interface AuditTrailProps {
  resourceType: AuditAction["resource_type"]
  resourceId: string
  title?: string
  className?: string
}

const ACTION_ICONS = {
  "project.created": GitBranch,
  "project.imported": GitBranch,
  "project.updated": GitBranch,
  "project.deleted": GitBranch,
  "repository.imported": GitBranch,
  "repository.synchronized": GitBranch,
  "repository.webhook.created": Activity,
  "repository.webhook.updated": Activity,
  "repository.webhook.deleted": Activity,
  "github.permissions_validated": Activity,
  "member.invited": User,
  "member.added": Users,
  "member.removed": Users,
  "member.role.updated": User,
  "member.permissions.updated": User,
  "organization.imported": Building2,
  "organization.synchronized": Building2,
} as const

const ACTION_COLORS = {
  "project.created": "green",
  "project.imported": "blue",
  "project.updated": "orange",
  "project.deleted": "red",
  "repository.imported": "blue",
  "repository.synchronized": "blue",
  "repository.webhook.created": "green",
  "repository.webhook.updated": "orange",
  "repository.webhook.deleted": "red",
  "github.permissions_validated": "green",
  "member.invited": "blue",
  "member.added": "green",
  "member.removed": "red",
  "member.role.updated": "orange",
  "member.permissions.updated": "orange",
  "organization.imported": "blue",
  "organization.synchronized": "blue",
} as const

const ACTION_LABELS = {
  "project.created": "Projet cree",
  "project.imported": "Projet importe depuis GitHub",
  "project.updated": "Projet mis a jour",
  "project.deleted": "Projet supprime",
  "repository.imported": "Repository importe",
  "repository.synchronized": "Repository synchronise",
  "repository.webhook.created": "Webhook cree",
  "repository.webhook.updated": "Webhook mis a jour",
  "repository.webhook.deleted": "Webhook supprime",
  "github.permissions_validated": "Permissions GitHub validees",
  "member.invited": "Membre invite",
  "member.added": "Membre ajoute",
  "member.removed": "Membre retire",
  "member.role.updated": "Role de membre mis a jour",
  "member.permissions.updated": "Permissions de membre mises a jour",
  "organization.imported": "Organisation importee",
  "organization.synchronized": "Organisation synchronisee",
} as const

export function AuditTrail({ resourceType, resourceId, title, className }: AuditTrailProps) {
  const [actions, setActions] = useState<AuditAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<AuditActionType | "all">("all")
  const [limit] = useState(50)

  const loadAuditTrail = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await auditService.getAuditTrail(
        resourceType,
        resourceId,
        {
          limit,
          actionTypes: filter === "all" ? undefined : [filter]
        }
      )

      setActions(response.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAuditTrail()
  }, [resourceType, resourceId, filter])

  const filteredActions = actions.filter(action =>
    filter === "all" || action.action_type === filter
  )

  const renderActionIcon = (actionType: AuditActionType) => {
    const Icon = ACTION_ICONS[actionType] || Activity
    return <Icon className="h-4 w-4" />
  }

  const renderActionDetails = (action: AuditAction) => {
    const { details } = action

    if (details.import_stats) {
      return (
        <div className="mt-2 text-xs text-muted-foreground">
          <div className="flex gap-4">
            <span>{details.import_stats.total_members} membres detectes</span>
            <span>{details.import_stats.invited_members} invites</span>
            <span>{details.import_stats.branches_imported} branches</span>
            <span>{details.import_stats.commits_imported} commits</span>
          </div>
        </div>
      )
    }

    if (details.before && details.after) {
      return (
        <div className="mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {JSON.stringify(details.before)}
            </Badge>
            <span>-&gt;</span>
            <Badge variant="outline" className="text-xs">
              {JSON.stringify(details.after)}
            </Badge>
          </div>
        </div>
      )
    }

    return null
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Chargement du journal d&apos;audit...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center text-destructive">
            <p>Erreur: {error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadAuditTrail}
              className="mt-2"
            >
              Reessayer
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {title || "Journal d&apos;Audit"}
            </CardTitle>
            <CardDescription>
              Historique des actions sur cette ressource
            </CardDescription>
          </div>

          <Select value={filter} onValueChange={(value) => setFilter(value as any)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrer les actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les actions</SelectItem>
              <Separator className="my-1" />
              <SelectItem value="project.imported">Imports de projet</SelectItem>
              <SelectItem value="member.invited">Invitations de membres</SelectItem>
              <SelectItem value="member.role.updated">Changements de role</SelectItem>
              <SelectItem value="repository.synchronized">Synchronisations</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea className="h-[500px] p-6">
          {filteredActions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Aucune action trouvee</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredActions.map((action, index) => (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-start gap-3 p-3 rounded-lg border"
                >
                  <div className="mt-0.5">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      {renderActionIcon(action.action_type)}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm">
                          {ACTION_LABELS[action.action_type]}
                        </h4>
                        <Badge
                          variant="secondary"
                          className="text-xs"
                        >
                          {action.details.source || "manuel"}
                        </Badge>
                      </div>

                      <time
                        className="text-xs text-muted-foreground"
                        title={format(new Date(action.timestamp), "PPpp", { locale: fr })}
                      >
                        {formatDistanceToNow(new Date(action.timestamp), {
                          addSuffix: true,
                          locale: fr
                        })}
                      </time>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-muted-foreground">
                        par {action.actor_email}
                      </span>
                      {action.metadata.github_repository && (
                        <Badge variant="outline" className="text-xs">
                          {action.metadata.github_repository}
                        </Badge>
                      )}
                    </div>

                    {renderActionDetails(action)}
                  </div>

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent>
                      <SheetHeader>
                        <SheetTitle>Details de l&apos;Action</SheetTitle>
                        <SheetDescription>
                          Informations completes sur cette action d&apos;audit
                        </SheetDescription>
                      </SheetHeader>

                      <div className="mt-6 space-y-4">
                        <div>
                          <h4 className="font-medium mb-2">Action</h4>
                          <p className="text-sm text-muted-foreground">
                            {ACTION_LABELS[action.action_type]}
                          </p>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Acteur</h4>
                          <p className="text-sm text-muted-foreground">
                            {action.actor_email} ({action.actor_id})
                          </p>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Timestamp</h4>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(action.timestamp), "PPpp", { locale: fr })}
                          </p>
                        </div>

                        {Object.keys(action.metadata).length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2">Metadonnees</h4>
                            <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                              {JSON.stringify(action.metadata, null, 2)}
                            </pre>
                          </div>
                        )}

                        {Object.keys(action.details).length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2">Details</h4>
                            <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                              {JSON.stringify(action.details, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </SheetContent>
                  </Sheet>
                </motion.div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
