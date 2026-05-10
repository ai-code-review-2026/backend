"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  BarChart3, 
  TrendingUp, 
  Activity, 
  Settings, 
  Download,
  RefreshCw,
  Maximize2,
  Minimize2,
  Filter,
  Calendar,
  Users,
  Zap,
  Database,
  Eye,
  EyeOff,
  Play,
  Pause,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { AdvancedQuantumStatistics } from "@/components/statistics/AdvancedQuantumStatistics"
import { Statistics3DVisualizer } from "@/components/statistics/Statistics3DVisualizer"
import { AnimatedMetricsDashboard } from "@/components/statistics/AnimatedMetricsDashboard"
import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider"
import { fetchDashboardStatistics, type DashboardStatistics } from "@/lib/dashboard-statistics"

interface StatisticsPageProps {
  initialData?: any
}

export function StatisticsPage({ initialData }: StatisticsPageProps) {
  const { user } = useDashboardUser()
  const [activeTab, setActiveTab] = useState("overview")
  const [timeRange, setTimeRange] = useState("7d")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState([30])
  const [showAnimations, setShowAnimations] = useState(true)
  const [compactView, setCompactView] = useState(false)
  const [show3D, setShow3D] = useState(true)
  const [statistics, setStatistics] = useState<DashboardStatistics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  // Load statistics data
  useEffect(() => {
    const loadStatistics = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const stats = await fetchDashboardStatistics({ 
          force: true,
          size: timeRange === "24h" ? 50 : timeRange === "7d" ? 100 : 200
        })
        setStatistics(stats)
        setLastUpdate(new Date())
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load statistics")
      } finally {
        setIsLoading(false)
      }
    }

    loadStatistics()
  }, [timeRange])

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(async () => {
      try {
        const stats = await fetchDashboardStatistics({ 
          force: true,
          size: timeRange === "24h" ? 50 : timeRange === "7d" ? 100 : 200
        })
        setStatistics(stats)
        setLastUpdate(new Date())
      } catch (err) {
        console.error("Auto-refresh failed:", err)
      }
    }, refreshInterval[0] * 1000)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, timeRange])

  const handleExport = (format: 'png' | 'pdf' | 'json') => {
    // Implementation for exporting statistics data
    console.log(`Exporting statistics as ${format}`)
    // In a real implementation, this would generate and download the file
  }

  const exportOptions = [
    { value: 'png', label: 'PNG Image', description: 'High-resolution chart images' },
    { value: 'pdf', label: 'PDF Report', description: 'Complete statistics report' },
    { value: 'json', label: 'JSON Data', description: 'Raw statistics data' },
  ]

  const tabVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5, ease: "easeInOut" }
    },
    exit: { 
      opacity: 0, 
      y: -20,
      transition: { duration: 0.3 }
    }
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br from-black via-gray-900 to-black ${isFullscreen ? 'fixed inset-0 z-50 p-6 overflow-auto' : 'p-6'}`}>
      {/* Header */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between p-6 bg-gradient-to-r from-black/60 via-black/80 to-black/60 rounded-lg border border-white/10 backdrop-blur-sm">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-lg shadow-lg shadow-cyan-500/25">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                  Quantum Analytics Dashboard
                </h1>
                <p className="text-muted-foreground">
                  Advanced statistical analysis and real-time monitoring
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Badge 
                variant="secondary" 
                className={`animate-pulse ${autoRefresh ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}
              >
                {autoRefresh ? '🔴 LIVE' : '⏸️ PAUSED'}
              </Badge>
              {lastUpdate && (
                <Badge variant="outline" className="text-xs font-mono">
                  Updated {lastUpdate.toLocaleTimeString()}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Time Range Selector */}
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32 bg-black/20 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>

            {/* Settings Dialog */}
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-gray-400 hover:text-white hover:bg-white/10"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-black/90 border-white/20">
                <DialogHeader>
                  <DialogTitle className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                    Dashboard Settings
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="auto-refresh">Auto Refresh</Label>
                      <Switch
                        id="auto-refresh"
                        checked={autoRefresh}
                        onCheckedChange={setAutoRefresh}
                      />
                    </div>
                    
                    {autoRefresh && (
                      <div className="space-y-2">
                        <Label>Refresh Interval (seconds)</Label>
                        <Slider
                          value={refreshInterval}
                          onValueChange={setRefreshInterval}
                          min={5}
                          max={300}
                          step={5}
                          className="w-full"
                        />
                        <div className="text-xs text-cyan-400 text-center font-mono">
                          {refreshInterval[0]}s
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="animations">Enable Animations</Label>
                      <Switch
                        id="animations"
                        checked={showAnimations}
                        onCheckedChange={setShowAnimations}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Label htmlFor="compact">Compact View</Label>
                      <Switch
                        id="compact"
                        checked={compactView}
                        onCheckedChange={setCompactView}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Label htmlFor="show-3d">3D Visualizations</Label>
                      <Switch
                        id="show-3d"
                        checked={show3D}
                        onCheckedChange={setShow3D}
                      />
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Export Dialog */}
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/20"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-black/90 border-white/20">
                <DialogHeader>
                  <DialogTitle className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                    Export Analytics Data
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {exportOptions.map((option) => (
                    <Card
                      key={option.value}
                      className="cursor-pointer hover:bg-white/5 transition-colors bg-black/40 border-white/10"
                      onClick={() => handleExport(option.value as 'png' | 'pdf' | 'json')}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-white">{option.label}</h4>
                            <p className="text-sm text-muted-foreground">{option.description}</p>
                          </div>
                          <Download className="h-5 w-5 text-purple-400" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

            {/* Fullscreen Toggle */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="text-white hover:text-cyan-300 hover:bg-white/10"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <TabsList className="grid w-full grid-cols-4 bg-black/40 border border-white/10 backdrop-blur-sm">
            <TabsTrigger 
              value="overview"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:text-white data-[state=active]:border-cyan-500/30"
            >
              <Activity className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="metrics"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500/20 data-[state=active]:to-emerald-500/20 data-[state=active]:text-white data-[state=active]:border-purple-500/30"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Real-time Metrics
            </TabsTrigger>
            <TabsTrigger 
              value="advanced"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500/20 data-[state=active]:to-amber-500/20 data-[state=active]:text-white data-[state=active]:border-emerald-500/30"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Advanced Charts
            </TabsTrigger>
            <TabsTrigger 
              value="3d"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/20 data-[state=active]:to-red-500/20 data-[state=active]:text-white data-[state=active]:border-amber-500/30"
              disabled={!show3D}
            >
              <Zap className="h-4 w-4 mr-2" />
              3D Visualization
            </TabsTrigger>
          </TabsList>
        </motion.div>

        <AnimatePresence mode="wait">
          <TabsContent key={activeTab} value="overview" className="space-y-6">
            <motion.div
              variants={tabVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <AdvancedQuantumStatistics
                data={statistics}
                isLoading={isLoading}
                error={error}
                realTimeEnabled={autoRefresh}
                onExport={handleExport}
              />
            </motion.div>
          </TabsContent>

          <TabsContent key={`${activeTab}-metrics`} value="metrics" className="space-y-6">
            <motion.div
              variants={tabVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <AnimatedMetricsDashboard
                updateInterval={refreshInterval[0] * 1000}
                showSparklines={!compactView}
                enableAnimations={showAnimations}
                compactView={compactView}
              />
            </motion.div>
          </TabsContent>

          <TabsContent key={`${activeTab}-advanced`} value="advanced" className="space-y-6">
            <motion.div
              variants={tabVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <AdvancedQuantumStatistics
                data={statistics}
                isLoading={isLoading}
                error={error}
                realTimeEnabled={autoRefresh}
                onExport={handleExport}
              />
            </motion.div>
          </TabsContent>

          {show3D && (
            <TabsContent key={`${activeTab}-3d`} value="3d" className="space-y-6">
              <motion.div
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Statistics3DVisualizer
                  title="3D Code Quality Analysis"
                  isAnimated={showAnimations}
                  showControls={true}
                  onDataPointClick={(point) => {
                    console.log("Clicked 3D data point:", point)
                  }}
                />
              </motion.div>
            </TabsContent>
          )}
        </AnimatePresence>
      </Tabs>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-purple-500/30 border-b-purple-500 rounded-full animate-spin-reverse"></div>
              </div>
              <div>
                <p className="text-lg font-semibold text-cyan-400 animate-pulse">
                  Quantum Data Processing
                </p>
                <p className="text-sm text-muted-foreground">
                  Analyzing neural network patterns...
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}