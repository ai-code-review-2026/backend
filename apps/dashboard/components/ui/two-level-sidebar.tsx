"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search as SearchIcon,
  Dashboard,
  Task,
  Folder,
  Analytics,
  DocumentAdd,
  Settings as SettingsIcon,
  User as UserIcon,
  ChevronDown as ChevronDownIcon,
  AddLarge,
  Filter,
  Time,
  InProgress,
  CheckmarkOutline,
  Flag,
  Archive,
  View,
  Report,
  StarFilled,
  Group,
  ChartBar,
  Security,
  Notification,
  Integration,
  UserMultiple,
  Code,
  Terminal,
  RequestQuote,
  DataBase,
  Policy,
  Activity,
  List,
  Building,
  DocumentView,
  DocumentTasks,
  Badge,
  Template,
  SettingsAdjust,
  FolderDetails,
  Cube,
} from "@carbon/icons-react";

import { SignOutButton } from "@clerk/nextjs";
import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRoleLabel, getRoleHomePath, isReviewer, isReviewerLead, type AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Theme } from "@/components/ui/theme";

/** ======================= Local SVG paths (inline) ======================= */
const svgPaths = {
  p36880f80:
    "M0.32 0C0.20799 0 0.151984 0 0.109202 0.0217987C0.0715695 0.0409734 0.0409734 0.0715695 0.0217987 0.109202C0 0.151984 0 0.20799 0 0.32V6.68C0 6.79201 0 6.84801 0.0217987 6.8908C0.0409734 6.92843 0.0715695 6.95902 0.109202 6.9782C0.151984 7 0.207989 7 0.32 7L3.68 7C3.79201 7 3.84802 7 3.8908 6.9782C3.92843 6.95903 3.95903 6.92843 3.9782 6.8908C4 6.84801 4 6.79201 4 6.68V4.32C4 4.20799 4 4.15198 4.0218 4.1092C4.04097 4.07157 4.07157 4.04097 4.1092 4.0218C4.15198 4 4.20799 4 4.32 4L19.68 4C19.792 4 19.848 4 19.8908 4.0218C19.9284 4.04097 19.959 4.07157 19.9782 4.1092C20 4.15198 20 4.20799 20 4.32V6.68C20 6.79201 20 6.84802 20.0218 6.8908C20.041 6.92843 20.0716 6.95903 20.1092 6.9782C20.152 7 20.208 7 20.32 7L23.68 7C23.792 7 23.848 7 23.8908 6.9782C23.9284 6.95903 23.959 6.92843 23.9782 6.8908C24 6.84802 24 6.79201 24 6.68V0.32C24 0.20799 24 0.151984 23.9782 0.109202C23.959 0.0715695 23.9284 0.0409734 23.8908 0.0217987C23.848 0 23.792 0 23.68 0H0.32Z",
  p355df480:
    "M0.32 16C0.20799 16 0.151984 16 0.109202 15.9782C0.0715695 15.959 0.0409734 15.9284 0.0217987 15.8908C0 15.848 0 15.792 0 15.68V9.32C0 9.20799 0 9.15198 0.0217987 9.1092C0.0409734 9.07157 0.0715695 9.04097 0.109202 9.0218C0.151984 9 0.207989 9 0.32 9H3.68C3.79201 9 3.84802 9 3.8908 9.0218C3.92843 9.04097 3.95903 9.07157 3.9782 9.1092C4 9.15198 4 9.20799 4 9.32V11.68C4 11.792 4 11.848 4.0218 11.8908C4.04097 11.9284 4.07157 11.959 4.1092 11.9782C4.15198 12 4.20799 12 4.32 12L19.68 12C19.792 12 19.848 12 19.8908 11.9782C19.9284 11.959 19.959 11.9284 19.9782 11.8908C20 11.848 20 11.792 20 11.68V9.32C20 9.20799 20 9.15199 20.0218 9.1092C20.041 9.07157 20.0716 9.04098 20.1092 9.0218C20.152 9 20.208 9 20.32 9H23.68C23.792 9 23.848 9 23.8908 9.0218C23.9284 9.04098 23.959 9.07157 23.9782 9.1092C24 9.15199 24 9.20799 24 9.32V15.68C24 15.792 24 15.848 23.9782 15.8908C23.959 15.9284 23.9284 15.959 23.8908 15.9782C23.848 16 23.792 16 23.68 16H0.32Z",
  pfa0d600:
    "M6.32 10C6.20799 10 6.15198 10 6.1092 9.9782C6.07157 9.95903 6.04097 9.92843 6.0218 9.8908C6 9.84802 6 9.79201 6 9.68V6.32C6 6.20799 6 6.15198 6.0218 6.1092C6.04097 6.07157 6.07157 6.04097 6.1092 6.0218C6.15198 6 6.20799 6 6.32 6L17.68 6C17.792 6 17.848 6 17.8908 6.0218C17.9284 6.04097 17.959 6.07157 17.9782 6.1092C18 6.15198 18 6.20799 18 6.32V9.68C18 9.79201 18 9.84802 17.9782 9.8908C17.959 9.92843 17.9284 9.95903 17.8908 9.9782C17.848 10 17.792 10 17.68 10H6.32Z",
};

// Softer spring animation curve
const softSpringEasing = "cubic-bezier(0.25, 1.1, 0.4, 1)";

/* ----------------------------- Brand / Logos ----------------------------- */

