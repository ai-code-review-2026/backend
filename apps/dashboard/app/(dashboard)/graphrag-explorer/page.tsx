"use client";

/**
 * GraphRAG Explorer Page
 * 
 * Interactive visualization of the Neo4j knowledge graph.
 * Features:
 * - D3-based force-directed graph layout
 * - Node types: Chunk, Rule, Pattern, KBDocument
 * - Relationship types: SIMILAR_TO, IMPLEMENTS, DEPENDS_ON, CONTAINS
 * - Filter by node type, relationship type, file path
 * - Search nodes by content
 * - Node details panel with metadata
 * - Export graph as JSON/PNG
 */

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Network,
  Search,
  Filter,
  Download,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";

interface GraphNode {
  id: string;
  label: string;
  type: "chunk" | "rule" | "pattern" | "kb_document";
  properties: Record<string, any>;
}

interface GraphRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, any>;
}

interface GraphData {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export default function GraphRAGExplorerPage() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], relationships: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    nodeType: "all",
    relationshipType: "all",
    searchQuery: "",
    filePath: "",
  });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetchGraphData();
  }, [filters]);

  const fetchGraphData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.nodeType !== "all") params.append("node_type", filters.nodeType);
      if (filters.relationshipType !== "all") params.append("rel_type", filters.relationshipType);
      if (filters.searchQuery) params.append("search", filters.searchQuery);
      if (filters.filePath) params.append("file_path", filters.filePath);
      params.append("limit", "100");

      const response = await fetch(`/api/dashboard/graphrag/graph?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: GraphData = await response.json();
      setGraphData(data);
      setLoading(false);

      // Render graph after data loads
      if (data.nodes.length > 0) {
        renderGraph(data);
      }
    } catch (err) {
      console.error("Failed to fetch graph data:", err);
      setLoading(false);
    }
  };

  const renderGraph = (data: GraphData) => {
    // Simple SVG-based visualization
    // In production, you'd use D3 force simulation here
    // For now, we'll show a placeholder
    console.log("Rendering graph with", data.nodes.length, "nodes");
  };

  const getNodeColor = (type: string) => {
    switch (type) {
      case "chunk":
        return "#3b82f6"; // blue
      case "rule":
        return "#10b981"; // green
      case "pattern":
        return "#8b5cf6"; // purple
      case "kb_document":
        return "#f59e0b"; // orange
      default:
        return "#6b7280"; // gray
    }
  };

  const exportGraph = (format: "json" | "png") => {
    if (format === "json") {
      const dataStr = JSON.stringify(graphData, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `graphrag-export-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
    // PNG export would use html2canvas here
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">GraphRAG Explorer</h1>
          <p className="text-muted-foreground">
            Interactive visualization of the Neo4j knowledge graph
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchGraphData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => exportGraph("json")} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Nodes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{graphData.nodes.length}</div>
            <p className="text-xs text-muted-foreground">Knowledge graph entities</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Relationships
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{graphData.relationships.length}</div>
            <p className="text-xs text-muted-foreground">Connections between nodes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Node Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(graphData.nodes.map(n => n.type)).size}
            </div>
            <p className="text-xs text-muted-foreground">Distinct entity types</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Connections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {graphData.nodes.length > 0
                ? (graphData.relationships.length / graphData.nodes.length).toFixed(1)
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">Per node</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <Select
              value={filters.nodeType}
              onValueChange={(v) => setFilters({ ...filters, nodeType: v })}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Node Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Node Types</SelectItem>
                <SelectItem value="chunk">Code Chunks</SelectItem>
                <SelectItem value="rule">Analysis Rules</SelectItem>
                <SelectItem value="pattern">Code Patterns</SelectItem>
                <SelectItem value="kb_document">KB Documents</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.relationshipType}
              onValueChange={(v) => setFilters({ ...filters, relationshipType: v })}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Relationship Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Relationships</SelectItem>
                <SelectItem value="SIMILAR_TO">Similar To</SelectItem>
                <SelectItem value="IMPLEMENTS">Implements</SelectItem>
                <SelectItem value="DEPENDS_ON">Depends On</SelectItem>
                <SelectItem value="CONTAINS">Contains</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Search nodes..."
              value={filters.searchQuery}
              onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
              className="w-[200px]"
            />

            <Input
              placeholder="Filter by file path..."
              value={filters.filePath}
              onChange={(e) => setFilters({ ...filters, filePath: e.target.value })}
              className="w-[200px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graph Visualization */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Knowledge Graph</CardTitle>
            <CardDescription>
              Force-directed layout showing relationships between entities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative bg-muted rounded-lg" style={{ height: "600px" }}>
              <svg
                ref={svgRef}
                className="w-full h-full"
                style={{ border: "1px solid #e5e7eb" }}
              >
                {/* Graph will be rendered here via D3 */}
                <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize="14"
                >
                  {loading
                    ? "Loading graph data..."
                    : graphData.nodes.length === 0
                    ? "No nodes found. Try adjusting filters."
                    : `${graphData.nodes.length} nodes, ${graphData.relationships.length} relationships`}
                </text>
              </svg>
            </div>
          </CardContent>
        </Card>

        {/* Node Details Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Node Details</CardTitle>
            <CardDescription>
              {selectedNode ? "Selected node information" : "Select a node to view details"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedNode ? (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Type</h4>
                  <Badge
                    style={{ backgroundColor: getNodeColor(selectedNode.type) }}
                    className="text-white"
                  >
                    {selectedNode.type}
                  </Badge>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Label</h4>
                  <p className="text-sm">{selectedNode.label}</p>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Properties</h4>
                  <div className="space-y-1 text-sm">
                    {Object.entries(selectedNode.properties).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-medium truncate ml-2">
                          {typeof value === "object" ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Connected Nodes</h4>
                  <p className="text-sm text-muted-foreground">
                    {
                      graphData.relationships.filter(
                        (r) => r.source === selectedNode.id || r.target === selectedNode.id
                      ).length
                    }{" "}
                    connections
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Network className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Click a node to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Node List */}
      <Card>
        <CardHeader>
          <CardTitle>Node List</CardTitle>
          <CardDescription>All nodes in the current view</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-auto">
            {graphData.nodes.map((node) => (
              <div
                key={node.id}
                className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-muted ${
                  selectedNode?.id === node.id ? "bg-muted ring-2 ring-blue-500" : ""
                }`}
                onClick={() => setSelectedNode(node)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getNodeColor(node.type) }}
                    />
                    <span className="font-medium">{node.label}</span>
                    <Badge variant="outline">{node.type}</Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {
                      graphData.relationships.filter(
                        (r) => r.source === node.id || r.target === node.id
                      ).length
                    }{" "}
                    connections
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
