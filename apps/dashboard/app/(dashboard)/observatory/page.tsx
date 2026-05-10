"use client";

/**
 * Prompt Observatory Page
 * 
 * Real-time trace viewer and metrics dashboard for LLM requests.
 * Features:
 * - Live trace list with filters (user, project, provider, error status)
 * - Detailed trace viewer with prompt/response/context
 * - RAGAS metrics (faithfulness, relevancy, context precision)
 * - Cost and latency charts (Recharts)
 * - Token usage breakdown
 * - Fallback chain visualization
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
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Search,
  TrendingUp,
  Zap,
  Eye,
  RefreshCw,
} from "lucide-react";

interface LLMTrace {
  trace_id: string;
  user_id: string | null;
  project_id: string | null;
  analysis_id: string | null;
  provider: string;
  model: string;
  prompt: string;
  response: string;
  system_prompt: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  duration_ms: number;
  cost_cents: number;
  error: string | null;
  fallback_used: boolean;
  fallback_provider: string | null;
  priority: string;
  sensitivity: string;
  cost_target: string;
  routing_reason: string;
  hallucination_score: number | null;
  relevance_score: number | null;
  faithfulness_score: number | null;
  created_at: string;
}

interface TracesResponse {
  traces: LLMTrace[];
  total: number;
}

const COLORS = {
  ollama: "#10b981",
  anthropic: "#8b5cf6",
  openai: "#3b82f6",
  azure: "#06b6d4",
};

export default function PromptObservatoryPage() {
  const [traces, setTraces] = useState<LLMTrace[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<LLMTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    provider: "all",
    has_error: "all",
    user_id: "",
    project_id: "",
  });

  useEffect(() => {
    fetchTraces();
    
    // Auto-refresh every 10s
    const interval = setInterval(fetchTraces, 10000);
    return () => clearInterval(interval);
  }, [filters]);

  const fetchTraces = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.provider !== "all") params.append("provider", filters.provider);
      if (filters.has_error !== "all") params.append("has_error", filters.has_error);
      if (filters.user_id) params.append("user_id", filters.user_id);
      if (filters.project_id) params.append("project_id", filters.project_id);
      params.append("limit", "50");

      const response = await fetch(`/api/dashboard/llm/traces?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: TracesResponse = await response.json();
      setTraces(data.traces);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch traces:", err);
      setLoading(false);
    }
  };

  // Aggregate metrics for charts
  const costByProvider = Object.entries(
    traces.reduce((acc, t) => {
      acc[t.provider] = (acc[t.provider] || 0) + t.cost_cents / 100;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const latencyByProvider = Object.entries(
    traces.reduce((acc, t) => {
      if (!acc[t.provider]) acc[t.provider] = { total: 0, count: 0 };
      acc[t.provider].total += t.duration_ms;
      acc[t.provider].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>)
  ).map(([name, data]) => ({
    name,
    avg_latency: Math.round(data.total / data.count),
  }));

  const tokensByType = {
    input: traces.reduce((sum, t) => sum + t.input_tokens, 0),
    output: traces.reduce((sum, t) => sum + t.output_tokens, 0),
  };

  const errorRate = traces.filter(t => t.error).length / traces.length;
  const fallbackRate = traces.filter(t => t.fallback_used).length / traces.length;
  const avgCost = traces.reduce((sum, t) => sum + t.cost_cents, 0) / traces.length / 100;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Prompt Observatory</h1>
          <p className="text-muted-foreground">
            Real-time LLM trace viewer and quality metrics
          </p>
        </div>
        <Button onClick={fetchTraces} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{traces.length}</div>
            <p className="text-xs text-muted-foreground">Last 50 traces</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${avgCost.toFixed(4)}</div>
            <p className="text-xs text-muted-foreground">Per request</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Error Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(errorRate * 100).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {traces.filter(t => t.error).length} failures
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Fallback Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(fallbackRate * 100).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {traces.filter(t => t.fallback_used).length} fallbacks
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cost by Provider */}
        <Card>
          <CardHeader>
            <CardTitle>Cost by Provider</CardTitle>
            <CardDescription>Total cost breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={costByProvider}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: $${value.toFixed(2)}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {costByProvider.map((entry) => (
                    <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS] || "#999"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Latency by Provider */}
        <Card>
          <CardHeader>
            <CardTitle>Avg Latency by Provider</CardTitle>
            <CardDescription>Response time comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={latencyByProvider}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis label={{ value: "ms", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                <Bar dataKey="avg_latency" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Traces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <Select value={filters.provider} onValueChange={(v) => setFilters({ ...filters, provider: v })}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                <SelectItem value="ollama">Ollama</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="azure">Azure</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.has_error} onValueChange={(v) => setFilters({ ...filters, has_error: v })}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="true">Errors Only</SelectItem>
                <SelectItem value="false">Success Only</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="User ID"
              value={filters.user_id}
              onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
              className="w-[180px]"
            />

            <Input
              placeholder="Project ID"
              value={filters.project_id}
              onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
              className="w-[180px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Trace List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Traces</CardTitle>
          <CardDescription>Click a trace to view details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {traces.map((trace) => (
              <div
                key={trace.trace_id}
                className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted ${
                  selectedTrace?.trace_id === trace.trace_id ? "bg-muted ring-2 ring-blue-500" : ""
                }`}
                onClick={() => setSelectedTrace(trace)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={trace.error ? "destructive" : "default"}>
                        {trace.provider}
                      </Badge>
                      <Badge variant="outline">{trace.model}</Badge>
                      {trace.fallback_used && (
                        <Badge variant="secondary">Fallback</Badge>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {new Date(trace.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-1">
                      {trace.prompt.substring(0, 150)}...
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-sm ml-4">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {trace.duration_ms}ms
                    </div>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      ${(trace.cost_cents / 100).toFixed(4)}
                    </div>
                    {trace.faithfulness_score !== null && (
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {(trace.faithfulness_score * 100).toFixed(0)}% faithful
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Trace Details Modal/Panel */}
      {selectedTrace && (
        <Card className="border-2 border-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Trace Details</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedTrace(null)}>
                Close
              </Button>
            </CardTitle>
            <CardDescription>Trace ID: {selectedTrace.trace_id}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="prompt">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                <TabsTrigger value="response">Response</TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
              </TabsList>

              <TabsContent value="prompt" className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">System Prompt</h4>
                  <pre className="p-4 bg-muted rounded-lg text-sm overflow-auto max-h-[200px]">
                    {selectedTrace.system_prompt || "No system prompt"}
                  </pre>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">User Prompt</h4>
                  <pre className="p-4 bg-muted rounded-lg text-sm overflow-auto max-h-[300px]">
                    {selectedTrace.prompt}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent value="response" className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Response</h4>
                  <pre className="p-4 bg-muted rounded-lg text-sm overflow-auto max-h-[400px]">
                    {selectedTrace.response}
                  </pre>
                </div>
                {selectedTrace.error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <h4 className="font-semibold text-red-900 mb-2">Error</h4>
                    <pre className="text-sm text-red-700">{selectedTrace.error}</pre>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="metrics" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Tokens</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Input:</span>
                          <span className="font-medium">{selectedTrace.input_tokens}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Output:</span>
                          <span className="font-medium">{selectedTrace.output_tokens}</span>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span>Total:</span>
                          <span>{selectedTrace.total_tokens}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Duration:</span>
                          <span className="font-medium">{selectedTrace.duration_ms}ms</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cost:</span>
                          <span className="font-medium">${(selectedTrace.cost_cents / 100).toFixed(4)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">RAGAS Quality Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedTrace.faithfulness_score !== null && (
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Faithfulness (no hallucinations)</span>
                              <span className="font-medium">
                                {(selectedTrace.faithfulness_score * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-green-500 h-2 rounded-full"
                                style={{ width: `${selectedTrace.faithfulness_score * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {selectedTrace.relevance_score !== null && (
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Answer Relevancy</span>
                              <span className="font-medium">
                                {(selectedTrace.relevance_score * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-500 h-2 rounded-full"
                                style={{ width: `${selectedTrace.relevance_score * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {selectedTrace.hallucination_score !== null && (
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Hallucination Risk</span>
                              <span className="font-medium">
                                {(selectedTrace.hallucination_score * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-red-500 h-2 rounded-full"
                                style={{ width: `${selectedTrace.hallucination_score * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="metadata" className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Provider:</span>
                    <span className="ml-2 font-medium">{selectedTrace.provider}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Model:</span>
                    <span className="ml-2 font-medium">{selectedTrace.model}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Priority:</span>
                    <span className="ml-2 font-medium">{selectedTrace.priority}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sensitivity:</span>
                    <span className="ml-2 font-medium">{selectedTrace.sensitivity}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cost Target:</span>
                    <span className="ml-2 font-medium">{selectedTrace.cost_target}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fallback Used:</span>
                    <span className="ml-2 font-medium">
                      {selectedTrace.fallback_used ? `Yes (${selectedTrace.fallback_provider})` : "No"}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Routing Reason:</span>
                    <p className="mt-1 p-3 bg-muted rounded-lg text-sm">
                      {selectedTrace.routing_reason || "N/A"}
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
