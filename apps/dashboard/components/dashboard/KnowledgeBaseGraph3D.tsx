"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Box,
  Database,
  FileCode2,
  Globe,
  Layers3,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as THREE from "three";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Types
interface KnowledgeNode {
  id: string;
  label: string;
  type: "source" | "document" | "chunk" | "entity" | "relation";
  position: THREE.Vector3;
  connections: string[];
  metadata?: {
    source_type?: string;
    file_count?: number;
    chunk_count?: number;
    entity_type?: string;
  };
}

interface KnowledgeEdge {
  from: string;
  to: string;
  type: "contains" | "references" | "depends_on" | "related_to";
}

interface Graph3DProps {
  className?: string;
}

// Color palette for node types
const NODE_COLORS: Record<string, number> = {
  source: 0x10b981,    // emerald
  document: 0x3b82f6,  // blue
  chunk: 0x8b5cf6,     // purple
  entity: 0xf59e0b,    // amber
  relation: 0xec4899,  // pink
};

// Node icons mapping
const NODE_ICONS: Record<string, React.ReactNode> = {
  source: <Database className="h-4 w-4" />,
  document: <FileCode2 className="h-4 w-4" />,
  chunk: <Box className="h-4 w-4" />,
  entity: <Sparkles className="h-4 w-4" />,
  relation: <Globe className="h-4 w-4" />,
};

