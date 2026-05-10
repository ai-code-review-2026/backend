"use client"

import React, { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  RadialBarChart,
  RadialBar,
  ComposedChart,
  Scatter,
  ScatterChart,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Shield,
  Target,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code,
  Users,
  GitCommit,
  Bug,
  Sparkles,
  Brain,
  Cpu,
  Database,
  Network,
  Eye,
  EyeOff,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { StatCard } from "@/components/ui/stat-card"

// Types for animated metrics
interface AnimatedMetric {
  id: string
  label: string
  value: number
  previousValue: number
  target: number
  unit: string
  color: string
  icon: React.ComponentType<any>
  trend: {
    direction: 'up' | 'down' | 'neutral'
    percentage: number
    isGood: boolean
  }
  sparklineData: Array<{ x: number; y: number }>
  category: 'performance' | 'security' | 'quality' | 'productivity'
}

interface RealTimeDataPoint {
  timestamp: string
  score: number
  errors: number
  warnings: number
  commits: number
  performance: number
  security: number
  coverage: number
  complexity: number
  velocity: number
}

interface AnimatedMetricsDashboardProps {
  data?: RealTimeDataPoint[]
  updateInterval?: number
  showSparklines?: boolean
  enableAnimations?: boolean
  compactView?: boolean
}

// Utility functions for data processing
function generateRealTimeData(count: number = 24): RealTimeDataPoint[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const timestamp = new Date(now.getTime() - (count - 1 - i) * 60 * 60 * 1000)
    return {
      timestamp: timestamp.toISOString(),
      score: 70 + Math.random() * 30,
      errors: Math.floor(Math.random() * 25),
      warnings: Math.floor(Math.random() * 50),
      commits: Math.floor(Math.random() * 20),
      performance: 60 + Math.random() * 40,
      security: 70 + Math.random() * 30,
      coverage: 80 + Math.random() * 20,
      complexity: 1 + Math.random() * 9,
      velocity: Math.random() * 100,
    }
  })
}

function calculateTrend(current: number, previous: number): {
  direction: 'up' | 'down' | 'neutral'
  percentage: number
  isGood: boolean
} {
  const diff = current - previous
  const percentage = previous === 0 ? 0 : Math.abs(diff / previous) * 100
  
  if (Math.abs(diff) < 0.01) {
    return { direction: 'neutral', percentage: 0, isGood: true }
  }
  
  return {
    direction: diff > 0 ? 'up' : 'down',
    percentage: Math.round(percentage * 10) / 10,
    isGood: diff > 0, // This can be inverted for metrics like errors
  }
}

// Animated components
function AnimatedNumber({ 
  value, 
  duration = 2000, 
  decimals = 0,
  prefix = "",
  suffix = "",
  className = ""
}: {
  value: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
}) {
  const [displayValue, setDisplayValue] = useState(0)
  
  useEffect(() => {
    let startTime: number
    let animationId: number
    
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)
      
      const easeOutCubic = 1 - Math.pow(1 - progress, 3)
      const currentValue = displayValue + (value - displayValue) * easeOutCubic
      
      setDisplayValue(currentValue)
      
      if (progress < 1) {
        animationId = requestAnimationFrame(animate)
      }
    }
    
    animationId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationId)
  }, [value, duration, displayValue])
  
  return (
    <span className={className}>
      {prefix}{displayValue.toFixed(decimals)}{suffix}
    </span>
  )
}

