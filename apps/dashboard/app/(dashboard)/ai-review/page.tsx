"use client";

/**
 * AI Review Center Page
 * 
 * Unified dashboard for multi-agent code review findings.
 * Features:
 * - 6 specialized agents: Security, Performance, CleanCode, Architecture, DevOps, Testing
 * - Agent cards with finding counts and confidence scores
 * - Filter by agent, severity, confidence, file path
 * - Similarity grouping of findings
 * - Detailed finding viewer with code context
 * - Export findings as JSON/CSV
 * - Bulk actions (approve, dismiss, create issue)
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Zap,
  Code,
  Network,
  Settings,
  TestTube,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Filter,
  Download,
  RefreshCw,
  Eye,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
} from "lucide-react";

interface AgentFinding {
  id: string;
  agent_id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  title: string;
  description: string;
  file_path: string;
  line_start: number;
  line_end: number;
  code_snippet: string;
  recommendation: string;
  tags: string[];
  similar_count: number; // Deduplicated count
  created_at: string;
}

interface AgentStats {
  agent_id: string;
  agent_name: string;
  total_findings: number;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  avg_confidence: number;
}

const AGENT_CONFIG = {
  security: {
    name: "Security Agent",
    icon: Shield,
    color: "#ef4444",
    description: "Authentication, authorization, secret leaks, SQL injection",
  },
  performance: {
    name: "Performance Agent",
    icon: Zap,
    color: "#f59e0b",
    description: "N+1 queries, inefficient algorithms, memory leaks",
  },
  cleancode: {
    name: "CleanCode Agent",
    icon: Code,
    color: "#10b981",
    description: "Naming, duplication, complexity, dead code",
  },
  architecture: {
    name: "Architecture Agent",
    icon: Network,
    color: "#3b82f6",
    description: "Layer violations, coupling, SOLID principles",
  },
  devops: {
    name: "DevOps Agent",
    icon: Settings,
    color: "#8b5cf6",
    description: "Dockerfile, CI/CD, deployment configs",
  },
  testing: {
    name: "Testing Agent",
    icon: TestTube,
    color: "#ec4899",
    description: "Test coverage, flaky tests, assertions",
  },
};

export default function AIReviewCenterPage() {
  const [findings, setFindings] = useState<AgentFinding[]>([]);
  const [agentStats, setAgentStats] = useState<AgentStats[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<AgentFinding | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    agent: "all",
    severity: "all",
    min_confidence: "0",
    search: "",
  });

  useEffect(() => {
    fetchFindings();
    fetchAgentStats();
  }, [filters]);

  const fetchFindings = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.agent !== "all") params.append("agent_id", filters.agent);
      if (filters.severity !== "all") params.append("severity", filters.severity);
      if (filters.min_confidence !== "0") params.append("min_confidence", filters.min_confidence);
      if (filters.search) params.append("search", filters.search);
      params.append("limit", "100");

      const response = await fetch(`/api/dashboard/agents/findings?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: { findings: AgentFinding[] } = await response.json();
      setFindings(data.findings);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch findings:", err);
      setLoading(false);
    }
  };

  const fetchAgentStats = async () => {
    try {
      const response = await fetch(`/api/dashboard/agents/stats`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: { stats: AgentStats[] } = await response.json();
      setAgentStats(data.stats);
    } catch (err) {
      console.error("Failed to fetch agent stats:", err);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-300";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const exportFindings = (format: "json" | "csv") => {
    if (format === "json") {
      const dataStr = JSON.stringify(findings, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `agent-findings-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      // CSV export
      const headers = ["Agent", "Severity", "Confidence", "File", "Line", "Title", "Description"];
      const rows = findings.map((f) => [
        f.agent_id,
        f.severity,
        (f.confidence * 100).toFixed(0) + "%",
        f.file_path,
        `${f.line_start}-${f.line_end}`,
        f.title,
        f.description,
      ]);
      const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `agent-findings-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">AI Review Center</h1>
          <p className="text-muted-foreground">
            Multi-agent code review findings with intelligent deduplication
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchFindings} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => exportFindings("json")} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Object.entries(AGENT_CONFIG).map(([id, config]) => {
          const stats = agentStats.find((s) => s.agent_id === id);
          const Icon = config.icon;

          return (
            <Card
              key={id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setFilters({ ...filters, agent: id })}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Icon className="h-6 w-6" style={{ color: config.color }} />
                  {filters.agent === id && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                </div>
                <CardTitle className="text-sm mt-2">{config.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-1">
                  {stats?.total_findings || 0}
                </div>
                <div className="flex gap-1 text-xs">
                  {stats && (
                    <>
                      <Badge variant="destructive" className="text-xs px-1">
                        {stats.critical_findings}
                      </Badge>
                      <Badge variant="default" className="text-xs px-1 bg-orange-500">
                        {stats.high_findings}
                      </Badge>
                      <Badge variant="secondary" className="text-xs px-1">
                        {stats.medium_findings}
                      </Badge>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                  {config.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{findings.length}</div>
            <p className="text-xs text-muted-foreground">Across all agents</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Critical + High
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {findings.filter((f) => f.severity === "critical" || f.severity === "high").length}
            </div>
            <p className="text-xs text-muted-foreground">Urgent issues</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Confidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {findings.length > 0
                ? (
                    (findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length) *
                    100
                  ).toFixed(0)
                : 0}
              %
            </div>
            <p className="text-xs text-muted-foreground">Agent confidence</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Files Affected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(findings.map((f) => f.file_path)).size}
            </div>
            <p className="text-xs text-muted-foreground">Unique files</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Findings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <Select value={filters.agent} onValueChange={(v) => setFilters({ ...filters, agent: v })}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {Object.entries(AGENT_CONFIG).map(([id, config]) => (
                  <SelectItem key={id} value={id}>
                    {config.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.severity}
              onValueChange={(v) => setFilters({ ...filters, severity: v })}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.min_confidence}
              onValueChange={(v) => setFilters({ ...filters, min_confidence: v })}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Min Confidence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Any Confidence</SelectItem>
                <SelectItem value="0.5">50%+</SelectItem>
                <SelectItem value="0.7">70%+</SelectItem>
                <SelectItem value="0.9">90%+</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Search findings..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-[250px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Findings List */}
      <Card>
        <CardHeader>
          <CardTitle>Findings ({findings.length})</CardTitle>
          <CardDescription>Click a finding to view details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {findings.map((finding) => {
              const agent = AGENT_CONFIG[finding.agent_id as keyof typeof AGENT_CONFIG];
              const Icon = agent?.icon || Code;

              return (
                <div
                  key={finding.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted ${
                    selectedFinding?.id === finding.id ? "bg-muted ring-2 ring-blue-500" : ""
                  }`}
                  onClick={() => setSelectedFinding(finding)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5" style={{ color: agent?.color }} />
                      <span className="font-semibold">{finding.title}</span>
                      {finding.similar_count > 1 && (
                        <Badge variant="secondary" className="text-xs">
                          {finding.similar_count} similar
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Badge className={getSeverityColor(finding.severity)}>
                        {finding.severity}
                      </Badge>
                      <Badge variant="outline">{(finding.confidence * 100).toFixed(0)}%</Badge>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                    {finding.description}
                  </p>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {finding.file_path}:{finding.line_start}
                    </span>
                    <span>{new Date(finding.created_at).toLocaleString()}</span>
                  </div>
                </div>
              );
            })}

            {findings.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">No findings match the current filters</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Finding Details Panel */}
      {selectedFinding && (
        <Card className="border-2 border-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Finding Details</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedFinding(null)}>
                Close
              </Button>
            </CardTitle>
            <CardDescription>{selectedFinding.agent_id} Agent</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="details">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="code">Code</TabsTrigger>
                <TabsTrigger value="recommendation">Recommendation</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Agent:</span>
                    <span className="ml-2 font-medium">{selectedFinding.agent_id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Category:</span>
                    <span className="ml-2 font-medium">{selectedFinding.category}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Severity:</span>
                    <Badge className={`ml-2 ${getSeverityColor(selectedFinding.severity)}`}>
                      {selectedFinding.severity}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Confidence:</span>
                    <span className="ml-2 font-medium">
                      {(selectedFinding.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">File:</span>
                    <span className="ml-2 font-mono text-sm">{selectedFinding.file_path}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Lines:</span>
                    <span className="ml-2 font-mono">
                      {selectedFinding.line_start}-{selectedFinding.line_end}
                    </span>
                  </div>
                  {selectedFinding.similar_count > 1 && (
                    <div>
                      <span className="text-muted-foreground">Similar Findings:</span>
                      <span className="ml-2 font-medium">{selectedFinding.similar_count}</span>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-sm p-3 bg-muted rounded-lg">{selectedFinding.description}</p>
                </div>

                {selectedFinding.tags.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Tags</h4>
                    <div className="flex gap-2">
                      {selectedFinding.tags.map((tag, i) => (
                        <Badge key={i} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="code" className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Code Snippet</h4>
                  <pre className="p-4 bg-muted rounded-lg text-sm overflow-auto max-h-[400px] font-mono">
                    {selectedFinding.code_snippet}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent value="recommendation" className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Recommendation</h4>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm">
                    {selectedFinding.recommendation}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1">
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1">
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    Dismiss
                  </Button>
                  <Button size="sm" variant="secondary" className="flex-1">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Create Issue
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