export function KnowledgeBaseGraph3D({ className }: Graph3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const nodesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const edgesRef = useRef<THREE.Line[]>([]);
  const animationFrameRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0, isDown: false });
  const rotationRef = useRef({ x: 0, y: 0 });
  const targetRotationRef = useRef({ x: 0, y: 0 });

  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [edges, setEdges] = useState<KnowledgeEdge[]>([]);
  const [zoom, setZoom] = useState(1);
  const [stats, setStats] = useState({
    sources: 0,
    documents: 0,
    chunks: 0,
    entities: 0,
  });

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.Fog(0x0a0a0f, 50, 200);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 80;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // Point lights for dramatic effect
    const pointLight1 = new THREE.PointLight(0x10b981, 1, 100);
    pointLight1.position.set(30, 30, 30);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x3b82f6, 1, 100);
    pointLight2.position.set(-30, -30, 30);
    scene.add(pointLight2);

    // Grid helper for depth perception
    const gridHelper = new THREE.GridHelper(100, 20, 0x1a1a2e, 0x1a1a2e);
    gridHelper.position.y = -30;
    scene.add(gridHelper);

    // Load data and create graph
    loadGraphData();

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      // Smooth rotation interpolation
      rotationRef.current.x += (targetRotationRef.current.x - rotationRef.current.x) * 0.05;
      rotationRef.current.y += (targetRotationRef.current.y - rotationRef.current.y) * 0.05;

      // Rotate scene
      scene.rotation.x = rotationRef.current.x;
      scene.rotation.y = rotationRef.current.y;

      // Animate nodes
      nodesRef.current.forEach((mesh, id) => {
        // Subtle floating animation
        mesh.position.y += Math.sin(Date.now() * 0.001 + parseInt(id, 36)) * 0.003;
        
        // Pulsing effect for selected node
        if (selectedNode && id === selectedNode.id) {
          const scale = 1 + Math.sin(Date.now() * 0.005) * 0.1;
          mesh.scale.setScalar(scale);
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Mouse controls
    const handleMouseDown = (e: MouseEvent) => {
      mouseRef.current.isDown = true;
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };

    const handleMouseUp = () => {
      mouseRef.current.isDown = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseRef.current.isDown) return;
      const deltaX = e.clientX - mouseRef.current.x;
      const deltaY = e.clientY - mouseRef.current.y;
      targetRotationRef.current.y += deltaX * 0.005;
      targetRotationRef.current.x += deltaY * 0.005;
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const newZoom = Math.max(0.5, Math.min(2, zoom - e.deltaY * 0.001));
      setZoom(newZoom);
      if (cameraRef.current) {
        cameraRef.current.position.z = 80 / newZoom;
      }
    };

    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("wheel", handleWheel);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [zoom, selectedNode]);

  // Load graph data from API
  const loadGraphData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/dashboard/admin/knowledge-base/repos?limit=50");
      if (response.ok) {
        const data = await response.json();
        const items = Array.isArray(data.items) ? data.items : [];
        
        // Create nodes from repo data
        const graphNodes = createNodesFromData(items);
        const graphEdges = createEdgesFromNodes(graphNodes);
        
        setNodes(graphNodes);
        setEdges(graphEdges);
        
        // Calculate stats
        setStats({
          sources: graphNodes.filter(n => n.type === "source").length,
          documents: graphNodes.filter(n => n.type === "document").length,
          chunks: graphNodes.filter(n => n.type === "chunk").length,
          entities: graphNodes.filter(n => n.type === "entity").length,
        });

        // Create 3D objects
        createGraphObjects(graphNodes, graphEdges);
      }
    } catch (error) {
      console.error("Failed to load graph data:", error);
      // Create demo data
      const demoNodes = createDemoNodes();
      const demoEdges = createEdgesFromNodes(demoNodes);
      setNodes(demoNodes);
      setEdges(demoEdges);
      createGraphObjects(demoNodes, demoEdges);
      
      setStats({
        sources: demoNodes.filter(n => n.type === "source").length,
        documents: demoNodes.filter(n => n.type === "document").length,
        chunks: demoNodes.filter(n => n.type === "chunk").length,
        entities: demoNodes.filter(n => n.type === "entity").length,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Create nodes from API data
  const createNodesFromData = (items: Array<{ repo_id: string; profile?: Record<string, unknown> }>) => {
    const graphNodes: KnowledgeNode[] = [];
    
    items.forEach((item, index) => {
      // Source node
      const angle = (index / items.length) * Math.PI * 2;
      const radius = 25;
      const sourcePos = new THREE.Vector3(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 10,
        Math.sin(angle) * radius
      );
      
      const sourceNode: KnowledgeNode = {
        id: `source-${item.repo_id}`,
        label: item.repo_id,
        type: "source",
        position: sourcePos,
        connections: [],
        metadata: {
          file_count: Number(item.profile?.files_indexed) || 0,
        },
      };
      graphNodes.push(sourceNode);

      // Create child document nodes
      const docCount = Math.min(3, Math.floor(Math.random() * 4) + 1);
      for (let j = 0; j < docCount; j++) {
        const docAngle = angle + (j - docCount / 2) * 0.3;
        const docRadius = radius + 15;
        const docPos = new THREE.Vector3(
          Math.cos(docAngle) * docRadius,
          (Math.random() - 0.5) * 15,
          Math.sin(docAngle) * docRadius
        );
        
        const docNode: KnowledgeNode = {
          id: `doc-${item.repo_id}-${j}`,
          label: `Document ${j + 1}`,
          type: "document",
          position: docPos,
          connections: [sourceNode.id],
        };
        graphNodes.push(docNode);
        sourceNode.connections.push(docNode.id);

        // Create chunk nodes
        const chunkCount = Math.floor(Math.random() * 3) + 1;
        for (let k = 0; k < chunkCount; k++) {
          const chunkPos = new THREE.Vector3(
            docPos.x + (Math.random() - 0.5) * 10,
            docPos.y + (Math.random() - 0.5) * 5,
            docPos.z + (Math.random() - 0.5) * 10
          );
          
          const chunkNode: KnowledgeNode = {
            id: `chunk-${item.repo_id}-${j}-${k}`,
            label: `Chunk ${k + 1}`,
            type: "chunk",
            position: chunkPos,
            connections: [docNode.id],
          };
          graphNodes.push(chunkNode);
          docNode.connections.push(chunkNode.id);
        }
      }
    });

    return graphNodes;
  };

  // Create demo nodes for fallback
  const createDemoNodes = (): KnowledgeNode[] => {
    const nodes: KnowledgeNode[] = [];
    const sourceNames = ["auth-service", "api-gateway", "user-service", "docs"];
    
    sourceNames.forEach((name, index) => {
      const angle = (index / sourceNames.length) * Math.PI * 2;
      const radius = 25;
      
      const sourceNode: KnowledgeNode = {
        id: `source-${name}`,
        label: name,
        type: "source",
        position: new THREE.Vector3(
          Math.cos(angle) * radius,
          (Math.random() - 0.5) * 10,
          Math.sin(angle) * radius
        ),
        connections: [],
        metadata: { file_count: Math.floor(Math.random() * 50) + 10 },
      };
      nodes.push(sourceNode);

      // Documents
      for (let j = 0; j < 3; j++) {
        const docAngle = angle + (j - 1) * 0.3;
        const docRadius = radius + 15;
        
        const docNode: KnowledgeNode = {
          id: `doc-${name}-${j}`,
          label: `${name}/doc${j + 1}`,
          type: "document",
          position: new THREE.Vector3(
            Math.cos(docAngle) * docRadius,
            (Math.random() - 0.5) * 15,
            Math.sin(docAngle) * docRadius
          ),
          connections: [sourceNode.id],
        };
        nodes.push(docNode);
        sourceNode.connections.push(docNode.id);

        // Chunks
        for (let k = 0; k < 2; k++) {
          const chunkNode: KnowledgeNode = {
            id: `chunk-${name}-${j}-${k}`,
            label: `Chunk ${k + 1}`,
            type: "chunk",
            position: new THREE.Vector3(
              docNode.position.x + (Math.random() - 0.5) * 8,
              docNode.position.y + (Math.random() - 0.5) * 4,
              docNode.position.z + (Math.random() - 0.5) * 8
            ),
            connections: [docNode.id],
          };
          nodes.push(chunkNode);
          docNode.connections.push(chunkNode.id);
        }
      }
    });

    // Add entity nodes
    const entityTypes = ["Function", "Class", "API Endpoint", "Database Table"];
    entityTypes.forEach((type, i) => {
      const entityNode: KnowledgeNode = {
        id: `entity-${i}`,
        label: type,
        type: "entity",
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 40,
          20 + Math.random() * 10,
          (Math.random() - 0.5) * 40
        ),
        connections: [],
        metadata: { entity_type: type },
      };
      nodes.push(entityNode);
    });

    return nodes;
  };

  // Create edges from nodes
  const createEdgesFromNodes = (graphNodes: KnowledgeNode[]): KnowledgeEdge[] => {
    const graphEdges: KnowledgeEdge[] = [];
    
    graphNodes.forEach(node => {
      node.connections.forEach(connId => {
        graphEdges.push({
          from: node.id,
          to: connId,
          type: node.type === "source" ? "contains" : "references",
        });
      });
    });

    return graphEdges;
  };

  // Create Three.js objects
  const createGraphObjects = (graphNodes: KnowledgeNode[], graphEdges: KnowledgeEdge[]) => {
    if (!sceneRef.current) return;

    const scene = sceneRef.current;

    // Clear existing objects
    nodesRef.current.forEach(mesh => scene.remove(mesh));
    nodesRef.current.clear();
    edgesRef.current.forEach(line => scene.remove(line));
    edgesRef.current = [];

    // Create nodes
    graphNodes.forEach(node => {
      const geometry = node.type === "source" 
        ? new THREE.IcosahedronGeometry(2.5, 1)
        : node.type === "document"
        ? new THREE.BoxGeometry(2, 2, 2)
        : node.type === "entity"
        ? new THREE.OctahedronGeometry(2, 0)
        : new THREE.SphereGeometry(1, 16, 16);

      const material = new THREE.MeshPhongMaterial({
        color: NODE_COLORS[node.type] || 0xffffff,
        emissive: NODE_COLORS[node.type] || 0xffffff,
        emissiveIntensity: 0.3,
        shininess: 80,
        transparent: true,
        opacity: 0.9,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(node.position);
      mesh.userData = { nodeId: node.id };
      
      scene.add(mesh);
      nodesRef.current.set(node.id, mesh);
    });

    // Create edges
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x404060,
      transparent: true,
      opacity: 0.4,
    });

    graphEdges.forEach(edge => {
      const fromMesh = nodesRef.current.get(edge.from);
      const toMesh = nodesRef.current.get(edge.to);
      
      if (fromMesh && toMesh) {
        const points = [fromMesh.position.clone(), toMesh.position.clone()];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        scene.add(line);
        edgesRef.current.push(line);
      }
    });
  };

  // Handlers
  const handleResetView = () => {
    targetRotationRef.current = { x: 0, y: 0 };
    setZoom(1);
    if (cameraRef.current) {
      cameraRef.current.position.z = 80;
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(2, zoom + 0.2);
    setZoom(newZoom);
    if (cameraRef.current) {
      cameraRef.current.position.z = 80 / newZoom;
    }
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(0.5, zoom - 0.2);
    setZoom(newZoom);
    if (cameraRef.current) {
      cameraRef.current.position.z = 80 / newZoom;
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Filter nodes by search
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    const query = searchQuery.toLowerCase();
    return nodes.filter(node => 
      node.label.toLowerCase().includes(query) ||
      node.type.toLowerCase().includes(query)
    );
  }, [nodes, searchQuery]);

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
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
              <Layers3 className="h-6 w-6 text-white" />
            </div>
            Knowledge Base Graph
          </h2>
          <p className="text-gray-400 mt-1">
            Interactive 3D visualization of your indexed knowledge
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64 bg-gray-900/50 border-gray-700 text-white placeholder-gray-500"
            />
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        {[
          { label: "Sources", value: stats.sources, color: "from-emerald-500 to-emerald-600", icon: <Database className="h-5 w-5" /> },
          { label: "Documents", value: stats.documents, color: "from-blue-500 to-blue-600", icon: <FileCode2 className="h-5 w-5" /> },
          { label: "Chunks", value: stats.chunks, color: "from-purple-500 to-purple-600", icon: <Box className="h-5 w-5" /> },
          { label: "Entities", value: stats.entities, color: "from-amber-500 to-amber-600", icon: <Sparkles className="h-5 w-5" /> },
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
                  <div className={cn("p-2 rounded-lg bg-gradient-to-r", stat.color)}>
                    {stat.icon}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">{stat.value}</div>
                    <div className="text-xs text-gray-400">{stat.label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* 3D Graph Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={cn(
          "relative rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden",
          isFullscreen && "fixed inset-0 z-50 rounded-none border-0"
        )}
      >
        {/* Controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomIn}
            className="bg-gray-900/80 border-gray-700 text-white hover:bg-gray-800"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomOut}
            className="bg-gray-900/80 border-gray-700 text-white hover:bg-gray-800"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleResetView}
            className="bg-gray-900/80 border-gray-700 text-white hover:bg-gray-800"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleFullscreen}
            className="bg-gray-900/80 border-gray-700 text-white hover:bg-gray-800"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2">
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <Badge
              key={type}
              variant="outline"
              className="bg-gray-900/80 border-gray-700 text-white gap-2"
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
              />
              <span className="capitalize">{type}</span>
            </Badge>
          ))}
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-20">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Loading knowledge graph...</p>
            </div>
          </div>
        )}

        {/* Three.js Canvas Container */}
        <div
          ref={containerRef}
          className={cn(
            "w-full cursor-grab active:cursor-grabbing",
            isFullscreen ? "h-screen" : "h-[600px]"
          )}
        />

        {/* Instructions */}
        <div className="absolute bottom-4 right-4 z-10 text-xs text-gray-500">
          Drag to rotate | Scroll to zoom
        </div>
      </motion.div>

      {/* Node List */}
      {searchQuery && filteredNodes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-white text-lg">
                Search Results ({filteredNodes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredNodes.slice(0, 12).map((node) => (
                  <motion.div
                    key={node.id}
                    whileHover={{ scale: 1.02 }}
                    className="p-3 rounded-lg border border-gray-700 bg-gray-800/50 cursor-pointer hover:border-gray-600"
                    onClick={() => setSelectedNode(node)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor: `#${(NODE_COLORS[node.type] || 0xffffff).toString(16).padStart(6, '0')}`,
                        }}
                      />
                      <span className="text-sm font-medium text-white truncate">
                        {node.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {node.type}
                      </Badge>
                      <span>{node.connections.length} connections</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

export default KnowledgeBaseGraph3D;
