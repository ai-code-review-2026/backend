"use client"

import React, { useMemo, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  Legend,
  ComposedChart,
  Scatter,
  ScatterChart,
  Treemap,
  Sankey,
} from "recharts"
import * as d3 from "d3"
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Shield,
  Target,
  BarChart3,
  PieChart as PieChartIcon,
  GitCommit,
  Users,
  Clock,
  Cpu,
  Brain,
  Sparkles,
  Settings,
  Filter,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  ArrowUpDown,
  Calendar,
  Code,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { StatCard } from "@/components/ui/stat-card"

// Types for advanced statistics
interface QuantumMetrics {
  averageScore: number
  criticalErrors: number
  warnings: number
  completedAnalyses: number
  totalAnalyses: number
  codeQuality: number
  securityIndex: number
  performanceScore: number
  maintainabilityIndex: number
  trends: {
    scoreTrend: string
    scoreTrendUp: boolean
    errorsTrend: string
    errorsTrendUp: boolean
    warningsTrend: string
    warningsTrendUp: boolean
    completionTrend: string
    completionTrendUp: boolean
  }
}

interface TimeSeriesData {
  timestamp: string
  date: string
  score: number
  errors: number
  warnings: number
  commits: number
  performance: number
  security: number
  maintainability: number
  velocity: number
}

interface DistributionData {
  name: string
  value: number
  percentage: number
  color: string
  gradient: string
  icon: React.ComponentType<any>
}

interface HeatmapData {
  day: string
  hour: number
  value: number
  intensity: number
}

interface NetworkData {
  nodes: Array<{
    id: string
    name: string
    group: string
    value: number
    color: string
  }>
  links: Array<{
    source: string
    target: string
    value: number
    color: string
  }>
}

interface QuantumStatisticsProps {
  data?: any
  isLoading?: boolean
  error?: string | null
  realTimeEnabled?: boolean
  onExport?: (format: 'png' | 'pdf' | 'json') => void
}

// Advanced Chart Components

