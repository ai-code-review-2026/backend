"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  GripVertical,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  User,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Types
interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  status: string;
  assignee: string | null;
  priority: string;
  issue_type: string;
  url: string;
  created: string;
  updated: string;
  finding_id?: string;
}

interface KanbanColumn {
  id: string;
  title: string;
  status: string[];
  color: string;
  bgGradient: string;
  icon: React.ReactNode;
}

// Column definitions
const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: "todo",
    title: "To Do",
    status: ["To Do", "Open", "Backlog", "New"],
    color: "text-blue-400",
    bgGradient: "from-blue-500/20 to-blue-600/10",
    icon: <Clock className="h-4 w-4" />,
  },
  {
    id: "in-progress",
    title: "In Progress",
    status: ["In Progress", "In Review", "Development"],
    color: "text-amber-400",
    bgGradient: "from-amber-500/20 to-amber-600/10",
    icon: <Zap className="h-4 w-4" />,
  },
  {
    id: "review",
    title: "Code Review",
    status: ["Code Review", "Review", "Testing", "QA"],
    color: "text-purple-400",
    bgGradient: "from-purple-500/20 to-purple-600/10",
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    id: "done",
    title: "Done",
    status: ["Done", "Closed", "Resolved", "Complete"],
    color: "text-emerald-400",
    bgGradient: "from-emerald-500/20 to-emerald-600/10",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
];

