"use client"

import { Building2, Info, MailPlus, UserCog } from "lucide-react"
import { CreateOrganization, OrganizationProfile, OrganizationSwitcher, useAuth } from "@clerk/nextjs"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function normalizeOrgRole(role: string | null | undefined): string {
  if (!role) {
    return "member"
  }
  const normalized = role.trim().toLowerCase()
  return normalized.startsWith("org:") ? normalized.slice(4) : normalized
}

export function OrganizationWorkspace({
  profilePath,
  showOrganizationProfile,
}: {
  profilePath: string
  showOrganizationProfile: boolean
}) {
  const { orgId, orgRole } = useAuth()
  const normalizedRole = normalizeOrgRole(orgRole)
  const isOrgAdmin = normalizedRole === "owner" || normalizedRole === "admin"

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="border-gray-200/60 bg-card/80 backdrop-blur-xl dark:border-gray-800/60 dark:bg-card/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Building2 className="h-6 w-6 text-indigo-500" />
            Workspace Organization
          </CardTitle>
          <CardDescription>
            Tu peux rester en mode personnel, ou basculer vers une organization pour collaborer et inviter des membres.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={orgId ? "default" : "secondary"}>{orgId ? "Organization active" : "Personal mode"}</Badge>
            {orgId && <Badge variant="outline">Role: {normalizedRole}</Badge>}
          </div>

          <div className="rounded-xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800/70 dark:bg-gray-950/60">
            <div className="mb-2 text-sm font-medium text-foreground dark:text-gray-100">Switch organization</div>
            <OrganizationSwitcher hidePersonal={false} />
          </div>

          {!orgId && (
            <div className="rounded-xl border border-dashed border-indigo-300/70 bg-indigo-50/50 p-4 dark:border-indigo-800/70 dark:bg-indigo-950/20">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
                <Info className="h-4 w-4" />
                Aucun org selectionne. Tu restes en mode individuel.
              </div>
              <CreateOrganization />
            </div>
          )}
        </CardContent>
      </Card>

      {showOrganizationProfile && (
        <Card className="border-gray-200/60 bg-card/80 backdrop-blur-xl dark:border-gray-800/60 dark:bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <MailPlus className="h-5 w-5 text-blue-500" />
              Members & Invitations
            </CardTitle>
            <CardDescription>
              Gestion des membres, roles et invitations via Clerk Organizations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {orgId ? (
              isOrgAdmin ? (
                <OrganizationProfile path={profilePath} routing="path" />
              ) : (
                <div className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/20 dark:text-amber-300">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <UserCog className="h-4 w-4" />
                    Permissions insuffisantes
                  </div>
                  Il faut un role organization `admin` ou `owner` pour inviter des utilisateurs.
                </div>
              )
            ) : (
              <div className="rounded-xl border border-gray-200/70 bg-gray-50/70 p-4 text-sm text-muted-foreground dark:border-gray-800/70 dark:bg-gray-950/60 dark:text-gray-300">
                Selectionne une organization pour gerer les invitations.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
