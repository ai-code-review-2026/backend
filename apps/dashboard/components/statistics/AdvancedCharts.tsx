"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { motion } from "framer-motion"

interface TrendDataPoint {
  date: string
  value: number
}

interface QualityTrendChartProps {
  data: TrendDataPoint[]
  height?: number
}

export function QualityTrendChart({ data, height = 200 }: QualityTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
        Aucune donnée disponible
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="qualityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--orange)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          stroke="rgba(255,255,255,0.3)"
          fontSize={11}
          tickFormatter={(value) => {
            const date = new Date(value)
            return `${date.getMonth() + 1}/${date.getDate()}`
          }}
        />
        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(0,0,0,0.9)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "4px",
            fontSize: "12px",
          }}
          labelStyle={{ color: "#9ca3af" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--orange)"
          strokeWidth={2}
          fill="url(#qualityGradient)"
          animationDuration={1000}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

interface VelocityChartProps {
  data: TrendDataPoint[]
  height?: number
}

export function VelocityChart({ data, height = 200 }: VelocityChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
        Aucune donnée disponible
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          stroke="rgba(255,255,255,0.3)"
          fontSize={11}
          tickFormatter={(value) => {
            const date = new Date(value)
            return `${date.getMonth() + 1}/${date.getDate()}`
          }}
        />
        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(0,0,0,0.9)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "4px",
            fontSize: "12px",
          }}
          labelStyle={{ color: "#9ca3af" }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#60a5fa"
          strokeWidth={3}
          dot={{ fill: "#60a5fa", r: 4 }}
          activeDot={{ r: 6, fill: "#60a5fa" }}
          animationDuration={1000}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

interface CategoryData {
  name: string
  value: number
}

interface FindingsDistributionProps {
  data: Record<string, number>
  height?: number
}

export function FindingsDistribution({ data, height = 200 }: FindingsDistributionProps) {
  const chartData: CategoryData[] = Object.entries(data).map(([name, value]) => ({
    name,
    value,
  }))

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
        Aucune donnée disponible
      </div>
    )
  }

  const COLORS = [
    "#ef4444",
    "#f59e0b",
    "#60a5fa",
    "#a78bfa",
    "#f472b6",
    "#22c55e",
    "#14b8a6",
    "#6366f1",
  ]

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelStyle={{ fontSize: "11px", fill: "#9ca3af" }}
          animationDuration={1000}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(0,0,0,0.9)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "4px",
            fontSize: "12px",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

interface HorizontalBarChartProps {
  data: Record<string, number>
  height?: number
  color?: string
}

export function HorizontalBarChart({ data, height = 300, color = "var(--orange)" }: HorizontalBarChartProps) {
  const chartData = Object.entries(data)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
        Aucune donnée disponible
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 10, left: 100, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={11} />
        <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.3)" fontSize={11} width={90} />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(0,0,0,0.9)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "4px",
            fontSize: "12px",
          }}
        />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} animationDuration={1000} />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface ComparisonChartProps {
  currentData: TrendDataPoint[]
  previousData: TrendDataPoint[]
  height?: number
}

export function ComparisonChart({ currentData, previousData, height = 200 }: ComparisonChartProps) {
  const mergedData = currentData.map((current, index) => ({
    date: current.date,
    current: current.value,
    previous: previousData[index]?.value || 0,
  }))

  if (mergedData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
        Aucune donnée disponible
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={mergedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="currentGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--orange)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="previousGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          stroke="rgba(255,255,255,0.3)"
          fontSize={11}
          tickFormatter={(value) => {
            const date = new Date(value)
            return `${date.getMonth() + 1}/${date.getDate()}`
          }}
        />
        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(0,0,0,0.9)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "4px",
            fontSize: "12px",
          }}
        />
        <Area
          type="monotone"
          dataKey="previous"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#previousGradient)"
          strokeDasharray="5 5"
          animationDuration={1000}
          name="Période précédente"
        />
        <Area
          type="monotone"
          dataKey="current"
          stroke="var(--orange)"
          strokeWidth={2}
          fill="url(#currentGradient)"
          animationDuration={1000}
          name="Période actuelle"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