function QuantumGlowCard({ children, className = "", glowColor = "cyan" }: { 
  children: React.ReactNode
  className?: string 
  glowColor?: "cyan" | "purple" | "green" | "red" | "amber"
}) {
  const glowColors = {
    cyan: "shadow-cyan-500/30 border-cyan-500/30",
    purple: "shadow-purple-500/30 border-purple-500/30", 
    green: "shadow-emerald-500/30 border-emerald-500/30",
    red: "shadow-red-500/30 border-red-500/30",
    amber: "shadow-amber-500/30 border-amber-500/30"
  }
  
  return (
    <motion.div
      className={`relative ${className}`}
      whileHover={{ scale: 1.01, y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <Card className={`relative overflow-hidden border bg-black/40 backdrop-blur-sm ${glowColors[glowColor]}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/0" />
        <div className={`absolute -inset-0.5 bg-gradient-to-r from-${glowColor}-600 to-purple-600 rounded-lg blur opacity-20`} />
        <div className="relative">
          {children}
        </div>
      </Card>
    </motion.div>
  )
}

function QuantumAreaChart({ data, height = 300 }: { data: TimeSeriesData[], height?: number }) {
  const gradientId = `areaGradient-${Math.random().toString(36).substr(2, 9)}`
  
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.8} />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.2} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} />
        <XAxis 
          dataKey="date" 
          stroke="#9ca3af" 
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis 
          stroke="#9ca3af" 
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              return (
                <div className="bg-black/90 border border-cyan-500/30 rounded-lg p-4 backdrop-blur-sm">
                  <p className="text-cyan-400 font-mono text-sm mb-2">{label}</p>
                  {payload.map((entry, index) => (
                    <p key={index} className="text-white text-sm">
                      <span className="text-muted-foreground">Score:</span> {entry.value}
                    </p>
                  ))}
                </div>
              )
            }
            return null
          }}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke="#06b6d4"
          strokeWidth={3}
          fill={`url(#${gradientId})`}
          dot={{ fill: "#06b6d4", strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, stroke: "#06b6d4", strokeWidth: 2, fill: "#ffffff" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function QuantumRadialChart({ data }: { data: DistributionData[] }) {
  const RADIAN = Math.PI / 180
  
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        className="font-mono text-xs"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderCustomizedLabel}
          outerRadius={100}
          innerRadius={40}
          fill="#8884d8"
          dataKey="value"
          animationBegin={0}
          animationDuration={1200}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const data = payload[0].payload as DistributionData
              const Icon = data.icon
              return (
                <div className="bg-black/90 border border-purple-500/30 rounded-lg p-4 backdrop-blur-sm">
                  <div className="flex items-center space-x-2 mb-2">
                    <Icon className="h-4 w-4 text-purple-400" />
                    <span className="text-white font-medium">{data.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Value: <span className="text-white">{data.value}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Percentage: <span className="text-purple-400">{data.percentage}%</span>
                  </p>
                </div>
              )
            }
            return null
          }}
        />
        <Legend 
          verticalAlign="bottom" 
          height={36}
          formatter={(value, entry) => (
            <span className="text-white text-sm">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

function QuantumBarChart({ data, height = 300 }: { data: any[], height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <defs>
          <linearGradient id="barGradient1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.3} />
          </linearGradient>
          <linearGradient id="barGradient2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} />
        <XAxis 
          dataKey="day" 
          stroke="#9ca3af" 
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis 
          stroke="#9ca3af" 
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              return (
                <div className="bg-black/90 border border-emerald-500/30 rounded-lg p-4 backdrop-blur-sm">
                  <p className="text-emerald-400 font-mono text-sm mb-2">{label}</p>
                  {payload.map((entry, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-muted-foreground">{entry.dataKey}:</span>
                      <span className="text-white font-medium">{entry.value}</span>
                    </div>
                  ))}
                </div>
              )
            }
            return null
          }}
        />
        <Bar 
          dataKey="issues" 
          fill="url(#barGradient1)" 
          radius={[4, 4, 0, 0]}
          animationBegin={0}
          animationDuration={1000}
        />
        <Bar 
          dataKey="resolved" 
          fill="url(#barGradient2)" 
          radius={[4, 4, 0, 0]}
          animationBegin={200}
          animationDuration={1000}
        />
        <Line 
          type="monotone" 
          dataKey="velocity" 
          stroke="#10b981" 
          strokeWidth={3}
          dot={{ fill: "#10b981", r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function QuantumHeatmap({ data }: { data: HeatmapData[] }) {
  const [hoveredCell, setHoveredCell] = useState<HeatmapData | null>(null)
  
  const maxValue = Math.max(...data.map(d => d.value))
  const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([0, maxValue])
  
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const hours = Array.from({ length: 24 }, (_, i) => i)
  
  return (
    <div className="relative">
      <svg width="100%" height="400" className="overflow-visible">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Y-axis labels (days) */}
        {days.map((day, dayIndex) => (
          <text
            key={day}
            x="40"
            y={60 + dayIndex * 40}
            fill="#9ca3af"
            fontSize="12"
            textAnchor="end"
            className="font-mono"
          >
            {day}
          </text>
        ))}
        
        {/* X-axis labels (hours) */}
        {hours.filter(h => h % 4 === 0).map((hour) => (
          <text
            key={hour}
            x={60 + hour * 15}
            y="30"
            fill="#9ca3af"
            fontSize="10"
            textAnchor="middle"
            className="font-mono"
          >
            {hour.toString().padStart(2, '0')}
          </text>
        ))}
        
        {/* Heatmap cells */}
        {data.map((cell, index) => {
          const dayIndex = days.indexOf(cell.day)
          const x = 50 + cell.hour * 15
          const y = 40 + dayIndex * 40
          
          return (
            <motion.rect
              key={index}
              x={x}
              y={y}
              width="14"
              height="38"
              fill={colorScale(cell.value)}
              rx="2"
              className="cursor-pointer"
              style={{ filter: hoveredCell === cell ? 'url(#glow)' : undefined }}
              onMouseEnter={() => setHoveredCell(cell)}
              onMouseLeave={() => setHoveredCell(null)}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.01, duration: 0.3 }}
              whileHover={{ scale: 1.1, z: 10 }}
            />
          )
        })}
      </svg>
      
      {hoveredCell && (
        <motion.div
          className="absolute bg-black/90 border border-cyan-500/30 rounded-lg p-3 backdrop-blur-sm pointer-events-none z-10"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          style={{
            left: 60 + hoveredCell.hour * 15,
            top: 40 + days.indexOf(hoveredCell.day) * 40 - 60,
          }}
        >
          <p className="text-cyan-400 font-mono text-sm">
            {hoveredCell.day} {hoveredCell.hour.toString().padStart(2, '0')}:00
          </p>
          <p className="text-white text-sm">
            Activity: {hoveredCell.value}
          </p>
          <p className="text-sm text-muted-foreground">
            Intensity: {(hoveredCell.intensity * 100).toFixed(1)}%
          </p>
        </motion.div>
      )}
    </div>
  )
}

function QuantumMetricsDashboard({ metrics }: { metrics: QuantumMetrics }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <StatCard
          title="Quantum Score"
          value={metrics.averageScore}
          icon={Zap}
          iconColor="cyan"
          suffix="/100"
          trend={{
            value: parseFloat(metrics.trends.scoreTrend.replace(/[^\d.-]/g, '')) || 0,
            isPositive: metrics.trends.scoreTrendUp,
          }}
          variant="gradient"
          className="relative overflow-hidden"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <StatCard
          title="Critical Errors"
          value={metrics.criticalErrors}
          icon={Shield}
          iconColor="red"
          trend={{
            value: parseInt(metrics.trends.errorsTrend.replace(/[^\d-]/g, '')) || 0,
            isPositive: !metrics.trends.errorsTrendUp, // Inverted for errors
          }}
          variant="elevated"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <StatCard
          title="Security Index"
          value={metrics.securityIndex || 85}
          icon={Target}
          iconColor="green"
          suffix="/100"
          trend={{
            value: 12,
            isPositive: true,
          }}
          variant="elevated"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <StatCard
          title="Performance"
          value={metrics.performanceScore || 92}
          icon={Activity}
          iconColor="amber"
          suffix="/100"
          trend={{
            value: 8,
            isPositive: true,
          }}
          variant="elevated"
        />
      </motion.div>
    </div>
  )
}

// Main Component
export function AdvancedQuantumStatistics({
  data,
  isLoading = false,
  error = null,
  realTimeEnabled = true,
  onExport,
}: QuantumStatisticsProps) {
  const [activeView, setActiveView] = useState<"overview" | "trends" | "distribution" | "heatmap" | "network">("overview")
  const [timeRange, setTimeRange] = useState("7d")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [animationsEnabled, setAnimationsEnabled] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(realTimeEnabled)

  // Mock data generation for demo
  const mockMetrics: QuantumMetrics = useMemo(() => ({
    averageScore: 87,
    criticalErrors: 12,
    warnings: 34,
    completedAnalyses: 156,
    totalAnalyses: 178,
    codeQuality: 91,
    securityIndex: 85,
    performanceScore: 92,
    maintainabilityIndex: 88,
    trends: {
      scoreTrend: "+5.2%",
      scoreTrendUp: true,
      errorsTrend: "-8",
      errorsTrendUp: true,
      warningsTrend: "-15",
      warningsTrendUp: true,
      completionTrend: "97%",
      completionTrendUp: true,
    },
  }), [])

  const mockTimeSeriesData: TimeSeriesData[] = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (29 - i))
      return {
        timestamp: date.toISOString(),
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        score: 70 + Math.random() * 30,
        errors: Math.floor(Math.random() * 20),
        warnings: Math.floor(Math.random() * 50),
        commits: Math.floor(Math.random() * 15),
        performance: 60 + Math.random() * 40,
        security: 70 + Math.random() * 30,
        maintainability: 65 + Math.random() * 35,
        velocity: Math.random() * 100,
      }
    })
  }, [])

  const mockDistributionData: DistributionData[] = useMemo(() => [
    { name: "Critical", value: 12, percentage: 15, color: "#ef4444", gradient: "from-red-500 to-red-700", icon: Shield },
    { name: "High", value: 28, percentage: 35, color: "#f97316", gradient: "from-orange-500 to-orange-700", icon: AlertTriangle },
    { name: "Medium", value: 25, percentage: 31, color: "#eab308", gradient: "from-yellow-500 to-yellow-700", icon: Clock },
    { name: "Low", value: 15, percentage: 19, color: "#22c55e", gradient: "from-green-500 to-green-700", icon: CheckCircle2 },
  ], [])

  const mockHeatmapData: HeatmapData[] = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const data: HeatmapData[] = []
    
    days.forEach(day => {
      for (let hour = 0; hour < 24; hour++) {
        data.push({
          day,
          hour,
          value: Math.floor(Math.random() * 100),
          intensity: Math.random(),
        })
      }
    })
    
    return data
  }, [])

  const weeklyActivityData = useMemo(() => [
    { day: "Mon", issues: 25, resolved: 20, velocity: 80 },
    { day: "Tue", issues: 32, resolved: 28, velocity: 87 },
    { day: "Wed", issues: 18, resolved: 15, velocity: 83 },
    { day: "Thu", issues: 41, resolved: 35, velocity: 85 },
    { day: "Fri", issues: 29, resolved: 25, velocity: 86 },
    { day: "Sat", issues: 12, resolved: 8, velocity: 67 },
    { day: "Sun", issues: 8, resolved: 6, velocity: 75 },
  ], [])

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      // In a real implementation, this would refetch data
      console.log("Auto-refreshing statistics...")
    }, 10000)
    
    return () => clearInterval(interval)
  }, [autoRefresh])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 w-16 h-16 border-4 border-purple-500/30 border-b-purple-500 rounded-full animate-spin-reverse"></div>
          </div>
          <p className="text-lg font-mono text-cyan-400">Quantum Data Processing...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto animate-pulse" />
          <p className="text-lg font-medium text-red-400">Neural Network Error</p>
          <p className="text-sm text-muted-foreground max-w-md">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${isFullscreen ? 'fixed inset-0 z-50 bg-background p-6 overflow-auto' : ''}`}>
      {/* Header Controls */}
      <motion.div
        className="flex items-center justify-between p-4 bg-black/20 rounded-lg border border-white/10 backdrop-blur-sm"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-cyan-400 animate-pulse" />
            <h2 className="text-xl font-semibold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Quantum Analytics Core
            </h2>
          </div>
          
          <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 animate-pulse">
            NEURAL SYNC ACTIVE
          </Badge>
        </div>

        <div className="flex items-center space-x-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32 bg-black/20 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center space-x-2">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <span className="text-sm text-muted-foreground">Auto-sync</span>
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          {onExport && (
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/20">
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-black/90 border-white/20">
                <DialogHeader>
                  <DialogTitle className="text-transparent bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text">
                    Export Quantum Data
                  </DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-3 gap-2">
                  <Button onClick={() => onExport('png')} variant="outline" size="sm">PNG</Button>
                  <Button onClick={() => onExport('pdf')} variant="outline" size="sm">PDF</Button>
                  <Button onClick={() => onExport('json')} variant="outline" size="sm">JSON</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </motion.div>

      {/* Main Metrics Dashboard */}
      <QuantumMetricsDashboard metrics={mockMetrics} />

      {/* Tabbed Views */}
      <Tabs value={activeView} onValueChange={(value: any) => setActiveView(value)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 bg-black/20 border border-white/10">
          <TabsTrigger value="overview" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
            Overview
          </TabsTrigger>
          <TabsTrigger value="trends" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
            Trends
          </TabsTrigger>
          <TabsTrigger value="distribution" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
            Distribution
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
            Heatmap
          </TabsTrigger>
          <TabsTrigger value="network" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">
            Network
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <QuantumGlowCard glowColor="cyan">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="h-5 w-5 text-cyan-400" />
                  <span>Quantum Trend Analysis</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <QuantumAreaChart data={mockTimeSeriesData} />
              </CardContent>
            </QuantumGlowCard>

            <QuantumGlowCard glowColor="purple">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 text-purple-400" />
                  <span>Weekly Neural Activity</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <QuantumBarChart data={weeklyActivityData} />
              </CardContent>
            </QuantumGlowCard>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <QuantumGlowCard glowColor="cyan">
            <CardHeader>
              <CardTitle>Multi-Dimensional Trend Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <QuantumAreaChart data={mockTimeSeriesData} height={400} />
            </CardContent>
          </QuantumGlowCard>
        </TabsContent>

        <TabsContent value="distribution" className="space-y-6">
          <QuantumGlowCard glowColor="purple">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <PieChartIcon className="h-5 w-5 text-purple-400" />
                <span>Quantum Distribution Matrix</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QuantumRadialChart data={mockDistributionData} />
            </CardContent>
          </QuantumGlowCard>
        </TabsContent>

        <TabsContent value="heatmap" className="space-y-6">
          <QuantumGlowCard glowColor="amber">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-amber-400" />
                <span>Neural Activity Heatmap</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QuantumHeatmap data={mockHeatmapData} />
            </CardContent>
          </QuantumGlowCard>
        </TabsContent>

        <TabsContent value="network" className="space-y-6">
          <QuantumGlowCard glowColor="red">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-red-400" />
                <span>Quantum Network Topology</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-64">
                <div className="text-center space-y-2">
                  <Brain className="h-12 w-12 text-red-400 animate-pulse mx-auto" />
                  <p className="text-red-400 font-mono">Neural Network Visualization</p>
                  <p className="text-sm text-muted-foreground">Advanced 3D topology coming soon...</p>
                </div>
              </div>
            </CardContent>
          </QuantumGlowCard>
        </TabsContent>
      </Tabs>
    </div>
  )
}