function AnimatedProgressRing({ 
  value, 
  maxValue = 100, 
  size = 120, 
  strokeWidth = 8,
  color = "#06b6d4",
  backgroundColor = "#374151",
  animated = true,
  showValue = true,
  className = ""
}: {
  value: number
  maxValue?: number
  size?: number
  strokeWidth?: number
  color?: string
  backgroundColor?: string
  animated?: boolean
  showValue?: boolean
  className?: string
}) {
  const normalizedRadius = (size - strokeWidth * 2) / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDasharray = `${circumference} ${circumference}`
  const percentage = (value / maxValue) * 100
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        height={size}
        width={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          stroke={backgroundColor}
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <motion.circle
          stroke={color}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={animated ? strokeDashoffset : 0}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
          style={{
            filter: `drop-shadow(0 0 8px ${color}66)`,
          }}
          initial={animated ? { strokeDashoffset: circumference } : {}}
          animate={animated ? { strokeDashoffset } : {}}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              <AnimatedNumber value={value} decimals={0} />
            </div>
            <div className="text-xs text-muted-foreground">/ {maxValue}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricSparkline({ 
  data, 
  color = "#06b6d4", 
  height = 40,
  className = ""
}: {
  data: Array<{ x: number; y: number }>
  color?: string
  height?: number
  className?: string
}) {
  const maxY = Math.max(...data.map(d => d.y))
  const minY = Math.min(...data.map(d => d.y))
  const range = maxY - minY
  
  if (data.length === 0 || range === 0) {
    return <div className={`h-${height} ${className}`} />
  }
  
  const pathData = data.map((point, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = 100 - ((point.y - minY) / range) * 100
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')
  
  return (
    <div className={`w-full ${className}`} style={{ height: `${height}px` }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`sparkline-gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.8} />
            <stop offset="100%" stopColor={color} stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <motion.path
          d={`${pathData} L 100 100 L 0 100 Z`}
          fill={`url(#sparkline-gradient-${color})`}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />
        <motion.path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />
      </svg>
    </div>
  )
}

function AdvancedMetricCard({ 
  metric, 
  showSparkline = true, 
  compact = false,
  animated = true 
}: {
  metric: AnimatedMetric
  showSparkline?: boolean
  compact?: boolean
  animated?: boolean
}) {
  const Icon = metric.icon
  const TrendIcon = metric.trend.direction === 'up' ? TrendingUp : 
                   metric.trend.direction === 'down' ? TrendingDown : 
                   Activity
  
  return (
    <motion.div
      initial={animated ? { opacity: 0, y: 20 } : {}}
      animate={animated ? { opacity: 1, y: 0 } : {}}
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <Card className="relative overflow-hidden bg-black/40 backdrop-blur-sm border-white/10 hover:border-white/20 transition-all duration-300">
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            background: `linear-gradient(135deg, ${metric.color}20 0%, transparent 70%)`,
          }}
        />
        
        <CardContent className="relative p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div 
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${metric.color}20` }}
              >
                <Icon className="h-5 w-5" style={{ color: metric.color }} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {metric.label}
                </h3>
                <Badge 
                  variant="secondary" 
                  className="mt-1 text-xs"
                  style={{ 
                    backgroundColor: `${metric.color}20`,
                    color: metric.color,
                    border: `1px solid ${metric.color}30`,
                  }}
                >
                  {metric.category.toUpperCase()}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center space-x-1 text-sm">
              <TrendIcon 
                className={`h-4 w-4 ${
                  metric.trend.isGood ? 'text-emerald-400' : 'text-red-400'
                }`}
              />
              <span 
                className={`font-medium ${
                  metric.trend.isGood ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {metric.trend.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
          
          <div className="mb-4">
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-bold text-white">
                <AnimatedNumber 
                  value={metric.value} 
                  decimals={metric.unit === '%' ? 1 : 0}
                />
              </span>
              <span className="text-lg text-muted-foreground">
                {metric.unit}
              </span>
            </div>
            
            {metric.target && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Target: {metric.target}{metric.unit}</span>
                  <span>{Math.round((metric.value / metric.target) * 100)}%</span>
                </div>
                <Progress 
                  value={(metric.value / metric.target) * 100}
                  className="h-2"
                />
              </div>
            )}
          </div>
          
          {showSparkline && metric.sparklineData.length > 0 && (
            <div className="mb-2">
              <MetricSparkline 
                data={metric.sparklineData}
                color={metric.color}
                height={40}
                className="rounded"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Main component
export function AnimatedMetricsDashboard({
  data = generateRealTimeData(),
  updateInterval = 30000,
  showSparklines = true,
  enableAnimations = true,
  compactView = false,
}: AnimatedMetricsDashboardProps) {
  const [realtimeData, setRealtimeData] = useState(data)
  const [isLive, setIsLive] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  // Generate animated metrics from data
  const animatedMetrics = useMemo((): AnimatedMetric[] => {
    const latest = realtimeData[realtimeData.length - 1]
    const previous = realtimeData[realtimeData.length - 2] || latest
    
    return [
      {
        id: 'quality-score',
        label: 'Quality Score',
        value: latest.score,
        previousValue: previous.score,
        target: 90,
        unit: '',
        color: '#06b6d4',
        icon: Zap,
        trend: calculateTrend(latest.score, previous.score),
        sparklineData: realtimeData.slice(-10).map((d, i) => ({ x: i, y: d.score })),
        category: 'quality',
      },
      {
        id: 'errors',
        label: 'Critical Errors',
        value: latest.errors,
        previousValue: previous.errors,
        target: 0,
        unit: '',
        color: '#ef4444',
        icon: Bug,
        trend: {
          ...calculateTrend(latest.errors, previous.errors),
          isGood: latest.errors <= previous.errors, // Inverted: fewer errors is good
        },
        sparklineData: realtimeData.slice(-10).map((d, i) => ({ x: i, y: d.errors })),
        category: 'quality',
      },
      {
        id: 'security',
        label: 'Security Index',
        value: latest.security,
        previousValue: previous.security,
        target: 95,
        unit: '',
        color: '#10b981',
        icon: Shield,
        trend: calculateTrend(latest.security, previous.security),
        sparklineData: realtimeData.slice(-10).map((d, i) => ({ x: i, y: d.security })),
        category: 'security',
      },
      {
        id: 'performance',
        label: 'Performance',
        value: latest.performance,
        previousValue: previous.performance,
        target: 85,
        unit: '',
        color: '#f59e0b',
        icon: Activity,
        trend: calculateTrend(latest.performance, previous.performance),
        sparklineData: realtimeData.slice(-10).map((d, i) => ({ x: i, y: d.performance })),
        category: 'performance',
      },
      {
        id: 'coverage',
        label: 'Code Coverage',
        value: latest.coverage,
        previousValue: previous.coverage,
        target: 90,
        unit: '%',
        color: '#8b5cf6',
        icon: Target,
        trend: calculateTrend(latest.coverage, previous.coverage),
        sparklineData: realtimeData.slice(-10).map((d, i) => ({ x: i, y: d.coverage })),
        category: 'quality',
      },
      {
        id: 'complexity',
        label: 'Complexity',
        value: latest.complexity,
        previousValue: previous.complexity,
        target: 3,
        unit: '',
        color: '#f97316',
        icon: Network,
        trend: {
          ...calculateTrend(latest.complexity, previous.complexity),
          isGood: latest.complexity <= previous.complexity, // Lower complexity is better
        },
        sparklineData: realtimeData.slice(-10).map((d, i) => ({ x: i, y: d.complexity })),
        category: 'quality',
      },
      {
        id: 'velocity',
        label: 'Team Velocity',
        value: latest.velocity,
        previousValue: previous.velocity,
        target: 80,
        unit: '',
        color: '#06b6d4',
        icon: Users,
        trend: calculateTrend(latest.velocity, previous.velocity),
        sparklineData: realtimeData.slice(-10).map((d, i) => ({ x: i, y: d.velocity })),
        category: 'productivity',
      },
      {
        id: 'commits',
        label: 'Commits/Hour',
        value: latest.commits,
        previousValue: previous.commits,
        target: 15,
        unit: '',
        color: '#22c55e',
        icon: GitCommit,
        trend: calculateTrend(latest.commits, previous.commits),
        sparklineData: realtimeData.slice(-10).map((d, i) => ({ x: i, y: d.commits })),
        category: 'productivity',
      },
    ]
  }, [realtimeData])

  // Auto-update data
  useEffect(() => {
    if (!isLive) return
    
    const interval = setInterval(() => {
      setRealtimeData(prevData => {
        const newPoint: RealTimeDataPoint = {
          timestamp: new Date().toISOString(),
          score: Math.max(0, Math.min(100, prevData[prevData.length - 1].score + (Math.random() - 0.5) * 10)),
          errors: Math.max(0, prevData[prevData.length - 1].errors + Math.floor((Math.random() - 0.5) * 6)),
          warnings: Math.max(0, prevData[prevData.length - 1].warnings + Math.floor((Math.random() - 0.5) * 10)),
          commits: Math.max(0, Math.floor(Math.random() * 20)),
          performance: Math.max(0, Math.min(100, prevData[prevData.length - 1].performance + (Math.random() - 0.5) * 8)),
          security: Math.max(0, Math.min(100, prevData[prevData.length - 1].security + (Math.random() - 0.5) * 6)),
          coverage: Math.max(0, Math.min(100, prevData[prevData.length - 1].coverage + (Math.random() - 0.5) * 4)),
          complexity: Math.max(1, Math.min(10, prevData[prevData.length - 1].complexity + (Math.random() - 0.5) * 2)),
          velocity: Math.max(0, Math.min(100, prevData[prevData.length - 1].velocity + (Math.random() - 0.5) * 12)),
        }
        
        return [...prevData.slice(-23), newPoint] // Keep last 24 points
      })
      setLastUpdate(new Date())
    }, updateInterval)
    
    return () => clearInterval(interval)
  }, [isLive, updateInterval])

  // Calculate overall health score
  const overallHealth = Math.round(
    animatedMetrics.reduce((sum, metric) => {
      const normalizedValue = metric.target ? (metric.value / metric.target) * 100 : metric.value
      return sum + normalizedValue
    }, 0) / animatedMetrics.length
  )

  return (
    <div className="space-y-6">
      {/* Header with overall health */}
      <motion.div
        className="flex items-center justify-between p-6 bg-gradient-to-r from-black/40 via-black/60 to-black/40 rounded-lg border border-white/10 backdrop-blur-sm"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center space-x-6">
          <AnimatedProgressRing
            value={overallHealth}
            maxValue={100}
            size={80}
            color="#06b6d4"
            animated={enableAnimations}
          />
          <div>
            <h2 className="text-xl font-semibold text-white mb-1">
              System Health Overview
            </h2>
            <p className="text-muted-foreground text-sm mb-2">
              Real-time metrics and performance indicators
            </p>
            <div className="flex items-center space-x-4 text-xs">
              <Badge 
                variant="secondary" 
                className={`${isLive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}
              >
                {isLive ? '🔴 LIVE' : '⏸️ PAUSED'}
              </Badge>
              <span className="text-muted-foreground">
                Last update: {lastUpdate.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsLive(!isLive)}
          className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20"
        >
          {isLive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {isLive ? 'Live' : 'Paused'}
        </Button>
      </motion.div>

      {/* Metrics Grid */}
      <div className={`grid gap-6 ${
        compactView 
          ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      }`}>
        {animatedMetrics.map((metric, index) => (
          <motion.div
            key={metric.id}
            initial={enableAnimations ? { opacity: 0, y: 20 } : {}}
            animate={enableAnimations ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: index * 0.1, duration: 0.5 }}
          >
            <AdvancedMetricCard
              metric={metric}
              showSparkline={showSparklines}
              compact={compactView}
              animated={enableAnimations}
            />
          </motion.div>
        ))}
      </div>
    </div>
  )
}