"use client"

import React, { Suspense, useEffect, useRef, useState, useMemo } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Text, Line } from "@react-three/drei"
import * as THREE from "three"

// Types
interface GraphNode {
  id: string
  label: string
  type: string
  properties: Record<string, any>
  size: number
  color: string
}

interface GraphEdge {
  id: string
  source: string
  target: string
  type: string
  properties: Record<string, any>
  weight: number
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: Record<string, any>
}

interface NodePosition extends GraphNode {
  position: THREE.Vector3
  velocity: THREE.Vector3
}

// Physics simulation for force-directed graph
function useForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  enabled: boolean,
) {
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map())

  useEffect(() => {
    if (!nodes.length) return

    // Initialize positions randomly in a sphere
    const initialPositions = new Map<string, NodePosition>()
    nodes.forEach((node) => {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const radius = 50 + Math.random() * 50

      initialPositions.set(node.id, {
        ...node,
        position: new THREE.Vector3(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi),
        ),
        velocity: new THREE.Vector3(0, 0, 0),
      })
    })

    setPositions(initialPositions)

    if (!enabled) return

    // Run force simulation
    let frame = 0
    const maxFrames = 300
    const interval = setInterval(() => {
      frame++
      if (frame >= maxFrames) {
        clearInterval(interval)
        return
      }

      setPositions((prev) => {
        const next = new Map(prev)
        const alpha = 1 - frame / maxFrames

        // Repulsion force between all nodes
        next.forEach((nodeA, idA) => {
          next.forEach((nodeB, idB) => {
            if (idA === idB) return

            const delta = new THREE.Vector3().subVectors(nodeA.position, nodeB.position)
            const distance = Math.max(delta.length(), 1)
            const force = (100 * alpha) / (distance * distance)

            delta.normalize().multiplyScalar(force)
            nodeA.velocity.add(delta)
          })
        })

        // Attraction force along edges
        edges.forEach((edge) => {
          const source = next.get(edge.source)
          const target = next.get(edge.target)
          if (!source || !target) return

          const delta = new THREE.Vector3().subVectors(target.position, source.position)
          const distance = delta.length()
          const force = (distance - 30) * 0.1 * alpha

          delta.normalize().multiplyScalar(force)
          source.velocity.add(delta)
          target.velocity.sub(delta)
        })

        // Apply velocity and damping
        next.forEach((node) => {
          node.position.add(node.velocity)
          node.velocity.multiplyScalar(0.8)
        })

        return next
      })
    }, 16) // ~60 FPS

    return () => clearInterval(interval)
  }, [nodes, edges, enabled])

  return positions
}

// Node component
function Node({
  node,
  position,
  onClick,
  isSelected,
}: {
  node: GraphNode
  position: THREE.Vector3
  onClick: () => void
  isSelected: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame(() => {
    if (meshRef.current && isSelected) {
      meshRef.current.rotation.y += 0.01
    }
  })

  const scale = isSelected ? node.size * 1.5 : hovered ? node.size * 1.2 : node.size

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[scale, 32, 32]} />
        <meshStandardMaterial
          color={node.color}
          emissive={isSelected ? node.color : "#000000"}
          emissiveIntensity={isSelected ? 0.5 : 0}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>
      {(hovered || isSelected) && (
        <Text
          position={[0, scale + 2, 0]}
          fontSize={2}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {node.label}
        </Text>
      )}
    </group>
  )
}

// Edge component
function Edge({
  edge,
  sourcePos,
  targetPos,
}: {
  edge: GraphEdge
  sourcePos: THREE.Vector3
  targetPos: THREE.Vector3
}) {
  const points = useMemo(
    () => [sourcePos.clone(), targetPos.clone()],
    [sourcePos, targetPos],
  )

  return (
    <Line
      points={points}
      color="#4a5568"
      lineWidth={edge.weight}
      opacity={0.3}
      transparent
    />
  )
}

// Graph 3D Scene
function GraphScene({
  data,
  selectedNodeId,
  onNodeClick,
  simulationEnabled,
}: {
  data: GraphData
  selectedNodeId: string | null
  onNodeClick: (nodeId: string) => void
  simulationEnabled: boolean
}) {
  const positions = useForceSimulation(data.nodes, data.edges, simulationEnabled)

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <pointLight position={[100, 100, 100]} intensity={0.8} />
      <pointLight position={[-100, -100, -100]} intensity={0.5} />

      {/* Nodes */}
      {data.nodes.map((node) => {
        const nodePos = positions.get(node.id)
        if (!nodePos) return null

        return (
          <Node
            key={node.id}
            node={node}
            position={nodePos.position}
            onClick={() => onNodeClick(node.id)}
            isSelected={selectedNodeId === node.id}
          />
        )
      })}

      {/* Edges */}
      {data.edges.map((edge) => {
        const sourcePos = positions.get(edge.source)
        const targetPos = positions.get(edge.target)
        if (!sourcePos || !targetPos) return null

        return (
          <Edge
            key={edge.id}
            edge={edge}
            sourcePos={sourcePos.position}
            targetPos={targetPos.position}
          />
        )
      })}

      {/* Camera controls */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={20}
        maxDistance={500}
      />
    </>
  )
}

