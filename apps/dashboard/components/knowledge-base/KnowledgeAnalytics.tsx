"use client"

import React from "react"
import { motion } from "framer-motion"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
  RadialBarChart,
  RadialBar,
  Legend
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  Network,
  Brain,
  FileText,
  Shield,
  Code,
  BookOpen,
  Clock,
  Users,
  Activity,
  Zap
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

interface KnowledgeBaseStats {
  totalNodes: number
  totalConnections: number
  documentTypes: Record<string, number>
  recentActivity: Array<{
    action: string
    document: string
    timestamp: string
    user?: string
  }>
  topConcepts: Array<{
    name: string
    connections: number
    relevance: number
  }>
}

interface KnowledgeAnalyticsProps {
  stats: KnowledgeBaseStats | null
}

const COLORS = {
  policy: '#EF4444',      // Red
  documentation: '#3B82F6', // Blue
  code: '#F59E0B',       // Amber
  markdown: '#10B981',   // Emerald
  concept: '#8B5CF6'     // Violet
}

export function KnowledgeAnalytics({ stats }: KnowledgeAnalyticsProps) {
  if (!stats) {
    return (
      <Card className="h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </Card>
    )
  }

  // Prepare chart data
  const documentTypeData = Object.entries(stats.documentTypes).map(([type, count]) => ({
    name: type,
    value: count,
    color: COLORS[type as keyof typeof COLORS] || '#6B7280'
  }))

  const conceptConnectionData = stats.topConcepts.map(concept => ({
    name: concept.name,
    connections: concept.connections,
    relevance: concept.relevance * 100
  }))

  // Mock time series data for activity
  const activityTimeData = [
    { date: '2024-01-08', documents: 12, searches: 45, connections: 23 },
    { date: '2024-01-09', documents: 15, searches: 52, connections: 28 },
    { date: '2024-01-10', documents: 18, searches: 38, connections: 31 },
    { date: '2024-01-11', documents: 22, searches: 67, connections: 35 },
    { date: '2024-01-12', documents: 25, searches: 73, connections: 42 },
    { date: '2024-01-13', documents: 28, searches: 84, connections: 48 },
    { date: '2024-01-14', documents: 31, searches: 91, connections: 53 },
    { date: '2024-01-15', documents: 34, searches: 98, connections: 58 }
  ]

  // Network density metrics
  const networkMetrics = [
    {
      name: 'Density',
      value: 0.73,
      color: '#3B82F6',
      description: 'Network connection density'
    },
    {
      name: 'Clustering',
      value: 0.68,
      color: '#10B981',
      description: 'Concept clustering coefficient'
    },
    {
      name: 'Centrality',
      value: 0.81,
      color: '#F59E0B',
      description: 'Average node centrality'
    },
    {
      name: 'Modularity',
      value: 0.64,
      color: '#EF4444',
      description: 'Community structure strength'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Network Density</p>
                  <p className="text-2xl font-bold text-primary">73%</p>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-500">+5.2%</span>
                  </div>
                </div>
                <Network className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Connections</p>
                  <p className="text-2xl font-bold text-emerald-500">4.8</p>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-500">+2.1%</span>
                  </div>
                </div>
                <Brain className="h-8 w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Daily Searches</p>
                  <p className="text-2xl font-bold text-amber-500">98</p>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    <span className="text-xs text-red-500">-1.5%</span>
                  </div>
                </div>
                <Activity className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Growth Rate</p>
                  <p className="text-2xl font-bold text-violet-500">+12%</p>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-500">Weekly</span>
                  </div>
                </div>
                <Zap className="h-8 w-8 text-violet-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Document Types Distribution */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Document Types Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={documentTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {documentTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Concepts Analysis */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Concept Connections & Relevance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={conceptConnectionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="connections" fill="#3B82F6" name="Connections" />
                  <Bar yAxisId="right" dataKey="relevance" fill="#10B981" name="Relevance %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Activity Timeline */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Knowledge Base Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={activityTimeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="documents" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="searches" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="connections" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Network Metrics */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Network Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {networkMetrics.map((metric, index) => (
                  <motion.div
                    key={metric.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + index * 0.1 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{metric.name}</p>
                        <p className="text-xs text-muted-foreground">{metric.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold" style={{ color: metric.color }}>
                          {(metric.value * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                    <Progress 
                      value={metric.value * 100} 
                      className="h-2"
                    />
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Activity Details */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Recent Knowledge Base Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentActivity.map((activity, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 + index * 0.05 }}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className={`w-3 h-3 rounded-full mt-1.5 ${
                    activity.action === 'Added' ? 'bg-green-500' :
                    activity.action === 'Updated' ? 'bg-blue-500' :
                    activity.action === 'Indexed' ? 'bg-amber-500' :
                    'bg-violet-500'
                  }`} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {activity.action}
                      </Badge>
                      <p className="font-medium text-sm truncate">{activity.document}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {activity.user && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {activity.user}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(activity.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}