// Priority colors
const PRIORITY_COLORS: Record<string, string> = {
  Highest: "bg-red-500/20 text-red-400 border-red-500/30",
  High: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Lowest: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// Issue type icons
const ISSUE_TYPE_ICONS: Record<string, React.ReactNode> = {
  Bug: <Bug className="h-3.5 w-3.5 text-red-400" />,
  Task: <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />,
  Story: <Tag className="h-3.5 w-3.5 text-green-400" />,
  Epic: <Zap className="h-3.5 w-3.5 text-purple-400" />,
};

interface JiraKanbanProps {
  projectKey?: string;
  className?: string;
}

export function JiraKanban({ projectKey, className }: JiraKanbanProps) {
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  // Check if Jira is configured
  useEffect(() => {
    checkJiraConfig();
  }, []);

  const checkJiraConfig = async () => {
    try {
      const response = await fetch("/api/dashboard/jira/config");
      if (response.ok) {
        const data = await response.json();
        setConfigured(data.configured);
        if (data.configured) {
          loadIssues();
        } else {
          setIsLoading(false);
        }
      }
    } catch (err) {
      console.error("Failed to check Jira config:", err);
      setConfigured(false);
      setIsLoading(false);
    }
  };

  const loadIssues = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      // Fetch issues from Jira API
      const response = await fetch(
        `/api/dashboard/jira/issues${projectKey ? `?project=${projectKey}` : ""}`
      );

      if (!response.ok) {
        throw new Error("Failed to load Jira issues");
      }

      const data = await response.json();
      setIssues(Array.isArray(data) ? data : data.issues || []);
    } catch (err) {
      console.error("Failed to load issues:", err);
      setError(err instanceof Error ? err.message : "Failed to load issues");
      // Use mock data for demo
      setIssues(getMockIssues());
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [projectKey]);

  // Get unique assignees
  const assignees = useMemo(() => {
    const unique = new Set<string>();
    issues.forEach((issue) => {
      if (issue.assignee) {
        unique.add(issue.assignee);
      }
    });
    return Array.from(unique);
  }, [issues]);

  // Filter issues
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !issue.key.toLowerCase().includes(query) &&
          !issue.summary.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      // Priority filter
      if (filterPriority !== "all" && issue.priority !== filterPriority) {
        return false;
      }

      // Assignee filter
      if (filterAssignee !== "all") {
        if (filterAssignee === "unassigned" && issue.assignee) {
          return false;
        }
        if (filterAssignee !== "unassigned" && issue.assignee !== filterAssignee) {
          return false;
        }
      }

      return true;
    });
  }, [issues, searchQuery, filterPriority, filterAssignee]);

  // Group issues by column
  const issuesByColumn = useMemo(() => {
    const grouped: Record<string, JiraIssue[]> = {};

    KANBAN_COLUMNS.forEach((column) => {
      grouped[column.id] = filteredIssues.filter((issue) =>
        column.status.some(
          (status) => issue.status.toLowerCase() === status.toLowerCase()
        )
      );
    });

    // Put unmatched issues in "To Do"
    const matchedKeys = new Set(
      Object.values(grouped).flat().map((i) => i.key)
    );
    const unmatched = filteredIssues.filter((i) => !matchedKeys.has(i.key));
    grouped["todo"] = [...(grouped["todo"] || []), ...unmatched];

    return grouped;
  }, [filteredIssues]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: filteredIssues.length,
      todo: issuesByColumn["todo"]?.length || 0,
      inProgress: issuesByColumn["in-progress"]?.length || 0,
      review: issuesByColumn["review"]?.length || 0,
      done: issuesByColumn["done"]?.length || 0,
    };
  }, [filteredIssues, issuesByColumn]);

  if (configured === null || isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
      </div>
    );
  }

  if (!configured) {
    return (
      <Card className="border-orange-200/20 bg-black/40 backdrop-blur-md">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-12 w-12 text-orange-400 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">
            Jira Not Configured
          </h3>
          <p className="text-gray-400 text-center max-w-md mb-6">
            To use the Kanban board, please configure your Jira integration in
            the settings.
          </p>
          <Button
            variant="outline"
            className="border-orange-400/30 text-orange-400 hover:bg-orange-400/10"
            onClick={() => window.location.href = "/dashboard/admin/integrations"}
          >
            Configure Jira
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            Jira Kanban Board
          </h2>
          <p className="text-gray-400 mt-1">
            Track and manage your code review issues
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadIssues}
            disabled={isRefreshing}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-5 gap-4"
      >
        {[
          { label: "Total", value: stats.total, color: "from-gray-500 to-gray-600" },
          { label: "To Do", value: stats.todo, color: "from-blue-500 to-blue-600" },
          { label: "In Progress", value: stats.inProgress, color: "from-amber-500 to-amber-600" },
          { label: "Review", value: stats.review, color: "from-purple-500 to-purple-600" },
          { label: "Done", value: stats.done, color: "from-emerald-500 to-emerald-600" },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + index * 0.05 }}
            whileHover={{ scale: 1.02 }}
          >
            <Card className="border-gray-800 bg-gray-900/50 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">{stat.label}</span>
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full bg-gradient-to-r",
                      stat.color
                    )}
                  />
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {stat.value}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col md:flex-row gap-4"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search issues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-gray-900/50 border-gray-700 text-white placeholder-gray-500"
          />
        </div>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[160px] bg-gray-900/50 border-gray-700 text-white">
            <Filter className="h-4 w-4 mr-2 text-gray-400" />
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-700">
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="Highest">Highest</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
            <SelectItem value="Lowest">Lowest</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="w-[180px] bg-gray-900/50 border-gray-700 text-white">
            <User className="h-4 w-4 mr-2 text-gray-400" />
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-700">
            <SelectItem value="all">All Assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {assignees.map((assignee) => (
              <SelectItem key={assignee} value={assignee}>
                {assignee}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
        >
          <div className="flex items-center gap-3 text-amber-400">
            <AlertCircle className="h-5 w-5" />
            <span>{error} - Showing demo data</span>
          </div>
        </motion.div>
      )}

      {/* Kanban Board */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-h-[500px]"
      >
        {KANBAN_COLUMNS.map((column, columnIndex) => (
          <motion.div
            key={column.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + columnIndex * 0.1 }}
            className="flex flex-col"
          >
            {/* Column Header */}
            <div
              className={cn(
                "rounded-t-xl p-4 bg-gradient-to-r",
                column.bgGradient
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={column.color}>{column.icon}</span>
                  <span className="font-semibold text-white">{column.title}</span>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-white/10 text-white border-white/20"
                >
                  {issuesByColumn[column.id]?.length || 0}
                </Badge>
              </div>
            </div>

            {/* Column Content */}
            <div className="flex-1 rounded-b-xl border border-t-0 border-gray-800 bg-gray-900/30 p-3 space-y-3 overflow-y-auto max-h-[600px]">
              <AnimatePresence mode="popLayout">
                {issuesByColumn[column.id]?.map((issue, issueIndex) => (
                  <IssueCard
                    key={issue.key}
                    issue={issue}
                    index={issueIndex}
                    onClick={() => setSelectedIssue(issue)}
                  />
                ))}
              </AnimatePresence>

              {issuesByColumn[column.id]?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                  <CheckCircle2 className="h-8 w-8 mb-2 opacity-50" />
                  <span className="text-sm">No issues</span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Issue Detail Modal */}
      <AnimatePresence>
        {selectedIssue && (
          <IssueDetailModal
            issue={selectedIssue}
            onClose={() => setSelectedIssue(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Issue Card Component
function IssueCard({
  issue,
  index,
  onClick,
}: {
  issue: JiraIssue;
  index: number;
  onClick: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.02, y: -2 }}
      onClick={onClick}
      className="group cursor-pointer"
    >
      <Card className="border-gray-700/50 bg-gray-800/50 hover:bg-gray-800/80 hover:border-gray-600 transition-all duration-200">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {ISSUE_TYPE_ICONS[issue.issue_type] || (
                <Tag className="h-3.5 w-3.5 text-gray-400" />
              )}
              <span className="text-xs font-mono text-gray-400">{issue.key}</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-gray-900 border-gray-700"
              >
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(issue.url, "_blank");
                  }}
                  className="text-gray-300 hover:bg-gray-800"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in Jira
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Summary */}
          <h4 className="text-sm font-medium text-white line-clamp-2 mb-3">
            {issue.summary}
          </h4>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                PRIORITY_COLORS[issue.priority] || PRIORITY_COLORS["Medium"]
              )}
            >
              {issue.priority}
            </Badge>

            {issue.assignee ? (
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <span className="text-[10px] font-medium text-white">
                    {issue.assignee.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-xs text-gray-500">Unassigned</span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Issue Detail Modal Component
function IssueDetailModal({
  issue,
  onClose,
}: {
  issue: JiraIssue;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl z-50"
      >
        <Card className="border-gray-700 bg-gray-900 shadow-2xl">
          <CardHeader className="border-b border-gray-800">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {ISSUE_TYPE_ICONS[issue.issue_type] || (
                  <Tag className="h-5 w-5 text-gray-400" />
                )}
                <div>
                  <span className="text-sm font-mono text-gray-400">
                    {issue.key}
                  </span>
                  <CardTitle className="text-white mt-1">{issue.summary}</CardTitle>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-gray-400 hover:text-white"
              >
                &times;
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Meta Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-xs text-gray-500 uppercase">Status</span>
                <div className="mt-1">
                  <Badge variant="outline" className="border-gray-600 text-gray-300">
                    {issue.status}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase">Priority</span>
                <div className="mt-1">
                  <Badge
                    variant="outline"
                    className={PRIORITY_COLORS[issue.priority] || PRIORITY_COLORS["Medium"]}
                  >
                    {issue.priority}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase">Type</span>
                <div className="mt-1 flex items-center gap-2">
                  {ISSUE_TYPE_ICONS[issue.issue_type]}
                  <span className="text-sm text-gray-300">{issue.issue_type}</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase">Assignee</span>
                <div className="mt-1 text-sm text-gray-300">
                  {issue.assignee || "Unassigned"}
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <span className="text-xs text-gray-500 uppercase">Description</span>
              <div className="mt-2 p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <p className="text-sm text-gray-300 whitespace-pre-wrap">
                  {issue.description || "No description provided."}
                </p>
              </div>
            </div>

            {/* Timestamps */}
            <div className="flex items-center gap-6 text-xs text-gray-500">
              <div>
                <span className="mr-1">Created:</span>
                {new Date(issue.created).toLocaleDateString()}
              </div>
              <div>
                <span className="mr-1">Updated:</span>
                {new Date(issue.updated).toLocaleDateString()}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
              <Button
                variant="outline"
                onClick={onClose}
                className="border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                Close
              </Button>
              <Button
                onClick={() => window.open(issue.url, "_blank")}
                className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in Jira
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}

// Mock data for demo/fallback
function getMockIssues(): JiraIssue[] {
  return [
    {
      key: "PROJ-101",
      summary: "Fix SQL injection vulnerability in login form",
      description: "Critical security issue detected by code review.",
      status: "In Progress",
      assignee: "John Doe",
      priority: "Highest",
      issue_type: "Bug",
      url: "#",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      key: "PROJ-102",
      summary: "Refactor authentication middleware",
      description: "Improve code quality and add proper error handling.",
      status: "To Do",
      assignee: null,
      priority: "High",
      issue_type: "Task",
      url: "#",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      key: "PROJ-103",
      summary: "Add unit tests for user service",
      description: "Code coverage below threshold.",
      status: "Code Review",
      assignee: "Jane Smith",
      priority: "Medium",
      issue_type: "Task",
      url: "#",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      key: "PROJ-104",
      summary: "Update dependencies to fix security alerts",
      description: "Multiple npm packages have known vulnerabilities.",
      status: "Done",
      assignee: "John Doe",
      priority: "High",
      issue_type: "Bug",
      url: "#",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      key: "PROJ-105",
      summary: "Implement rate limiting for API endpoints",
      description: "Prevent abuse and DDoS attacks.",
      status: "To Do",
      assignee: "Jane Smith",
      priority: "Medium",
      issue_type: "Story",
      url: "#",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    {
      key: "PROJ-106",
      summary: "Memory leak in WebSocket handler",
      description: "Connections not being properly cleaned up.",
      status: "In Progress",
      assignee: null,
      priority: "High",
      issue_type: "Bug",
      url: "#",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  ];
}

export default JiraKanban;
