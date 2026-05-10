"use client"

import React, { useRef, useEffect, useState, useCallback } from "react"
import * as THREE from "three"
import { motion } from "framer-motion"
import { 
  Search, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  RotateCcw, 
  Filter,
  Layers,
  Eye,
  EyeOff,
  RefreshCw,
  Download,
  Settings
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface KnowledgeNode {
  id: string
  title: string
  type: 'document' | 'concept' | 'code' | 'policy' | 'tag'
  content: string
  connections: string[]
  position: [number, number, number]
  size: number
  color: string
  relevanceScore?: number
  tags: string[]
  chunkCount?: number
  lastUpdated?: string
}

interface KnowledgeEdge {
  source: string
  target: string
  weight: number
  type: 'semantic' | 'reference' | 'tag' | 'hierarchical'
}

interface KnowledgeGraphData {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
}

interface Graph3DSettings {
  nodeSize: number
  edgeOpacity: number
  animationSpeed: number
  particleEffect: boolean
  showLabels: boolean
  clustering: boolean
  forceSimulation: boolean
  colorScheme: 'semantic' | 'type' | 'relevance'
}

const DEFAULT_SETTINGS: Graph3DSettings = {
  nodeSize: 1.0,
  edgeOpacity: 0.3,
  animationSpeed: 1.0,
  particleEffect: true,
  showLabels: true,
  clustering: true,
  forceSimulation: true,
  colorScheme: 'semantic'
}

const NODE_COLORS = {
  document: '#3B82F6',     // Blue
  concept: '#10B981',      // Emerald  
  code: '#F59E0B',        // Amber
  policy: '#EF4444',      // Red
  tag: '#8B5CF6'          // Violet
}

const EDGE_COLORS = {
  semantic: '#06B6D4',     // Cyan
  reference: '#84CC16',    // Lime
  tag: '#F97316',         // Orange
  hierarchical: '#EC4899' // Pink
}

export function KnowledgeGraph3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene>()
  const rendererRef = useRef<THREE.WebGLRenderer>()
  const cameraRef = useRef<THREE.PerspectiveCamera>()
  const controlsRef = useRef<any>()
  const nodeGroupRef = useRef<THREE.Group>()
  const edgeGroupRef = useRef<THREE.Group>()
  const particleSystemRef = useRef<THREE.Points>()
  const animationIdRef = useRef<number>()
  
  const [data, setData] = useState<KnowledgeGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filteredTypes, setFilteredTypes] = useState<Set<string>>(new Set())
  const [settings, setSettings] = useState<Graph3DSettings>(DEFAULT_SETTINGS)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Mock data generation
  const generateMockData = useCallback((): KnowledgeGraphData => {
    const nodes: KnowledgeNode[] = [
      {
        id: 'sec-001',
        title: 'Security Guidelines',
        type: 'policy',
        content: 'Comprehensive security policies for code review',
        connections: ['sec-002', 'code-001'],
        position: [0, 0, 0],
        size: 1.5,
        color: NODE_COLORS.policy,
        relevanceScore: 0.9,
        tags: ['security', 'policy'],
        chunkCount: 12,
        lastUpdated: '2024-01-15'
      },
      {
        id: 'sec-002',
        title: 'Authentication Patterns',
        type: 'document',
        content: 'Best practices for authentication implementation',
        connections: ['sec-001', 'code-002'],
        position: [5, 2, -3],
        size: 1.2,
        color: NODE_COLORS.document,
        relevanceScore: 0.85,
        tags: ['security', 'auth'],
        chunkCount: 8,
        lastUpdated: '2024-01-10'
      },
      {
        id: 'code-001',
        title: 'React Hooks Examples',
        type: 'code',
        content: 'Common React patterns and hooks usage',
        connections: ['sec-001', 'concept-001'],
        position: [-4, -2, 4],
        size: 1.1,
        color: NODE_COLORS.code,
        relevanceScore: 0.75,
        tags: ['react', 'frontend'],
        chunkCount: 15,
        lastUpdated: '2024-01-12'
      },
      {
        id: 'code-002',
        title: 'API Error Handling',
        type: 'code',
        content: 'Standardized error handling patterns for APIs',
        connections: ['sec-002', 'concept-002'],
        position: [2, -5, 2],
        size: 1.3,
        color: NODE_COLORS.code,
        relevanceScore: 0.8,
        tags: ['api', 'error-handling'],
        chunkCount: 10,
        lastUpdated: '2024-01-08'
      },
      {
        id: 'concept-001',
        title: 'Component Architecture',
        type: 'concept',
        content: 'Architectural principles for scalable components',
        connections: ['code-001', 'concept-002'],
        position: [-2, 4, -2],
        size: 1.0,
        color: NODE_COLORS.concept,
        relevanceScore: 0.7,
        tags: ['architecture', 'design'],
        chunkCount: 6,
        lastUpdated: '2024-01-14'
      },
      {
        id: 'concept-002',
        title: 'Error Handling Strategy',
        type: 'concept',
        content: 'Strategic approach to error management',
        connections: ['code-002', 'concept-001'],
        position: [3, 3, 5],
        size: 0.9,
        color: NODE_COLORS.concept,
        relevanceScore: 0.65,
        tags: ['strategy', 'error-handling'],
        chunkCount: 4,
        lastUpdated: '2024-01-11'
      }
    ]

    const edges: KnowledgeEdge[] = [
      { source: 'sec-001', target: 'sec-002', weight: 0.8, type: 'semantic' },
      { source: 'sec-001', target: 'code-001', weight: 0.6, type: 'reference' },
      { source: 'sec-002', target: 'code-002', weight: 0.7, type: 'reference' },
      { source: 'code-001', target: 'concept-001', weight: 0.9, type: 'hierarchical' },
      { source: 'code-002', target: 'concept-002', weight: 0.8, type: 'hierarchical' },
      { source: 'concept-001', target: 'concept-002', weight: 0.5, type: 'semantic' }
    ]

    return { nodes, edges }
  }, [])

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    if (!mountRef.current) return

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0f)
    scene.fog = new THREE.Fog(0x0a0a0f, 10, 50)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.set(10, 10, 10)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: "high-performance"
    })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    rendererRef.current = renderer
    mountRef.current.appendChild(renderer.domElement)

    // Controls (OrbitControls)
    const OrbitControls = (window as any).THREE?.OrbitControls
    if (OrbitControls) {
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      controls.autoRotate = true
      controls.autoRotateSpeed = 0.5
      controlsRef.current = controls
    }

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x4040ff, 0.4)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 10, 5)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    // Point lights for dramatic effect
    const pointLight1 = new THREE.PointLight(0x00ffff, 0.5, 20)
    pointLight1.position.set(-10, 5, -5)
    scene.add(pointLight1)

    const pointLight2 = new THREE.PointLight(0xff00ff, 0.5, 20)
    pointLight2.position.set(10, -5, 5)
    scene.add(pointLight2)

    // Groups for nodes and edges
    const nodeGroup = new THREE.Group()
    const edgeGroup = new THREE.Group()
    scene.add(nodeGroup)
    scene.add(edgeGroup)
    nodeGroupRef.current = nodeGroup
    edgeGroupRef.current = edgeGroup

    // Particle system for ambient effects
    if (settings.particleEffect) {
      createParticleSystem()
    }
  }, [settings.particleEffect])

  // Create particle system
  const createParticleSystem = useCallback(() => {
    if (!sceneRef.current) return

    const particleCount = 200
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50
      positions[i * 3 + 1] = (Math.random() - 0.5) * 50
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50

      const color = new THREE.Color()
      color.setHSL(Math.random(), 0.7, 0.5)
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.3
    })

    const particles = new THREE.Points(geometry, material)
    sceneRef.current.add(particles)
    particleSystemRef.current = particles
  }, [])

  // Create nodes
  const createNodes = useCallback((nodes: KnowledgeNode[]) => {
    if (!nodeGroupRef.current) return

    // Clear existing nodes
    nodeGroupRef.current.clear()

    nodes.forEach(node => {
      // Node sphere
      const geometry = new THREE.SphereGeometry(node.size * settings.nodeSize, 32, 32)
      const material = new THREE.MeshPhongMaterial({ 
        color: new THREE.Color(node.color),
        transparent: true,
        opacity: 0.8,
        shininess: 100
      })
      
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(...node.position)
      mesh.userData = { node }
      mesh.castShadow = true
      mesh.receiveShadow = true

      // Add glow effect
      const glowGeometry = new THREE.SphereGeometry(node.size * settings.nodeSize * 1.2, 16, 16)
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(node.color),
        transparent: true,
        opacity: 0.1
      })
      const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial)
      glowMesh.position.set(...node.position)
      
      nodeGroupRef.current!.add(mesh)
      nodeGroupRef.current!.add(glowMesh)

      // Add label if enabled
      if (settings.showLabels) {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        canvas.width = 256
        canvas.height = 64
        
        context.fillStyle = 'rgba(0, 0, 0, 0.8)'
        context.fillRect(0, 0, canvas.width, canvas.height)
        
        context.fillStyle = '#ffffff'
        context.font = '24px Arial'
        context.textAlign = 'center'
        context.fillText(node.title, canvas.width / 2, canvas.height / 2)

        const texture = new THREE.CanvasTexture(canvas)
        const labelMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true })
        const label = new THREE.Sprite(labelMaterial)
        label.position.set(node.position[0], node.position[1] + node.size * 2, node.position[2])
        label.scale.set(4, 1, 1)
        
        nodeGroupRef.current!.add(label)
      }
    })
  }, [settings.nodeSize, settings.showLabels])

  // Create edges
  const createEdges = useCallback((edges: KnowledgeEdge[], nodes: KnowledgeNode[]) => {
    if (!edgeGroupRef.current) return

    // Clear existing edges
    edgeGroupRef.current.clear()

    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source)
      const targetNode = nodes.find(n => n.id === edge.target)
      
      if (!sourceNode || !targetNode) return

      // Create curved line between nodes
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(...sourceNode.position),
        new THREE.Vector3(
          (sourceNode.position[0] + targetNode.position[0]) / 2,
          (sourceNode.position[1] + targetNode.position[1]) / 2 + 2,
          (sourceNode.position[2] + targetNode.position[2]) / 2
        ),
        new THREE.Vector3(...targetNode.position)
      )

      const points = curve.getPoints(50)
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      
      const material = new THREE.LineBasicMaterial({ 
        color: EDGE_COLORS[edge.type],
        transparent: true,
        opacity: settings.edgeOpacity * edge.weight,
        linewidth: edge.weight * 3
      })
      
      const line = new THREE.Line(geometry, material)
      edgeGroupRef.current!.add(line)

      // Add flow particles on edges
      if (settings.particleEffect) {
        const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8)
        const particleMaterial = new THREE.MeshBasicMaterial({ 
          color: EDGE_COLORS[edge.type],
          transparent: true,
          opacity: 0.6
        })
        
        for (let i = 0; i < 3; i++) {
          const particle = new THREE.Mesh(particleGeometry, particleMaterial)
          const t = i / 3
          const point = curve.getPoint(t)
          particle.position.copy(point)
          particle.userData = { curve, t, speed: 0.005 }
          edgeGroupRef.current!.add(particle)
        }
      }
    })
  }, [settings.edgeOpacity, settings.particleEffect])

  // Animation loop
  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return

    // Update controls
    if (controlsRef.current) {
      controlsRef.current.update()
    }

    // Animate particles on edges
    if (edgeGroupRef.current && settings.particleEffect) {
      edgeGroupRef.current.traverse((child) => {
        if (child.userData.curve) {
          child.userData.t += child.userData.speed * settings.animationSpeed
          if (child.userData.t > 1) child.userData.t = 0
          const point = child.userData.curve.getPoint(child.userData.t)
          child.position.copy(point)
        }
      })
    }

    // Animate particle system
    if (particleSystemRef.current) {
      particleSystemRef.current.rotation.y += 0.001 * settings.animationSpeed
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current)
    animationIdRef.current = requestAnimationFrame(animate)
  }, [settings.animationSpeed, settings.particleEffect])

  // Load data and initialize
  useEffect(() => {
    const mockData = generateMockData()
    setData(mockData)
    setLoading(false)
  }, [generateMockData])

  // Initialize scene
  useEffect(() => {
    initScene()
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      if (mountRef.current && rendererRef.current?.domElement) {
        mountRef.current.removeChild(rendererRef.current.domElement)
      }
    }
  }, [initScene])

  // Update visualization when data changes
  useEffect(() => {
    if (data && nodeGroupRef.current && edgeGroupRef.current) {
      createNodes(data.nodes)
      createEdges(data.edges, data.nodes)
      animate()
    }
  }, [data, createNodes, createEdges, animate])

  // Update settings
  useEffect(() => {
    if (data) {
      createNodes(data.nodes)
      createEdges(data.edges, data.nodes)
    }
  }, [settings, data, createNodes, createEdges])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return
      
      const width = mountRef.current.clientWidth
      const height = mountRef.current.clientHeight
      
      cameraRef.current.aspect = width / height
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(width, height)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Reset camera position
  const resetCamera = useCallback(() => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(10, 10, 10)
      controlsRef.current.reset()
    }
  }, [])

  // Filter nodes by type
  const handleTypeFilter = useCallback((type: string) => {
    setFilteredTypes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(type)) {
        newSet.delete(type)
      } else {
        newSet.add(type)
      }
      return newSet
    })
  }, [])

  // Filter data based on search and filters
  const filteredData = React.useMemo(() => {
    if (!data) return null

    let filteredNodes = data.nodes
    let filteredEdges = data.edges

    // Apply search filter
    if (searchQuery) {
      filteredNodes = filteredNodes.filter(node =>
        node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      )
      
      const nodeIds = new Set(filteredNodes.map(n => n.id))
      filteredEdges = filteredEdges.filter(edge =>
        nodeIds.has(edge.source) && nodeIds.has(edge.target)
      )
    }

    // Apply type filter
    if (filteredTypes.size > 0) {
      filteredNodes = filteredNodes.filter(node => !filteredTypes.has(node.type))
      
      const nodeIds = new Set(filteredNodes.map(n => n.id))
      filteredEdges = filteredEdges.filter(edge =>
        nodeIds.has(edge.source) && nodeIds.has(edge.target)
      )
    }

    return { nodes: filteredNodes, edges: filteredEdges }
  }, [data, searchQuery, filteredTypes])

  if (loading) {
    return (
      <Card className="h-[600px] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading knowledge graph...</p>
        </div>
      </Card>
    )
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'relative'}`}>
      <Card className="h-full min-h-[600px]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              3D Knowledge Graph
              {filteredData && (
                <Badge variant="secondary">
                  {filteredData.nodes.length} nodes, {filteredData.edges.length} edges
                </Badge>
              )}
            </CardTitle>
            
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search nodes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-48"
                />
              </div>

              {/* Filter by type */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4" />
                    {filteredTypes.size > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {filteredTypes.size}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Hide Node Types</Label>
                    {Object.keys(NODE_COLORS).map(type => (
                      <div key={type} className="flex items-center space-x-2">
                        <Switch
                          checked={filteredTypes.has(type)}
                          onCheckedChange={() => handleTypeFilter(type)}
                        />
                        <Label className="text-sm capitalize">{type}</Label>
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: NODE_COLORS[type as keyof typeof NODE_COLORS] }}
                        />
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Settings */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm">Node Size: {settings.nodeSize.toFixed(1)}</Label>
                      <Slider
                        value={[settings.nodeSize]}
                        onValueChange={([value]) => setSettings(prev => ({ ...prev, nodeSize: value }))}
                        min={0.5}
                        max={2}
                        step={0.1}
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-sm">Edge Opacity: {settings.edgeOpacity.toFixed(1)}</Label>
                      <Slider
                        value={[settings.edgeOpacity]}
                        onValueChange={([value]) => setSettings(prev => ({ ...prev, edgeOpacity: value }))}
                        min={0.1}
                        max={1}
                        step={0.1}
                        className="mt-2"
                      />
                    </div>

                    <div>
                      <Label className="text-sm">Animation Speed: {settings.animationSpeed.toFixed(1)}</Label>
                      <Slider
                        value={[settings.animationSpeed]}
                        onValueChange={([value]) => setSettings(prev => ({ ...prev, animationSpeed: value }))}
                        min={0.1}
                        max={3}
                        step={0.1}
                        className="mt-2"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={settings.showLabels}
                        onCheckedChange={(checked) => setSettings(prev => ({ ...prev, showLabels: checked }))}
                      />
                      <Label className="text-sm">Show Labels</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={settings.particleEffect}
                        onCheckedChange={(checked) => setSettings(prev => ({ ...prev, particleEffect: checked }))}
                      />
                      <Label className="text-sm">Particle Effects</Label>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Controls */}
              <Button variant="outline" size="sm" onClick={resetCamera}>
                <RotateCcw className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 relative">
          <div 
            ref={mountRef} 
            className="w-full h-[500px] bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg overflow-hidden"
            style={{ height: isFullscreen ? 'calc(100vh - 120px)' : '500px' }}
          />

          {/* Node info panel */}
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="absolute top-4 left-4 w-80 bg-background/95 backdrop-blur-sm border rounded-lg p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold">{selectedNode.title}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedNode(null)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{selectedNode.type}</Badge>
                  <Badge variant="outline">{selectedNode.chunkCount} chunks</Badge>
                </div>
                
                <p className="text-muted-foreground line-clamp-3">
                  {selectedNode.content}
                </p>
                
                <div className="flex flex-wrap gap-1">
                  {selectedNode.tags.map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      #{tag}
                    </Badge>
                  ))}
                </div>

                {selectedNode.relevanceScore && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Relevance:</span>
                    <div className="flex-1 bg-muted rounded-full h-1.5">
                      <div 
                        className="bg-primary rounded-full h-1.5 transition-all"
                        style={{ width: `${selectedNode.relevanceScore * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium">
                      {(selectedNode.relevanceScore * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 right-4 bg-background/95 backdrop-blur-sm border rounded-lg p-3">
            <h4 className="text-sm font-medium mb-2">Node Types</h4>
            <div className="space-y-1">
              {Object.entries(NODE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2 text-xs">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: color }}
                  />
                  <span className="capitalize">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}