// Main component
export function KnowledgeGraph3D() {
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [simulationEnabled, setSimulationEnabled] = useState(true)
  const [filters, setFilters] = useState({
    limit: 500,
    nodeTypes: "",
    repoId: "",
  })

  // Fetch graph data
  const fetchGraphData = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        limit: filters.limit.toString(),
      })
      if (filters.nodeTypes) params.append("node_types", filters.nodeTypes)
      if (filters.repoId) params.append("repo_id", filters.repoId)

      const response = await fetch(`/api/dashboard/graph/data?${params.toString()}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch graph data: ${response.statusText}`)
      }

      const graphData = await response.json()
      setData(graphData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGraphData()
  }, [filters])

  const selectedNode = useMemo(
    () => data?.nodes.find((n) => n.id === selectedNodeId),
    [data, selectedNodeId],
  )

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="mb-4 h-16 w-16 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500 mx-auto" />
          <p className="text-slate-400">Loading knowledge graph...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error: {error}</p>
          <button
            onClick={fetchGraphData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-400">No graph data available</p>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-full bg-slate-950">
      {/* Canvas */}
      <Canvas camera={{ position: [0, 0, 150], fov: 75 }}>
        <Suspense fallback={null}>
          <GraphScene
            data={data}
            selectedNodeId={selectedNodeId}
            onNodeClick={setSelectedNodeId}
            simulationEnabled={simulationEnabled}
          />
        </Suspense>
      </Canvas>

      {/* Stats panel */}
      <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur p-4 rounded-lg border border-slate-700 text-white max-w-sm">
        <h3 className="text-lg font-bold mb-2">Knowledge Graph</h3>
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-slate-400">Nodes:</span> {data.stats.total_nodes}
          </p>
          <p>
            <span className="text-slate-400">Edges:</span> {data.stats.total_edges}
          </p>
          {data.stats.node_types && (
            <details className="mt-2">
              <summary className="cursor-pointer text-slate-400 hover:text-white">
                Node Types
              </summary>
              <ul className="ml-4 mt-1 space-y-1">
                {Object.entries(data.stats.node_types).map(([type, count]) => (
                  <li key={type}>
                    {type}: {count as number}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      {/* Controls panel */}
      <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur p-4 rounded-lg border border-slate-700 text-white space-y-3 max-w-xs">
        <h3 className="text-lg font-bold">Controls</h3>
        <div className="space-y-2 text-sm">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={simulationEnabled}
              onChange={(e) => setSimulationEnabled(e.target.checked)}
              className="rounded"
            />
            <span>Physics Simulation</span>
          </label>

          <div>
            <label className="block text-slate-400 mb-1">Node Limit</label>
            <input
              type="number"
              value={filters.limit}
              onChange={(e) =>
                setFilters({ ...filters, limit: parseInt(e.target.value) || 500 })
              }
              min={10}
              max={5000}
              className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Node Types (comma-separated)</label>
            <input
              type="text"
              value={filters.nodeTypes}
              onChange={(e) => setFilters({ ...filters, nodeTypes: e.target.value })}
              placeholder="e.g., File,Chunk"
              className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs"
            />
          </div>

          <button
            onClick={fetchGraphData}
            className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Reload Graph
          </button>
        </div>
      </div>

      {/* Selected node panel */}
      {selectedNode && (
        <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur p-4 rounded-lg border border-slate-700 text-white max-w-md">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-bold">{selectedNode.label}</h3>
            <button
              onClick={() => setSelectedNodeId(null)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-slate-400">Type:</span> {selectedNode.type}
            </p>
            <p>
              <span className="text-slate-400">ID:</span>{" "}
              <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">
                {selectedNode.id}
              </code>
            </p>
            {Object.entries(selectedNode.properties).length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-slate-400 hover:text-white">
                  Properties
                </summary>
                <div className="ml-4 mt-1 space-y-1 max-h-40 overflow-auto">
                  {Object.entries(selectedNode.properties).map(([key, value]) => (
                    <p key={key} className="text-xs">
                      <span className="text-slate-400">{key}:</span>{" "}
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 bg-slate-900/90 backdrop-blur p-3 rounded-lg border border-slate-700 text-white text-xs max-w-xs">
        <p className="font-bold mb-1">Instructions</p>
        <ul className="space-y-1 text-slate-400">
          <li>• Click and drag to rotate</li>
          <li>• Scroll to zoom</li>
          <li>• Right-click and drag to pan</li>
          <li>• Click a node to select it</li>
        </ul>
      </div>
    </div>
  )
}
