"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Loader2, ZoomIn, ZoomOut, Maximize2, Search, Info } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false })

interface GraphNode {
  id: string
  label: string
  type: string
  path: string | null
  size: number
}

interface GraphEdge {
  source: string
  target: string
  type: string
  weight: number
}

interface GraphData {
  repo_id: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  total_nodes: number
  total_edges: number
}

interface ForceGraphNode extends GraphNode {
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface ForceGraphLink {
  source: string | ForceGraphNode
  target: string | ForceGraphNode
  type: string
  weight: number
}

interface GraphVisualizationProps {
  repoId: string
  limit?: number
}

const NODE_COLORS: Record<string, string> = {
  file: "#3b82f6",
  function: "#10b981",
  class: "#f59e0b",
  module: "#8b5cf6",
  default: "#64748b",
}

const EDGE_COLORS: Record<string, string> = {
  imports: "#6366f1",
  calls: "#10b981",
  extends: "#f59e0b",
  references: "#64748b",
}

export function GraphVisualization({ repoId, limit = 100 }: GraphVisualizationProps) {
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [zoom, setZoom] = useState(1)
  const graphRef = useRef<any>(null)

  useEffect(() => {
    async function fetchGraph() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/dashboard/knowledge-base/${encodeURIComponent(repoId)}/graph?limit=${limit}`)
        if (!response.ok) {
          throw new Error(`Failed to load graph: ${response.statusText}`)
        }
        const graphData: GraphData = await response.json()
        setData(graphData)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    if (repoId) {
      fetchGraph()
    }
  }, [repoId, limit])

  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoom(zoom * 1.2, 400)
      setZoom(zoom * 1.2)
    }
  }, [zoom])

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoom(zoom * 0.8, 400)
      setZoom(zoom * 0.8)
    }
  }, [zoom])

  const handleFitView = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 50)
      setZoom(1)
    }
  }, [])

  const handleNodeClick = useCallback((node: ForceGraphNode) => {
    setSelectedNode(node)
    // Center the graph on the selected node
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 1000)
      graphRef.current.zoom(2, 1000)
      setZoom(2)
    }
  }, [])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading knowledge graph...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <Info className="h-12 w-12 text-destructive" />
            <p className="text-sm text-destructive">{error || "No graph data available"}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Filter nodes based on search
  const filteredNodes = data.nodes.filter(
    (node) =>
      node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.path?.toLowerCase().includes(searchTerm.toLowerCase())
  )
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id))
  const filteredEdges = data.edges.filter(
    (edge) => filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
  )

  const graphData = {
    nodes: filteredNodes,
    links: filteredEdges,
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Knowledge Graph</CardTitle>
              <CardDescription>
                {data.total_nodes} nodes, {data.total_edges} relationships
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{data.repo_id}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search nodes by name or path..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={handleZoomIn} title="Zoom In">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleZoomOut} title="Zoom Out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleFitView} title="Fit to View">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">Node Types:</div>
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs capitalize">{type}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Graph */}
      <Card className="relative overflow-hidden">
        <CardContent className="p-0">
          <div className="relative" style={{ height: "600px", background: "rgba(0,0,0,0.02)" }}>
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              width={typeof window !== "undefined" ? window.innerWidth - 100 : 1200}
              height={600}
              nodeLabel={(node: any) => `${node.label} (${node.type})`}
              nodeColor={(node: any) => NODE_COLORS[node.type as string] || NODE_COLORS.default}
              nodeRelSize={6}
              nodeVal={(node: any) => Math.sqrt(node.size) / 10 + 1}
              linkColor={(link: any) => EDGE_COLORS[link.type as string] || "#64748b"}
              linkWidth={(link: any) => link.weight}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              linkCurvature={0.2}
              onNodeClick={handleNodeClick}
              cooldownTicks={100}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              backgroundColor="transparent"
            />
          </div>
        </CardContent>
      </Card>

      {/* Selected Node Info */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: NODE_COLORS[selectedNode.type] || NODE_COLORS.default }}
                  />
                  {selectedNode.label}
                </CardTitle>
                <CardDescription>Selected Node Details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Type:</div>
                  <div className="font-medium capitalize">{selectedNode.type}</div>
                  
                  {selectedNode.path && (
                    <>
                      <div className="text-muted-foreground">Path:</div>
                      <div className="font-mono text-xs truncate">{selectedNode.path}</div>
                    </>
                  )}
                  
                  <div className="text-muted-foreground">Size:</div>
                  <div className="font-medium">{selectedNode.size} chars</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedNode(null)} className="w-full mt-2">
                  Close
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
