"use client";

/**
 * Models Hub Page
 * 
 * Central dashboard for LLM provider and model management.
 * Features:
 * - Provider status (Ollama, Anthropic, OpenAI, Azure)
 * - Model list with specs (context window, cost, streaming support)
 * - Live health checks
 * - Cost estimates and recommendations
 * - Usage statistics per provider
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Activity, 
  AlertCircle, 
  CheckCircle2, 
  DollarSign, 
  Zap,
  Server,
  TrendingUp,
  Cpu,
  Cloud
} from "lucide-react";

interface ModelInfo {
  name: string;
  display_name: string;
  max_context: number;
  max_output: number;
  cost_per_input: number;
  cost_per_output: number;
  supports_streaming: boolean;
  supports_functions: boolean;
}

interface ProviderInfo {
  name: string;
  models: ModelInfo[];
}

interface ProvidersResponse {
  providers: ProviderInfo[];
}

interface ProviderStats {
  total_requests: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  error_rate: number;
}

export default function ModelsHubPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerStats, setProviderStats] = useState<Record<string, ProviderStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  useEffect(() => {
    fetchProviders();
    fetchProviderStats();
    
    // Refresh every 30s
    const interval = setInterval(() => {
      fetchProviders();
      fetchProviderStats();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchProviders = async () => {
    try {
      const response = await fetch("/api/dashboard/llm/providers");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data: ProvidersResponse = await response.json();
      setProviders(data.providers);
      if (!selectedProvider && data.providers.length > 0) {
        setSelectedProvider(data.providers[0].name);
      }
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch providers:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  const fetchProviderStats = async () => {
    try {
      const response = await fetch("/api/dashboard/llm/metrics/summary");
      if (!response.ok) return;
      
      const data = await response.json();
      
      // Group stats by provider
      const stats: Record<string, ProviderStats> = {};
      for (const item of data.by_provider || []) {
        stats[item.provider] = {
          total_requests: item.total_requests,
          total_cost_usd: item.total_cost_cents / 100,
          avg_latency_ms: item.avg_latency_ms,
          error_rate: item.error_rate,
        };
      }
      setProviderStats(stats);
    } catch (err) {
      console.error("Failed to fetch provider stats:", err);
    }
  };

  const getProviderIcon = (name: string) => {
    if (name === "ollama") return <Server className="h-5 w-5" />;
    if (name === "anthropic") return <Cloud className="h-5 w-5" />;
    if (name === "openai") return <Cloud className="h-5 w-5" />;
    if (name === "azure") return <Cloud className="h-5 w-5" />;
    return <Cpu className="h-5 w-5" />;
  };

  const getProviderStatus = (name: string): "online" | "offline" | "degraded" => {
    const stats = providerStats[name];
    if (!stats) return "offline";
    if (stats.error_rate > 0.1) return "degraded"; // >10% error rate
    return "online";
  };

  const formatCost = (costPerToken: number, perMillion = true) => {
    if (costPerToken === 0) return "Free";
    const cost = perMillion ? costPerToken * 1_000_000 : costPerToken;
    return `$${cost.toFixed(2)}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              Failed to Load Providers
            </CardTitle>
            <CardDescription className="text-red-600">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const selectedProviderData = providers.find(p => p.name === selectedProvider);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Models Hub</h1>
        <p className="text-muted-foreground">
          Manage LLM providers, models, and monitor usage across your organization
        </p>
      </div>

      {/* Provider Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {providers.map((provider) => {
          const status = getProviderStatus(provider.name);
          const stats = providerStats[provider.name];

          return (
            <Card 
              key={provider.name}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedProvider === provider.name ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => setSelectedProvider(provider.name)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getProviderIcon(provider.name)}
                    <CardTitle className="text-lg capitalize">{provider.name}</CardTitle>
                  </div>
                  <Badge 
                    variant={status === "online" ? "default" : status === "degraded" ? "secondary" : "destructive"}
                    className="gap-1"
                  >
                    {status === "online" && <CheckCircle2 className="h-3 w-3" />}
                    {status === "degraded" && <AlertCircle className="h-3 w-3" />}
                    {status === "offline" && <AlertCircle className="h-3 w-3" />}
                    {status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Models</span>
                    <span className="font-medium">{provider.models.length}</span>
                  </div>
                  {stats && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Requests</span>
                        <span className="font-medium">{formatNumber(stats.total_requests)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Cost</span>
                        <span className="font-medium">${stats.total_cost_usd.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Latency</span>
                        <span className="font-medium">{stats.avg_latency_ms.toFixed(0)}ms</span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Provider Details */}
      {selectedProviderData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="capitalize">{selectedProviderData.name} Models</CardTitle>
                <CardDescription>
                  Available models and their specifications
                </CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <Activity className="h-4 w-4 mr-2" />
                View Metrics
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {selectedProviderData.models.map((model) => (
                <Card key={model.name} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{model.display_name}</CardTitle>
                        <CardDescription className="text-xs">{model.name}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {model.supports_streaming && (
                          <Badge variant="outline" className="gap-1">
                            <Zap className="h-3 w-3" />
                            Streaming
                          </Badge>
                        )}
                        {model.cost_per_input === 0 && (
                          <Badge variant="secondary" className="gap-1">
                            Free
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground mb-1">Context Window</div>
                        <div className="font-medium">{formatNumber(model.max_context)} tokens</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Max Output</div>
                        <div className="font-medium">{formatNumber(model.max_output)} tokens</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Input Cost</div>
                        <div className="font-medium">{formatCost(model.cost_per_input)}/M</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Output Cost</div>
                        <div className="font-medium">{formatCost(model.cost_per_output)}/M</div>
                      </div>
                    </div>
                    
                    {/* Cost Calculator */}
                    <div className="mt-4 p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Est. cost for 1K requests (500 tokens each):</span>
                        <span className="font-semibold text-base">
                          {model.cost_per_input === 0 
                            ? "Free" 
                            : `$${((model.cost_per_input + model.cost_per_output) * 500 * 1000).toFixed(2)}`
                          }
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Cost Optimization Recommendations
          </CardTitle>
          <CardDescription>
            Suggestions to reduce LLM costs while maintaining quality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <div className="font-medium text-green-900">Use Ollama for CONFIDENTIAL data</div>
              <div className="text-sm text-green-700">100% free, runs locally, zero API costs</div>
            </div>
          </div>
          
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <DollarSign className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <div className="font-medium text-blue-900">Enable prompt caching</div>
              <div className="text-sm text-blue-700">~30% cache hit rate saves $0.02-0.10 per cached request</div>
            </div>
          </div>
          
          <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
            <Zap className="h-5 w-5 text-purple-600 mt-0.5" />
            <div>
              <div className="font-medium text-purple-900">Use GPT-4o-mini for simple tasks</div>
              <div className="text-sm text-purple-700">20x cheaper than GPT-4, good for low-complexity analysis</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
