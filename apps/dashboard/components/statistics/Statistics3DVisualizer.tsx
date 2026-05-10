"use client"

import React, { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import * as THREE from "three"
import {
  Activity,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  Settings,
  Eye,
  EyeOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"

interface DataPoint3D {
  x: number
  y: number
  z: number
  value: number
  category: string
  color: string
  size: number
  label?: string
}

interface Statistics3DVisualizerProps {
  data?: DataPoint3D[]
  title?: string
  isAnimated?: boolean
  showControls?: boolean
  onDataPointClick?: (point: DataPoint3D) => void
}

function generateMockData3D(): DataPoint3D[] {
  const categories = ['Performance', 'Security', 'Quality', 'Maintainability']
  const colors = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b']
  const data: DataPoint3D[] = []

  for (let i = 0; i < 100; i++) {
    const categoryIndex = Math.floor(Math.random() * categories.length)
    data.push({
      x: (Math.random() - 0.5) * 10,
      y: (Math.random() - 0.5) * 10,
      z: (Math.random() - 0.5) * 10,
      value: Math.random() * 100,
      category: categories[categoryIndex],
      color: colors[categoryIndex],
      size: 0.1 + Math.random() * 0.3,
      label: `${categories[categoryIndex]} Point ${i + 1}`,
    })
  }

  return data
}

export function Statistics3DVisualizer({
  data = generateMockData3D(),
  title = "3D Statistics Visualization",
  isAnimated = true,
  showControls = true,
  onDataPointClick,
}: Statistics3DVisualizerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene>()
  const rendererRef = useRef<THREE.WebGLRenderer>()
  const cameraRef = useRef<THREE.PerspectiveCamera>()
  const spheresRef = useRef<THREE.Mesh[]>([])
  const animationIdRef = useRef<number>()
  
  const [isPlaying, setIsPlaying] = useState(isAnimated)
  const [zoom, setZoom] = useState([10])
  const [rotationSpeed, setRotationSpeed] = useState([1])
  const [showGrid, setShowGrid] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedPoint, setSelectedPoint] = useState<DataPoint3D | null>(null)
  const [hoverPoint, setHoverPoint] = useState<DataPoint3D | null>(null)

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return

    const width = mountRef.current.clientWidth
    const height = mountRef.current.clientHeight

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    camera.position.set(15, 15, 15)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    rendererRef.current = renderer

    mountRef.current.appendChild(renderer.domElement)

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 10, 5)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    // Point light for dramatic effect
    const pointLight = new THREE.PointLight(0x06b6d4, 1, 100)
    pointLight.position.set(0, 0, 10)
    scene.add(pointLight)

    // Grid setup
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222)
    scene.add(gridHelper)

    // Axes helper
    const axesHelper = new THREE.AxesHelper(5)
    scene.add(axesHelper)

    // Create data points
    const spheres: THREE.Mesh[] = []
    data.forEach((point, index) => {
      const geometry = new THREE.SphereGeometry(point.size, 16, 16)
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(point.color),
        shininess: 100,
        transparent: true,
        opacity: 0.8,
      })
      
      const sphere = new THREE.Mesh(geometry, material)
      sphere.position.set(point.x, point.y, point.z)
      sphere.castShadow = true
      sphere.receiveShadow = true
      sphere.userData = { point, index }
      
      scene.add(sphere)
      spheres.push(sphere)
    })
    
    spheresRef.current = spheres

    // Mouse interaction setup
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const onMouseMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(spheres)

      if (intersects.length > 0) {
        const intersected = intersects[0].object as THREE.Mesh
        const point = intersected.userData.point as DataPoint3D
        setHoverPoint(point)
        
        // Highlight effect
        intersected.material.opacity = 1
        intersected.scale.setScalar(1.2)
      } else {
        setHoverPoint(null)
        
        // Reset all spheres
        spheres.forEach(sphere => {
          sphere.material.opacity = 0.8
          sphere.scale.setScalar(1)
        })
      }
    }

    const onMouseClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(spheres)

      if (intersects.length > 0) {
        const intersected = intersects[0].object as THREE.Mesh
        const point = intersected.userData.point as DataPoint3D
        setSelectedPoint(point)
        onDataPointClick?.(point)
      }
    }

    renderer.domElement.addEventListener('mousemove', onMouseMove)
    renderer.domElement.addEventListener('click', onMouseClick)

    // Animation loop
    const animate = () => {
      if (!isPlaying) return

      // Rotate camera around the scene
      const time = Date.now() * 0.001 * rotationSpeed[0]
      camera.position.x = Math.cos(time) * zoom[0]
      camera.position.z = Math.sin(time) * zoom[0]
      camera.lookAt(0, 0, 0)

      // Animate data points
      spheres.forEach((sphere, index) => {
        const point = sphere.userData.point as DataPoint3D
        sphere.position.y = point.y + Math.sin(time + index * 0.1) * 0.5
        sphere.rotation.y += 0.01
      })

      renderer.render(scene, camera)
      animationIdRef.current = requestAnimationFrame(animate)
    }

    if (isPlaying) {
      animate()
    }

    // Cleanup
    return () => {
      renderer.domElement.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('click', onMouseClick)
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [data, isPlaying, zoom, rotationSpeed])

  // Update camera zoom
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.position.setLength(zoom[0])
    }
  }, [zoom])

  // Render single frame when not animated
  useEffect(() => {
    if (!isPlaying && rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current)
    }
  }, [isPlaying, showGrid, showLabels])

  const resetCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.position.set(15, 15, 15)
      cameraRef.current.lookAt(0, 0, 0)
      setZoom([15])
    }
  }

  return (
    <div className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-background p-6' : ''}`}>
      {/* Header */}
      <motion.div
        className="flex items-center justify-between p-4 bg-black/20 rounded-lg border border-white/10 backdrop-blur-sm"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center space-x-3">
          <Activity className="h-5 w-5 text-cyan-400 animate-pulse" />
          <h3 className="text-lg font-semibold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            {title}
          </h3>
          <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-400">
            {data.length} DATA POINTS
          </Badge>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsPlaying(!isPlaying)}
            className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={resetCamera}
            className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/20"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="text-white hover:text-cyan-300 hover:bg-white/10"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 3D Visualization */}
        <motion.div
          className="lg:col-span-3"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="relative overflow-hidden bg-black/40 border-cyan-500/30 shadow-lg shadow-cyan-500/20">
            <CardContent className="p-0">
              <div
                ref={mountRef}
                className="w-full h-[600px] relative"
                style={{ background: 'radial-gradient(circle, #001122 0%, #000000 100%)' }}
              />
              
              {/* Floating Info Panel */}
              <AnimatePresence>
                {(hoverPoint || selectedPoint) && (
                  <motion.div
                    className="absolute top-4 left-4 bg-black/90 border border-cyan-500/30 rounded-lg p-4 backdrop-blur-sm max-w-64"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    {(hoverPoint || selectedPoint) && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: (hoverPoint || selectedPoint)?.color }}
                          />
                          <span className="text-white font-medium text-sm">
                            {(hoverPoint || selectedPoint)?.category}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {(hoverPoint || selectedPoint)?.label}
                        </p>
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Value:</span>
                            <span className="text-cyan-400">
                              {(hoverPoint || selectedPoint)?.value.toFixed(1)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Position:</span>
                            <span className="text-cyan-400 font-mono">
                              ({(hoverPoint || selectedPoint)?.x.toFixed(1)}, {(hoverPoint || selectedPoint)?.y.toFixed(1)}, {(hoverPoint || selectedPoint)?.z.toFixed(1)})
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>

        {/* Controls Panel */}
        {showControls && (
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card className="bg-black/40 border-purple-500/30">
              <CardHeader>
                <CardTitle className="text-purple-400 text-sm flex items-center space-x-2">
                  <Settings className="h-4 w-4" />
                  <span>3D Controls</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">
                    Camera Zoom
                  </label>
                  <Slider
                    value={zoom}
                    onValueChange={setZoom}
                    min={5}
                    max={30}
                    step={1}
                    className="w-full"
                  />
                  <div className="text-xs text-cyan-400 mt-1 font-mono">
                    {zoom[0].toFixed(1)}x
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">
                    Rotation Speed
                  </label>
                  <Slider
                    value={rotationSpeed}
                    onValueChange={setRotationSpeed}
                    min={0}
                    max={3}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="text-xs text-cyan-400 mt-1 font-mono">
                    {rotationSpeed[0].toFixed(1)}x
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Show Grid</span>
                  <Switch checked={showGrid} onCheckedChange={setShowGrid} />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Show Labels</span>
                  <Switch checked={showLabels} onCheckedChange={setShowLabels} />
                </div>
              </CardContent>
            </Card>

            {/* Legend */}
            <Card className="bg-black/40 border-emerald-500/30">
              <CardHeader>
                <CardTitle className="text-emerald-400 text-sm">Legend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {['Performance', 'Security', 'Quality', 'Maintainability'].map((category, index) => {
                    const colors = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b']
                    return (
                      <div key={category} className="flex items-center space-x-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: colors[index] }}
                        />
                        <span className="text-xs text-white">{category}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card className="bg-black/40 border-amber-500/30">
              <CardHeader>
                <CardTitle className="text-amber-400 text-sm">Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Points:</span>
                    <span className="text-white font-mono">{data.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Value:</span>
                    <span className="text-amber-400 font-mono">
                      {(data.reduce((sum, p) => sum + p.value, 0) / data.length).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Value:</span>
                    <span className="text-amber-400 font-mono">
                      {Math.max(...data.map(p => p.value)).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Min Value:</span>
                    <span className="text-amber-400 font-mono">
                      {Math.min(...data.map(p => p.value)).toFixed(1)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  )
}