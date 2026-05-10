"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Users, Building2, UserCheck, GitBranch, Lock, Unlock } from "lucide-react"
import { useGitHubMembersPreview, type RepoMembersPreview, type GitHubMember } from "@/hooks/use-github-members-preview"

interface MembersPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoFullName: string
  onConfirmImport: (members: ImportMemberConfig[]) => void
}

export interface ImportMemberConfig {
  github_login: string
  email?: string
  name?: string
  role: string
  avatar_url: string
  selected: boolean
  source: "collaborator" | "organization"
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin", description: "Full project management access" },
  { value: "reviewer", label: "Reviewer", description: "Code review and approval responsibilities" },
  { value: "developer", label: "Developer", description: "Standard development access" },
]

const ROLE_COLORS = {
  admin: "destructive",
  reviewer: "secondary",
  developer: "outline",
} as const

export function MembersPreviewDialog({ 
  open, 
  onOpenChange, 
  repoFullName, 
  onConfirmImport 
}: MembersPreviewDialogProps) {
  const { loading, error, preview, fetchMembersPreview } = useGitHubMembersPreview()
  const [members, setMembers] = useState<ImportMemberConfig[]>([])
  const [selectAll, setSelectAll] = useState(true)

  // Fetch members when dialog opens
  useEffect(() => {
    if (open && repoFullName) {
      fetchMembersPreview(repoFullName)
    }
  }, [open, repoFullName, fetchMembersPreview])

  // Initialize member configs when preview loads
  useEffect(() => {
    if (preview) {
      const memberConfigs: ImportMemberConfig[] = preview.all_members.map(member => ({
        github_login: member.login,
        email: member.email,
        name: member.name,
        role: preview.suggested_roles[member.login] || "developer",
        avatar_url: member.avatar_url,
        selected: true,
        source: member.source || "collaborator"
      }))
      setMembers(memberConfigs)
    }
  }, [preview])

  const handleRoleChange = (githubLogin: string, newRole: string) => {
    setMembers(prev => prev.map(member => 
      member.github_login === githubLogin 
        ? { ...member, role: newRole }
        : member
    ))
  }

  const handleSelectionChange = (githubLogin: string, selected: boolean) => {
    setMembers(prev => prev.map(member => 
      member.github_login === githubLogin 
        ? { ...member, selected }
        : member
    ))
  }

  const handleSelectAll = (selected: boolean) => {
    setSelectAll(selected)
    setMembers(prev => prev.map(member => ({ ...member, selected })))
  }

  const handleConfirm = () => {
    const selectedMembers = members.filter(m => m.selected)
    onConfirmImport(selectedMembers)
    onOpenChange(false)
  }

  const selectedCount = members.filter(m => m.selected).length
  const collaboratorCount = members.filter(m => m.source === "collaborator").length
  const orgMemberCount = members.filter(m => m.source === "organization").length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Preview Repository Members
          </DialogTitle>
          <DialogDescription>
            Review and configure team members before importing {repoFullName}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading repository members...</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {preview && (
          <div className="flex flex-col h-full">
            {/* Repository Info */}
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GitBranch className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h3 className="font-semibold">{preview.repository.full_name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {preview.repository.private ? (
                          <Badge variant="secondary" className="text-xs">
                            <Lock className="h-3 w-3 mr-1" />
                            Private
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            <Unlock className="h-3 w-3 mr-1" />
                            Public
                          </Badge>
                        )}
                        {preview.organization && (
                          <Badge variant="default" className="text-xs">
                            <Building2 className="h-3 w-3 mr-1" />
                            {preview.organization.login}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{selectedCount} of {members.length} members selected</p>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Members List */}
            <Tabs defaultValue="all" className="flex-1">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">
                  All Members ({members.length})
                </TabsTrigger>
                <TabsTrigger value="collaborators">
                  Collaborators ({collaboratorCount})
                </TabsTrigger>
                <TabsTrigger value="organization">
                  Organization ({orgMemberCount})
                </TabsTrigger>
              </TabsList>

              <div className="mt-4 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="selectAll"
                    checked={selectAll}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="selectAll" className="text-sm font-medium">
                    Select all members
                  </label>
                </div>
              </div>

              <TabsContent value="all" className="flex-1">
                <MembersList 
                  members={members}
                  onRoleChange={handleRoleChange}
                  onSelectionChange={handleSelectionChange}
                />
              </TabsContent>

              <TabsContent value="collaborators" className="flex-1">
                <MembersList 
                  members={members.filter(m => m.source === "collaborator")}
                  onRoleChange={handleRoleChange}
                  onSelectionChange={handleSelectionChange}
                />
              </TabsContent>

              <TabsContent value="organization" className="flex-1">
                <MembersList 
                  members={members.filter(m => m.source === "organization")}
                  onRoleChange={handleRoleChange}
                  onSelectionChange={handleSelectionChange}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedCount > 0 && `${selectedCount} members will be invited to join the project`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm}
              disabled={selectedCount === 0}
            >
              Import Project ({selectedCount} members)
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface MembersListProps {
  members: ImportMemberConfig[]
  onRoleChange: (githubLogin: string, newRole: string) => void
  onSelectionChange: (githubLogin: string, selected: boolean) => void
}

function MembersList({ members, onRoleChange, onSelectionChange }: MembersListProps) {
  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-2">
        {members.map((member, index) => (
          <motion.div
            key={member.github_login}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-4 p-3 border rounded-lg"
          >
            <input
              type="checkbox"
              checked={member.selected}
              onChange={(e) => onSelectionChange(member.github_login, e.target.checked)}
              className="rounded"
            />
            
            <Avatar className="h-10 w-10">
              <AvatarImage src={member.avatar_url} alt={member.github_login} />
              <AvatarFallback>
                {member.github_login.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{member.github_login}</h4>
                <Badge variant="outline" className="text-xs">
                  {member.source}
                </Badge>
              </div>
              {(member.name || member.email) && (
                <p className="text-sm text-muted-foreground">
                  {member.name} {member.email && `<${member.email}>`}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={member.role}
                onValueChange={(value) => onRoleChange(member.github_login, value)}
                disabled={!member.selected}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={ROLE_COLORS[role.value as keyof typeof ROLE_COLORS]} 
                          className="text-xs"
                        >
                          {role.label}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        ))}
      </div>
    </ScrollArea>
  )
}