function InterfacesLogoSquare() {
  return (
    <div className="aspect-[24/24] grow min-h-px min-w-px overflow-clip relative shrink-0">
      <div className="absolute aspect-[24/16] left-0 right-0 top-1/2 -translate-y-1/2">
        <svg className="block size-full" fill="none" viewBox="0 0 24 16">
          <g>
            <path d={svgPaths.p36880f80} fill="currentColor" />
            <path d={svgPaths.p355df480} fill="currentColor" />
            <path d={svgPaths.pfa0d600} fill="currentColor" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function BrandBadge() {
  return (
    <div className="relative shrink-0 w-full">
      <div className="flex items-center p-1 w-full">
        <div className="h-10 w-8 flex items-center justify-center pl-2">
          <div className="flex h-8 w-8 items-center justify-center bg-[--orange] text-sm font-bold text-white">
            A
          </div>
        </div>
        <div className="px-2 py-1">
          <div className="font-semibold text-[16px] text-sidebar-foreground">
            AI Review
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Avatar -------------------------------- */

function AvatarCircle({ initials, className }: { initials: string; className?: string }) {
  return (
    <Avatar className={cn("h-8 w-8 border-2 border-primary/20", className)}>
      <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-xs font-bold text-primary-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

/* ------------------------------ Search Input ----------------------------- */

function SearchContainer({ 
  isCollapsed = false,
  searchValue,
  onSearchChange,
}: { 
  isCollapsed?: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div
      className={`relative shrink-0 transition-all duration-500 ${
        isCollapsed ? "w-full flex justify-center" : "w-full"
      }`}
      style={{ transitionTimingFunction: softSpringEasing }}
    >
      <div
        className={`bg-sidebar-accent/50 h-10 relative rounded-none flex items-center transition-all duration-500 border border-[--border-default] ${
          isCollapsed ? "w-10 min-w-10 justify-center" : "w-full"
        }`}
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        <div
          className={`flex items-center justify-center shrink-0 transition-all duration-500 ${
            isCollapsed ? "p-1" : "px-1"
          }`}
          style={{ transitionTimingFunction: softSpringEasing }}
        >
          <div className="size-8 flex items-center justify-center">
            <SearchIcon size={16} className="text-sidebar-foreground" />
          </div>
        </div>

        <div
          className={`flex-1 relative transition-opacity duration-500 overflow-hidden ${
            isCollapsed ? "opacity-0 w-0" : "opacity-100"
          }`}
          style={{ transitionTimingFunction: softSpringEasing }}
        >
          <div className="flex flex-col justify-center size-full">
            <div className="flex flex-col gap-2 items-start justify-center pr-2 py-1 w-full">
              <input
                type="text"
                placeholder="Search..."
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-[14px] text-sidebar-foreground placeholder:text-muted-foreground leading-[20px]"
                tabIndex={isCollapsed ? -1 : 0}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Helper function to filter menu items based on search */
function filterSidebarContent(content: SidebarContent, searchQuery: string): SidebarContent {
  if (!searchQuery.trim()) return content;
  
  const query = searchQuery.toLowerCase();
  
  const filteredSections = content.sections
    .map((section) => {
      const filteredItems = section.items.filter((item) => {
        // Check if item label matches
        if (item.label.toLowerCase().includes(query)) return true;
        // Check if any children match
        if (item.children?.some((child) => child.label.toLowerCase().includes(query))) return true;
        return false;
      }).map((item) => {
        // If item has children and some match, filter children too
        if (item.children) {
          const filteredChildren = item.children.filter((child) =>
            child.label.toLowerCase().includes(query) || item.label.toLowerCase().includes(query)
          );
          return { ...item, children: filteredChildren };
        }
        return item;
      });
      
      return { ...section, items: filteredItems };
    })
    .filter((section) => section.items.length > 0);
  
  return { ...content, sections: filteredSections };
}

function collectSidebarRoutes(content: SidebarContent): string[] {
  const routes = new Set<string>();

  content.sections.forEach((section) => {
    section.items.forEach((item) => {
      if (item.href) {
        routes.add(item.href);
      }

      item.children?.forEach((child) => {
        if (child.href) {
          routes.add(child.href);
        }
      });
    });
  });

  return Array.from(routes);
}

/* --------------------------- Types / Content Map -------------------------- */

interface MenuItemT {
  icon?: React.ReactNode;
  label: string;
  href?: string;
  hasDropdown?: boolean;
  isActive?: boolean;
  children?: MenuItemT[];
  badge?: number;
  badgeColor?: string;
}
interface MenuSectionT {
  title: string;
  items: MenuItemT[];
}
interface SidebarContent {
  title: string;
  sections: MenuSectionT[];
}

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  requiresAdmin?: boolean;
  requiresReviewer?: boolean;
  requiresReviewerSeniorOrLead?: boolean;
}

function getSidebarContent(
  activeSection: string,
  pathname: string,
  homePath: string,
  isAdmin: boolean,
  isReviewerRole: boolean,
  isReviewerLeadRole: boolean,
  pendingReviewsCount: number,
  overdueCount: number
): SidebarContent {
  const contentMap: Record<string, SidebarContent> = {
    dashboard: {
      title: "Dashboard",
      sections: [
        {
          title: "Overview",
          items: [
            {
              icon: <View size={16} className="text-sidebar-foreground" />,
              label: "Home",
              href: homePath,
              isActive: pathname === homePath || pathname === "/dashboard",
            },
            {
              icon: <ChartBar size={16} className="text-sidebar-foreground" />,
              label: "Statistics",
              hasDropdown: true,
              href: "/dashboard/statistics",
              isActive: pathname === "/dashboard/statistics",
              children: [
                { label: "Code Quality Trends", href: "/dashboard/statistics?tab=quality" },
                { label: "Review Velocity", href: "/dashboard/statistics?tab=velocity" },
                { label: "Team Performance", href: "/dashboard/statistics?tab=performance" },
              ],
            },
            {
              icon: <Activity size={16} className="text-sidebar-foreground" />,
              label: "Insights",
              href: "/dashboard/insights",
              isActive: pathname === "/dashboard/insights",
            },
          ],
        },
        {
          title: "Quick Actions",
          items: [
            {
              icon: <AddLarge size={16} className="text-sidebar-foreground" />,
              label: "New Analysis",
              href: "/dashboard/analyses?action=new",
            },
            {
              icon: <Report size={16} className="text-sidebar-foreground" />,
              label: "Recent Reports",
              hasDropdown: true,
              children: [
                { label: "Last 24 hours", href: "/dashboard/analyses?period=24h" },
                { label: "This week", href: "/dashboard/analyses?period=week" },
                { label: "This month", href: "/dashboard/analyses?period=month" },
              ],
            },
          ],
        },
      ],
    },

    analyses: {
      title: "Analyses",
      sections: [
        {
          title: "Code Reviews",
          items: [
            {
              icon: <List size={16} className="text-sidebar-foreground" />,
              label: "All Analyses",
              href: "/dashboard/analyses",
              isActive: pathname === "/dashboard/analyses",
            },
            {
              icon: <Time size={16} className="text-sidebar-foreground" />,
              label: "Recent",
              hasDropdown: true,
              children: [
                { label: "Today's analyses", href: "/dashboard/analyses?filter=today" },
                { label: "This week", href: "/dashboard/analyses?filter=week" },
                { label: "Pending review", href: "/dashboard/analyses?filter=pending" },
              ],
            },
          ],
        },
        {
          title: "Filters",
          items: [
            {
              icon: <Filter size={16} className="text-sidebar-foreground" />,
              label: "By Status",
              hasDropdown: true,
              children: [
                { icon: <InProgress size={14} className="text-muted-foreground" />, label: "In Progress", href: "/dashboard/analyses?status=in_progress" },
                { icon: <CheckmarkOutline size={14} className="text-muted-foreground" />, label: "Completed", href: "/dashboard/analyses?status=completed" },
                { icon: <Flag size={14} className="text-muted-foreground" />, label: "Needs Attention", href: "/dashboard/analyses?status=attention" },
              ],
            },
            {
              icon: <Folder size={16} className="text-sidebar-foreground" />,
              label: "By Project",
              href: "/dashboard/analyses?view=projects",
            },
            { 
              icon: <Archive size={16} className="text-sidebar-foreground" />, 
              label: "Archived",
              href: "/dashboard/analyses?filter=archived",
            },
          ],
        },
      ],
    },

    workspace: {
      title: "Workspace",
      sections: [
        {
          title: "Organization",
          items: [
            {
              icon: <Building size={16} className="text-sidebar-foreground" />,
              label: "Overview",
              href: "/dashboard/organization",
              isActive: pathname.startsWith("/dashboard/organization") && !pathname.includes("/teams"),
            },
            {
              icon: <Group size={16} className="text-sidebar-foreground" />,
              label: "Teams",
              hasDropdown: true,
              href: "/dashboard/teams",
              isActive: pathname.startsWith("/dashboard/teams"),
              children: [
                { label: "Development Team", href: "/dashboard/teams?team=dev" },
                { label: "QA Team", href: "/dashboard/teams?team=qa" },
                { label: "DevOps Team", href: "/dashboard/teams?team=devops" },
              ],
            },
          ],
        },
        {
          title: "Resources",
          items: [
            {
              icon: <FolderDetails size={16} className="text-sidebar-foreground" />,
              label: "Projects",
              href: "/dashboard/projects",
              isActive: pathname === "/dashboard/projects",
            },
            {
              icon: <Code size={16} className="text-sidebar-foreground" />,
              label: "Repositories",
              href: "/dashboard/repositories",
              isActive: pathname === "/dashboard/repositories",
            },
            {
              icon: <DataBase size={16} className="text-sidebar-foreground" />,
              label: "Knowledge Base",
              href: "/dashboard/knowledge-base",
              isActive: pathname === "/dashboard/knowledge-base",
            },
            {
              icon: <Cube size={16} className="text-sidebar-foreground" />,
              label: "Graph 3D",
              href: "/dashboard/graph-3d",
              isActive: pathname === "/dashboard/graph-3d",
            },
            {
              icon: <Analytics size={16} className="text-sidebar-foreground" />,
              label: "RAG Evaluation",
              href: "/dashboard/evaluation",
              isActive: pathname === "/dashboard/evaluation",
            },
          ],
        },
      ],
    },

    editor: {
      title: "Code Editor",
      sections: [
        {
          title: "Editor",
          items: [
            {
              icon: <Terminal size={16} className="text-sidebar-foreground" />,
              label: "Open Editor",
              href: "/dashboard/editor",
              isActive: pathname === "/dashboard/editor",
            },
          ],
        },
        {
          title: "Quick Actions",
          items: [
            {
              icon: <Code size={16} className="text-sidebar-foreground" />,
              label: "Repositories",
              href: "/dashboard/repositories",
              isActive: pathname === "/dashboard/repositories",
            },
            {
              icon: <FolderDetails size={16} className="text-sidebar-foreground" />,
              label: "Projects",
              href: "/dashboard/projects",
              isActive: pathname === "/dashboard/projects",
            },
          ],
        },
      ],
    },

    pulls: {
      title: "Pull Requests",
      sections: [
        {
          title: "PR Workflow",
          items: [
            {
              icon: <RequestQuote size={16} className="text-sidebar-foreground" />,
              label: "All PRs",
              href: "/dashboard/pulls",
              isActive: pathname === "/dashboard/pulls",
            },
          ],
        },
      ],
    },

    reviews: {
      title: "Reviews",
      sections: [
        {
          title: "My Reviews",
          items: [
            {
              icon: <DocumentTasks size={16} className="text-sidebar-foreground" />,
              label: "Dashboard",
              href: "/dashboard/lead",
              isActive: pathname === "/dashboard/lead",
              badge: pendingReviewsCount > 0 ? pendingReviewsCount : undefined,
              badgeColor: "bg-amber-500",
            },
            {
              icon: <Task size={16} className="text-sidebar-foreground" />,
              label: "Review Queue",
              href: "/dashboard/lead/queue",
              isActive: pathname === "/dashboard/lead/queue",
              badge: overdueCount > 0 ? overdueCount : undefined,
              badgeColor: "bg-red-500",
            },
            {
              icon: <DocumentView size={16} className="text-sidebar-foreground" />,
              label: "My Reviews",
              href: "/dashboard/lead/my-reviews",
              isActive: pathname === "/dashboard/lead/my-reviews",
            },
          ],
        },
        {
          title: "Analytics",
          items: [
            {
              icon: <Analytics size={16} className="text-sidebar-foreground" />,
              label: "My Analytics",
              href: "/dashboard/lead/analytics",
              isActive: pathname === "/dashboard/lead/analytics",
            },
            ...(isReviewerLeadRole
              ? [
                  {
                    icon: <Activity size={16} className="text-sidebar-foreground" />,
                    label: "Team Analytics",
                    href: "/dashboard/lead/team-analytics",
                    isActive: pathname === "/dashboard/lead/team-analytics",
                  },
                ]
              : []),
          ],
        },
        ...(isReviewerLeadRole
          ? [
              {
                title: "Management",
                items: [
                  {
                    icon: <Template size={16} className="text-sidebar-foreground" />,
                    label: "Templates",
                    href: "/dashboard/lead/templates",
                    isActive: pathname === "/dashboard/lead/templates",
                  },
                ],
              },
            ]
          : []),
        {
          title: "Settings",
          items: [
            {
              icon: <SettingsAdjust size={16} className="text-sidebar-foreground" />,
              label: "Review Settings",
              href: "/dashboard/lead/settings",
              isActive: pathname === "/dashboard/lead/settings",
            },
          ],
        },
      ],
    },

    "review-status": {
      title: "Review Status",
      sections: [
        {
          title: "Monitoring",
          items: [
            {
              icon: <Activity size={16} className="text-sidebar-foreground" />,
              label: "Dashboard",
              href: "/dashboard/review-status",
              isActive: pathname === "/dashboard/review-status",
            },
          ],
        },
        {
          title: "Views",
          items: [
            {
              icon: <Time size={16} className="text-sidebar-foreground" />,
              label: "Timeline View",
              href: "/dashboard/review-status?tab=timeline",
              isActive: pathname.startsWith("/dashboard/review-status"),
            },
            {
              icon: <Badge size={16} className="text-sidebar-foreground" />,
              label: "Notifications",
              href: "/dashboard/review-status?tab=notifications", 
              isActive: pathname.startsWith("/dashboard/review-status"),
            },
            {
              icon: <ChartBar size={16} className="text-sidebar-foreground" />,
              label: "Analytics",
              href: "/dashboard/review-status?tab=analytics",
              isActive: pathname.startsWith("/dashboard/review-status"),
            },
          ],
        },
      ],
    },

    jira: {
      title: "Jira Integration",
      sections: [
        {
          title: "Management",
          items: [
            {
              icon: <Integration size={16} className="text-sidebar-foreground" />,
              label: "Dashboard",
              href: "/dashboard/jira",
              isActive: pathname === "/dashboard/jira",
            },
          ],
        },
        {
          title: "Workflows",
          items: [
            {
              icon: <Activity size={16} className="text-sidebar-foreground" />,
              label: "Kanban Board",
              href: "/dashboard/jira?tab=kanban",
              isActive: pathname.startsWith("/dashboard/jira"),
            },
            {
              icon: <DocumentTasks size={16} className="text-sidebar-foreground" />,
              label: "Issue List", 
              href: "/dashboard/jira?tab=issues",
              isActive: pathname.startsWith("/dashboard/jira"),
            },
          ],
        },
        {
          title: "Configuration",
          items: [
            {
              icon: <SettingsIcon size={16} className="text-sidebar-foreground" />,
              label: "Setup & OAuth",
              href: "/dashboard/jira?tab=setup",
              isActive: pathname.startsWith("/dashboard/jira"),
            },
          ],
        },
      ],
    },

    observability: {
      title: "Observability",
      sections: [
        {
          title: "Monitoring",
          items: [
            {
              icon: <Activity size={16} className="text-sidebar-foreground" />,
              label: "Dashboard",
              href: "/dashboard/observability",
              isActive: pathname === "/dashboard/observability",
            },
          ],
        },
        {
          title: "Analytics",
          items: [
            {
              icon: <ChartBar size={16} className="text-sidebar-foreground" />,
              label: "System Metrics",
              href: "/dashboard/observability?tab=services",
              isActive: pathname.startsWith("/dashboard/observability"),
            },
            {
              icon: <Time size={16} className="text-sidebar-foreground" />,
              label: "Timeline View", 
              href: "/dashboard/observability?tab=timeline",
              isActive: pathname.startsWith("/dashboard/observability"),
            },
          ],
        },
        {
          title: "Alerts",
          items: [
            {
              icon: <Badge size={16} className="text-sidebar-foreground" />,
              label: "Alert Management",
              href: "/dashboard/observability?tab=alerts",
              isActive: pathname.startsWith("/dashboard/observability"),
            },
          ],
        },
      ],
    },

    admin: {
      title: "Administration",
      sections: [
        {
          title: "Content",
          items: [
            {
              icon: <DataBase size={16} className="text-sidebar-foreground" />,
              label: "Knowledge Base",
              href: "/dashboard/admin/knowledge-base",
              isActive: pathname === "/dashboard/admin/knowledge-base",
            },
            {
              icon: <Policy size={16} className="text-sidebar-foreground" />,
              label: "Policies & Rules",
              href: "/dashboard/admin/policies",
              isActive: pathname === "/dashboard/admin/policies",
            },
          ],
        },
        {
          title: "Users & Orgs",
          items: [
            {
              icon: <UserMultiple size={16} className="text-sidebar-foreground" />,
              label: "Users",
              href: "/dashboard/admin/users",
              isActive: pathname === "/dashboard/admin/users",
            },
            {
              icon: <Building size={16} className="text-sidebar-foreground" />,
              label: "Organizations",
              href: "/dashboard/admin/organization",
              isActive: pathname.startsWith("/dashboard/admin/organization"),
            },
            {
              icon: <Group size={16} className="text-sidebar-foreground" />,
              label: "Teams",
              href: "/dashboard/admin/teams",
              isActive: pathname.startsWith("/dashboard/admin/teams"),
            },
          ],
        },
        {
          title: "System",
          items: [
            {
              icon: <Activity size={16} className="text-sidebar-foreground" />,
              label: "Observability",
              href: "/dashboard/admin/observability",
              isActive: pathname === "/dashboard/admin/observability",
            },
            {
              icon: <Integration size={16} className="text-sidebar-foreground" />,
              label: "Integrations",
              href: "/dashboard/admin/integrations",
              isActive: pathname === "/dashboard/admin/integrations",
            },
          ],
        },
      ],
    },

    settings: {
      title: "Settings",
      sections: [
        {
          title: "Account",
          items: [
            { 
              icon: <UserIcon size={16} className="text-sidebar-foreground" />, 
              label: "Profile",
              href: "/dashboard/settings/profile",
              isActive: pathname === "/dashboard/settings/profile",
            },
            { 
              icon: <Security size={16} className="text-sidebar-foreground" />, 
              label: "Security",
              href: "/dashboard/settings/security",
              isActive: pathname === "/dashboard/settings/security",
            },
            { 
              icon: <Notification size={16} className="text-sidebar-foreground" />, 
              label: "Notifications",
              href: "/dashboard/settings/notifications",
              isActive: pathname === "/dashboard/settings/notifications",
            },
            { 
              icon: <SettingsIcon size={16} className="text-sidebar-foreground" />, 
              label: "Integrations",
              href: "/dashboard/settings/integrations",
              isActive: pathname === "/dashboard/settings/integrations",
            },
          ],
        },
        {
          title: "Preferences",
          items: [
            {
              icon: <SettingsIcon size={16} className="text-sidebar-foreground" />,
              label: "General",
              href: "/dashboard/settings/general",
              isActive: pathname === "/dashboard/settings/general" || pathname?.startsWith("/dashboard/settings/general/"),
              hasDropdown: true,
              children: [
                { label: "Theme settings", href: "/dashboard/settings/general#theme" },
                { label: "Language", href: "/dashboard/settings/general#language" },
                { label: "Time zone", href: "/dashboard/settings/general#timezone" },
              ],
            },
          ],
        },
      ],
    },
  };

  return contentMap[activeSection] || contentMap.dashboard;
}

/* ---------------------------- Left Icon Nav Rail -------------------------- */

function IconNavButton({
  children,
  isActive = false,
  onClick,
  title,
}: {
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn(
        "flex items-center justify-center rounded-none size-10 min-w-10 transition-colors duration-200",
        isActive
          ? "bg-[--orange] text-white border-l-2 border-[--orange]"
          : "hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground"
      )}
      style={{ transitionTimingFunction: softSpringEasing }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function IconNavigation({
  activeSection,
  onSectionChange,
  isAdmin,
  isReviewerRole,
}: {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isAdmin: boolean;
  isReviewerRole: boolean;
}) {
  const navItems: NavItem[] = [
    { id: "dashboard", icon: <Dashboard size={18} />, label: "Dashboard" },
    { id: "analyses", icon: <List size={18} />, label: "Analyses" },
    { id: "workspace", icon: <Building size={18} />, label: "Workspace" },
    { id: "editor", icon: <Terminal size={18} />, label: "Editor" },
    { id: "pulls", icon: <RequestQuote size={18} />, label: "PRs" },
    { id: "reviews", icon: <DocumentTasks size={18} />, label: "Reviews", requiresReviewer: true },
    { id: "review-status", icon: <Activity size={18} />, label: "Review Status" },
    { id: "observability", icon: <ChartBar size={18} />, label: "Observability", requiresAdmin: true },
    { id: "jira", icon: <Integration size={18} />, label: "Jira", requiresAdmin: true },
    { id: "admin", icon: <Security size={18} />, label: "Admin", requiresAdmin: true },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (item.requiresAdmin && !isAdmin) return false;
    if (item.requiresReviewer && !isReviewerRole) return false;
    if (item.requiresReviewerSeniorOrLead && !isReviewerRole) return false;
    return true;
  });

  return (
    <aside className="bg-sidebar flex flex-col gap-2 items-center py-4 px-2 w-16 h-full border-r border-sidebar-border">
      {/* Logo */}
      <div className="mb-4 size-10 flex items-center justify-center">
        <div className="flex h-9 w-9 items-center justify-center bg-[--orange] text-sm font-bold text-white">
          A
        </div>
      </div>

      {/* Navigation Icons */}
      <div className="flex flex-col gap-2 w-full items-center">
        {filteredNavItems.map((item) => (
          <IconNavButton
            key={item.id}
            isActive={activeSection === item.id}
            onClick={() => onSectionChange(item.id)}
            title={item.label}
          >
            {item.icon}
          </IconNavButton>
        ))}
      </div>

      <div className="flex-1" />

      {/* Bottom section */}
      <div className="flex flex-col gap-2 w-full items-center">
        <IconNavButton
          isActive={activeSection === "settings"}
          onClick={() => onSectionChange("settings")}
          title="Settings"
        >
          <SettingsIcon size={18} />
        </IconNavButton>
      </div>
    </aside>
  );
}

/* ------------------------------ Right Sidebar ----------------------------- */

function SectionTitle({
  title,
  onToggleCollapse,
  isCollapsed,
}: {
  title: string;
  onToggleCollapse: () => void;
  isCollapsed: boolean;
}) {
  if (isCollapsed) {
    return (
      <div
        className="w-full flex justify-center transition-all duration-500"
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center justify-center rounded-lg size-10 min-w-10 transition-all duration-500 hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground"
          style={{ transitionTimingFunction: softSpringEasing }}
          aria-label="Expand sidebar"
        >
          <span className="inline-block rotate-180">
            <ChevronDownIcon size={16} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-hidden transition-all duration-500"
      style={{ transitionTimingFunction: softSpringEasing }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center h-10">
          <div className="px-2 py-1">
            <div className="font-semibold text-[18px] text-sidebar-foreground leading-[27px]">
              {title}
            </div>
          </div>
        </div>
        <div className="pr-1">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center justify-center rounded-lg size-10 min-w-10 transition-all duration-500 hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground"
            style={{ transitionTimingFunction: softSpringEasing }}
            aria-label="Collapse sidebar"
          >
            <ChevronDownIcon size={16} className="-rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailSidebar({
  activeSection,
  homePath,
  isAdmin,
  isReviewerRole,
  isReviewerLeadRole,
  pendingReviewsCount,
  overdueCount,
  currentUser,
  isMobile = false,
  onBack,
}: {
  activeSection: string;
  homePath: string;
  isAdmin: boolean;
  isReviewerRole: boolean;
  isReviewerLeadRole: boolean;
  pendingReviewsCount: number;
  overdueCount: number;
  currentUser: {
    name: string;
    email: string;
    avatar: string;
    role: AppRole;
  };
  isMobile?: boolean;
  onBack?: () => void;
  }) {
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const pathname = usePathname();
    const router = useRouter();
    
    const rawContent = React.useMemo(
      () =>
        getSidebarContent(
          activeSection,
          pathname,
          homePath,
          isAdmin,
          isReviewerRole,
          isReviewerLeadRole,
          pendingReviewsCount,
          overdueCount,
        ),
      [
        activeSection,
        pathname,
        homePath,
        isAdmin,
        isReviewerRole,
        isReviewerLeadRole,
        pendingReviewsCount,
        overdueCount,
      ],
    );
    
    // Apply search filter
    const content = React.useMemo(
      () => filterSidebarContent(rawContent, searchQuery),
      [rawContent, searchQuery],
    );
    const prefetchRoutes = React.useMemo(() => collectSidebarRoutes(content), [content]);

  const toggleExpanded = (itemKey: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
    };

    const toggleCollapse = () => setIsCollapsed((s) => !s);

    React.useEffect(() => {
      if (searchQuery.trim()) {
        return;
      }

      const timer = window.setTimeout(() => {
        prefetchRoutes.forEach((href) => {
          void router.prefetch(href);
        });
      }, 150);

      return () => window.clearTimeout(timer);
    }, [prefetchRoutes, router, searchQuery]);
    
    // Auto-expand items when searching
    React.useEffect(() => {
    if (searchQuery.trim()) {
      const newExpanded = new Set<string>();
      content.sections.forEach((section, sectionIndex) => {
        section.items.forEach((item, itemIndex) => {
          if (item.children && item.children.length > 0) {
            newExpanded.add(`${section.title}-${itemIndex}`);
          }
        });
      });
      setExpandedItems(newExpanded);
    }
  }, [searchQuery, content.sections]);

  return (
    <aside
      className={cn(
        "bg-sidebar flex flex-col gap-4 items-start p-4 transition-all duration-500 h-full border-r border-sidebar-border",
        isCollapsed ? "w-16 min-w-16 !px-2 justify-start" : "w-64"
      )}
      style={{ transitionTimingFunction: softSpringEasing }}
    >
      {/* Mobile Back Button */}
      {isMobile && (
        <div className="flex items-center gap-2 w-full pb-2 border-b border-sidebar-border md:hidden">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground"
            aria-label="Back to menu"
          >
            <ChevronDownIcon size={16} className="rotate-90" />
          </button>
          <div className="text-sm font-medium text-sidebar-foreground">
            Back to Menu
          </div>
        </div>
      )}

      {!isCollapsed && <BrandBadge />}

      <SectionTitle title={rawContent.title} onToggleCollapse={toggleCollapse} isCollapsed={isCollapsed} />
      <SearchContainer 
        isCollapsed={isCollapsed} 
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div
        className={cn(
          "flex flex-col w-full overflow-y-auto transition-all duration-500 flex-1",
          isCollapsed ? "gap-2 items-center" : "gap-4 items-start"
        )}
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        {content.sections.length > 0 ? (
          content.sections.map((section, index) => (
            <MenuSection
              key={`${activeSection}-${index}`}
              section={section}
              expandedItems={expandedItems}
              onToggleExpanded={toggleExpanded}
              isCollapsed={isCollapsed}
            />
          ))
        ) : searchQuery.trim() ? (
          <div className="w-full text-center py-8 text-muted-foreground text-sm">
            No results for &ldquo;{searchQuery}&rdquo;
          </div>
        ) : null}
      </div>

      {!isCollapsed && (
        <div className="w-full mt-auto pt-2 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-2 py-2 w-full rounded-none hover:bg-sidebar-accent transition-colors">
                <AvatarCircle initials={currentUser.avatar} />
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-medium text-sidebar-foreground truncate">
                    {currentUser.name}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize truncate">
                    {formatRoleLabel(currentUser.role)}
                  </div>
                </div>
                <ChevronDownIcon size={16} className="text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              className="w-56 rounded-xl border border-sidebar-border bg-sidebar shadow-pro-lg"
            >
              <DropdownMenuLabel>
                <div className="flex flex-col gap-1 py-1">
                  <span className="text-sm font-semibold text-sidebar-foreground">{currentUser.name}</span>
                  <span className="text-xs text-muted-foreground">{currentUser.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-sidebar-border" />
              <div className="px-2 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-sidebar-foreground">Theme</span>
                </div>
                <Theme variant="switch" size="sm" showLabel />
              </div>
              <DropdownMenuSeparator className="bg-sidebar-border" />
              <DropdownMenuItem className="cursor-pointer rounded-lg text-sm text-sidebar-foreground">
                <SettingsIcon size={14} className="mr-2" />
                Preferences
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-sidebar-border" />
              <SignOutButton>
                <DropdownMenuItem className="cursor-pointer rounded-lg text-sm text-destructive">
                  Sign out
                </DropdownMenuItem>
              </SignOutButton>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </aside>
  );
}

/* ------------------------------ Menu Elements ---------------------------- */

function MenuItem({
  item,
  isExpanded,
  onToggle,
  isCollapsed,
}: {
  item: MenuItemT;
  isExpanded?: boolean;
  onToggle?: () => void;
  isCollapsed?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "rounded-none cursor-pointer transition-colors duration-200 flex items-center relative",
        item.isActive
          ? "border-l-2 border-[--orange] bg-[--orange-glow] text-foreground"
          : "hover:bg-sidebar-accent text-sidebar-foreground",
        isCollapsed ? "w-10 min-w-10 h-10 justify-center p-2" : "w-full h-10 px-3 py-2"
      )}
      style={{ transitionTimingFunction: softSpringEasing }}
      onClick={item.hasDropdown ? onToggle : undefined}
      title={isCollapsed ? item.label : undefined}
    >
      <div className="flex items-center justify-center shrink-0">{item.icon}</div>

      <div
        className={cn(
          "flex-1 relative transition-opacity duration-500 overflow-hidden",
          isCollapsed ? "opacity-0 w-0" : "opacity-100 ml-3"
        )}
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        <div className="text-[14px] leading-[20px] truncate">{item.label}</div>
      </div>

      {item.badge && !isCollapsed && (
        <span
          className={cn(
            "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full text-xs font-bold text-white px-1.5",
            item.badgeColor || "bg-primary"
          )}
        >
          {item.badge}
        </span>
      )}

      {item.hasDropdown && !isCollapsed && (
        <div
          className="flex items-center justify-center shrink-0 ml-2"
          style={{ transitionTimingFunction: softSpringEasing }}
        >
          <ChevronDownIcon
            size={16}
            className={cn("transition-transform duration-300", isExpanded ? "rotate-180" : "rotate-0")}
            style={{ transitionTimingFunction: softSpringEasing }}
          />
        </div>
      )}
    </div>
  );

  if (item.href && !item.hasDropdown) {
    return (
      <Link href={item.href} prefetch={true} className="w-full">
        {content}
      </Link>
    );
  }

  return content;
}

function SubMenuItem({ item }: { item: MenuItemT }) {
  const content = (
    <div className="h-9 w-full rounded-lg cursor-pointer transition-colors hover:bg-sidebar-accent flex items-center px-3 py-1">
      {item.icon && <div className="mr-2">{item.icon}</div>}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-muted-foreground leading-[18px] truncate hover:text-sidebar-foreground">
          {item.label}
        </div>
      </div>
    </div>
  );

  if (item.href) {
    return (
      <Link href={item.href} prefetch={true} className="w-full pl-9 pr-1 py-[1px]">
        {content}
      </Link>
    );
  }

  return <div className="w-full pl-9 pr-1 py-[1px]">{content}</div>;
}

function MenuSection({
  section,
  expandedItems,
  onToggleExpanded,
  isCollapsed,
}: {
  section: MenuSectionT;
  expandedItems: Set<string>;
  onToggleExpanded: (itemKey: string) => void;
  isCollapsed?: boolean;
}) {
  return (
    <div className="flex flex-col w-full">
      <div
        className={cn(
          "relative shrink-0 w-full transition-all duration-500 overflow-hidden",
          isCollapsed ? "h-0 opacity-0" : "h-8 opacity-100"
        )}
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        <div className="flex items-center h-8 px-3">
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {section.title}
          </div>
        </div>
      </div>

      {section.items.map((item, index) => {
        const itemKey = `${section.title}-${index}`;
        const isExpanded = expandedItems.has(itemKey);
        return (
          <div key={itemKey} className="w-full flex flex-col">
            <MenuItem
              item={item}
              isExpanded={isExpanded}
              onToggle={() => onToggleExpanded(itemKey)}
              isCollapsed={isCollapsed}
            />
            {isExpanded && item.children && !isCollapsed && (
              <div className="flex flex-col gap-0.5 mb-2 mt-1">
                {item.children.map((child, childIndex) => (
                  <SubMenuItem key={`${itemKey}-${childIndex}`} item={child} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- Layout -------------------------------- */

export function TwoLevelSidebar({ children }: { children: React.ReactNode }) {
  const currentUser = useDashboardUser();
  const pathname = usePathname();
  const isImmersiveDiffPage = pathname.startsWith("/dashboard/diff/");
  const homePath = getRoleHomePath(currentUser.role);
  const [activeSection, setActiveSection] = useState(() => {
    // Determine initial section based on pathname
    if (pathname.startsWith("/dashboard/admin")) return "admin";
    if (pathname.startsWith("/dashboard/lead") || pathname.startsWith("/dashboard/reviewer")) return "reviews";
    if (pathname.startsWith("/dashboard/organization") || pathname.startsWith("/dashboard/teams")) return "workspace";
    if (pathname.startsWith("/dashboard/analyses")) return "analyses";
    if (pathname.startsWith("/dashboard/editor")) return "editor";
    if (pathname.startsWith("/dashboard/pulls")) return "pulls";
    if (pathname.startsWith("/dashboard/review-status")) return "review-status";
    if (pathname.startsWith("/dashboard/observability")) return "observability";
    if (pathname.startsWith("/dashboard/jira")) return "jira";
    if (pathname.startsWith("/dashboard/statistics") || pathname.startsWith("/dashboard/insights")) return "dashboard";
    return "dashboard";
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);

  const isAdmin = currentUser.role === "admin";
  const isReviewerRole = isReviewer(currentUser.role);
  const isReviewerLeadRole = isReviewerLead(currentUser.role);

  // Mock data for badges
  const pendingReviewsCount = 5;
  const overdueCount = 1;

  // Close mobile menus on route change
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsMobileDetailOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menus are open
  React.useEffect(() => {
    if (isMobileMenuOpen || isMobileDetailOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen, isMobileDetailOpen]);

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    // On mobile, close icon nav and open detail sidebar
    setIsMobileMenuOpen(false);
    setIsMobileDetailOpen(true);
  };

  const handleBackToIconNav = () => {
    setIsMobileDetailOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Mobile Menu Overlay */}
      {(isMobileMenuOpen || isMobileDetailOpen) && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => {
            setIsMobileMenuOpen(false);
            setIsMobileDetailOpen(false);
          }}
        />
      )}

      {/* Desktop: Fixed left sidebars | Mobile: Slide-in overlays */}
      
      {/* Icon Navigation */}
      <div className={cn(
        // Mobile: fixed overlay, slide from left
        "fixed left-0 top-0 z-50 h-screen w-16 bg-[--bg-card] border-r border-[--border-default] transition-transform duration-300",
        // Desktop: static in flex layout
        "md:relative md:z-auto md:flex-shrink-0",
        // Mobile visibility
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <IconNavigation
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          isAdmin={isAdmin}
          isReviewerRole={isReviewerRole}
        />
      </div>

      {/* Detail Sidebar */}
      <div className={cn(
        // Mobile: fixed overlay, slide from left (positioned after icon nav)
        "fixed left-16 top-0 z-50 h-screen w-64 bg-[--bg-card] border-r border-[--border-default] transition-transform duration-300",
        // Desktop: static in flex layout
        "md:relative md:left-0 md:z-auto md:flex-shrink-0",
        // Mobile visibility
        isMobileDetailOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <DetailSidebar
          activeSection={activeSection}
          homePath={homePath}
          isAdmin={isAdmin}
          isReviewerRole={isReviewerRole}
          isReviewerLeadRole={isReviewerLeadRole}
          pendingReviewsCount={pendingReviewsCount}
          overdueCount={overdueCount}
          currentUser={currentUser}
          isMobile={!isMobileDetailOpen}
          onBack={handleBackToIconNav}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[--border-default] bg-[--bg-nav] backdrop-blur-md px-4 md:hidden">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground"
            aria-label="Open menu"
          >
            <div className="w-5 h-5 flex flex-col justify-center">
              <span className="block h-0.5 w-full bg-current mb-1" />
              <span className="block h-0.5 w-full bg-current mb-1" />
              <span className="block h-0.5 w-full bg-current" />
            </div>
          </button>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <Theme variant="button" size="sm" />
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden md:flex sticky top-0 z-40 h-14 items-center justify-between border-b border-[--border-default] bg-[--bg-nav] backdrop-blur-md px-6">
          <div className="w-full max-w-md">
            {/* Additional search or breadcrumbs can go here */}
          </div>

          <div className="flex items-center gap-3">
            <Theme variant="button" size="sm" />
            <NotificationBell />
          </div>
        </header>

        {/* Main content */}
        <main
          className={cn(
            "flex-1 overflow-y-auto relative w-full",
            isImmersiveDiffPage
              ? "p-2 md:p-4 min-h-0 overflow-hidden"
              : "",
          )}
        >
          {/* Landing-style grid background */}
          {!isImmersiveDiffPage && (
            <div className="pointer-events-none absolute inset-0 opacity-[0.15] [background-image:linear-gradient(rgba(73,82,127,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(73,82,127,0.14)_1px,transparent_1px)] [background-size:24px_24px]" />
          )}
          <div className={cn(
            "relative",
            isImmersiveDiffPage ? "h-full" : "mx-auto max-w-[1200px] p-4 md:p-8 animate-fade-in-up"
          )}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default TwoLevelSidebar;
