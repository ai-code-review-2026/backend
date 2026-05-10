"use client"

import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  FileText,
  Lock,
  MessageSquare,
  Search,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type PermissionCatalogItem = {
  code: string
  description: string
  userCount: number
}

type PermissionGroup = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  permissions: PermissionCatalogItem[]
  gradient: string
}

const PERMISSION_GROUP_ORDER = [
  "assignments",
  "comments",
  "reviews",
  "analyses",
  "templates",
  "threads",
  "metrics",
  "admin",
  "other",
]

const PERMISSION_GROUPS_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; gradient: string }
> = {
  assignments: { label: "Assignments", icon: ClipboardList, gradient: "from-orange-500 to-amber-500" },
  comments: { label: "Comments", icon: MessageSquare, gradient: "from-blue-500 to-cyan-500" },
  reviews: { label: "Reviews", icon: ShieldCheck, gradient: "from-emerald-500 to-teal-500" },
  analyses: { label: "Analyses", icon: Search, gradient: "from-violet-500 to-fuchsia-500" },
  templates: { label: "Templates", icon: FileText, gradient: "from-amber-500 to-yellow-500" },
  threads: { label: "Discussions", icon: Users, gradient: "from-indigo-500 to-purple-500" },
  metrics: { label: "Metrics", icon: BarChart3, gradient: "from-cyan-500 to-emerald-500" },
  admin: { label: "Administration", icon: Shield, gradient: "from-rose-500 to-orange-500" },
  other: { label: "Other", icon: Lock, gradient: "from-slate-500 to-slate-700" },
}

function groupPermissions(permissions: PermissionCatalogItem[]): PermissionGroup[] {
  const groups: Record<string, PermissionCatalogItem[]> = {}

  for (const permission of permissions) {
    const prefix = permission.code.split(".")[0] || "other"
    if (!groups[prefix]) {
      groups[prefix] = []
    }
    groups[prefix].push(permission)
  }

  return Object.entries(groups)
    .map(([prefix, perms]) => {
      const config = PERMISSION_GROUPS_CONFIG[prefix] || PERMISSION_GROUPS_CONFIG.other
      return {
        id: prefix,
        label: config.label,
        icon: config.icon,
        permissions: [...perms].sort((a, b) => a.code.localeCompare(b.code)),
        gradient: config.gradient,
      }
    })
    .sort((left, right) => {
      const leftIndex = PERMISSION_GROUP_ORDER.indexOf(left.id)
      const rightIndex = PERMISSION_GROUP_ORDER.indexOf(right.id)
      const normalizedLeft = leftIndex === -1 ? PERMISSION_GROUP_ORDER.length : leftIndex
      const normalizedRight = rightIndex === -1 ? PERMISSION_GROUP_ORDER.length : rightIndex
      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight
      }
      return left.label.localeCompare(right.label)
    })
}

type PermissionGroupCardProps = {
  group: PermissionGroup
  isExpanded: boolean
  onToggle: () => void
}

function PermissionGroupCard({ group, isExpanded, onToggle }: PermissionGroupCardProps) {
  const Icon = group.icon
  const totalUsers = group.permissions.reduce((sum, permission) => sum + permission.userCount, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-[24px] border border-border/70 bg-white/55 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/5 dark:shadow-[0_20px_50px_rgba(0,0,0,0.24)]"
    >
      <button
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors md:px-5",
          "bg-gradient-to-r from-white/40 to-transparent dark:from-white/5 dark:to-transparent",
          "hover:from-white/55 hover:to-white/5 dark:hover:from-white/10 dark:hover:to-white/5",
        )}
      >
        <div className="flex items-center gap-4">
          <div className={`flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br ${group.gradient} shadow-[0_12px_25px_rgba(0,0,0,0.18)]`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="space-y-0.5">
            <span className="block text-base font-semibold tracking-[-0.02em] text-foreground">
              {group.label}
            </span>
            <p className="text-sm text-muted-foreground">
              {group.permissions.length} permission{group.permissions.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="rounded-full border-border/70 bg-background/80 px-3 py-1 text-[11px] font-mono text-foreground dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          >
            {totalUsers} user{totalUsers !== 1 ? "s" : ""}
          </Badge>
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ScrollArea className="max-h-[320px]">
              <div className="space-y-1 p-3">
                {group.permissions.map((permission, index) => (
                  <motion.div
                    key={permission.code}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={cn(
                      "flex items-start justify-between gap-4 rounded-[18px] border border-border/60 px-3 py-3 transition-colors",
                      "bg-white/55 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <code className="inline-flex rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-mono text-foreground dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
                        {permission.code}
                      </code>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {permission.description}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-full border-border/70 bg-background/80 px-3 py-1 text-[11px] font-mono text-foreground dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                    >
                      {permission.userCount}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

type GroupedPermissionsProps = {
  permissions: PermissionCatalogItem[]
  title?: string
  className?: string
}

export function GroupedPermissions({ permissions, title = "Permissions disponibles", className }: GroupedPermissionsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["comments"]))
  const groups = useMemo(() => groupPermissions(permissions), [permissions])

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const expandAll = () => setExpandedGroups(new Set(groups.map((group) => group.id)))
  const collapseAll = () => setExpandedGroups(new Set())

  const totalPermissions = permissions.length
  const totalUsers = permissions.reduce((sum, permission) => sum + permission.userCount, 0)

  return (
    <Card
      className={cn(
        "rounded-[30px] border border-border/70 bg-white/75 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#0b1016]/80 dark:shadow-[0_30px_80px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500 ring-1 ring-rose-500/20 dark:bg-rose-400/15 dark:text-rose-300">
            <Shield className="h-5 w-5" />
          </div>
          <CardTitle className="text-[1.1rem] font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </CardTitle>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Badge
            variant="secondary"
            className="rounded-full border border-border/70 bg-white/70 px-3 py-1.5 font-mono text-[11px] text-foreground dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          >
            {totalPermissions} permissions
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 font-mono text-[11px] text-foreground dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          >
            {totalUsers} total assignations
          </Badge>
          <div className="flex items-center gap-2 pl-1">
            <button
              onClick={expandAll}
              className="text-xs font-medium text-violet-600 transition hover:text-violet-500 dark:text-violet-300 dark:hover:text-violet-200"
            >
              Expand all
            </button>
            <span className="text-muted-foreground/50">|</span>
            <button
              onClick={collapseAll}
              className="text-xs font-medium text-violet-600 transition hover:text-violet-500 dark:text-violet-300 dark:hover:text-violet-200"
            >
              Collapse all
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Aucune permission chargée.</p>
        ) : (
          <ScrollArea className="h-[520px] pr-2">
            <div className="space-y-3">
              {groups.map((group) => (
                <PermissionGroupCard
                  key={group.id}
                  group={group}
                  isExpanded={expandedGroups.has(group.id)}
                  onToggle={() => toggleGroup(group.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
