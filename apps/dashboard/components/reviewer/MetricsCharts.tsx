"use client"

import { useMemo } from "react"
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"

interface MetricsChartsProps {
  data: any[]
  type: "area" | "bar" | "line" | "pie"
  dataKey: string | string[]
  title?: string
  height?: number
  colors?: string[]
}

const DEFAULT_COLORS = [
  "var(--orange)",
  "var(--teal)",
  "#f59e0b", // Yellow
  "#ef4444", // Red
  "#f09456",
  "#d96530",
  "var(--teal)",
  "#22c55e",
]

export function MetricsChart({
  data,
  type,
  dataKey,
  title,
  height = 300,
  colors = DEFAULT_COLORS
}: MetricsChartsProps) {
  const chartData = useMemo(() => {
    return data.map((item, index) => ({
      ...item,
      fill: colors[index % colors.length],
    }))
  }, [data, colors])

  const renderChart = () => {
    switch (type) {
      case "area":
        return (
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {Array.isArray(dataKey) ? (
              dataKey.map((key, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stackId="1"
                  stroke={colors[index % colors.length]}
                  fill={colors[index % colors.length]}
                  fillOpacity={0.6}
                />
              ))
            ) : (
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={colors[0]}
                fill={colors[0]}
                fillOpacity={0.3}
              />
            )}
          </AreaChart>
        )

      case "bar":
        return (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {Array.isArray(dataKey) ? (
              dataKey.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={colors[index % colors.length]}
                />
              ))
            ) : (
              <Bar dataKey={dataKey} fill={colors[0]} />
            )}
          </BarChart>
        )

      case "line":
        return (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {Array.isArray(dataKey) ? (
              dataKey.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={colors[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            )}
          </LineChart>
        )

      case "pie":
        return (
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={120}
              paddingAngle={5}
              dataKey={Array.isArray(dataKey) ? dataKey[0] : dataKey}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        )

      default:
        return (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {(Array.isArray(dataKey) ? dataKey : [dataKey]).map((key, index) => (
              <Bar key={key} dataKey={key} fill={colors[index % colors.length]} />
            ))}
          </BarChart>
        )
    }
  }

  const chart = renderChart()

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {chart}
      </ResponsiveContainer>
    </div>
  )
}

interface TrendChartProps {
  data: Array<{
    date: string
    [key: string]: any
  }>
  metrics: string[]
  colors?: string[]
  height?: number
}

export function TrendChart({
  data,
  metrics,
  colors = DEFAULT_COLORS,
  height = 300
}: TrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        {metrics.map((metric, index) => (
          <Line
            key={metric}
            type="monotone"
            dataKey={metric}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

interface DonutChartProps {
  data: Array<{
    name: string
    value: number
    color?: string
  }>
  centerLabel?: string
  centerValue?: string | number
  height?: number
}

export function DonutChart({
  data,
  centerLabel,
  centerValue,
  height = 300
}: DonutChartProps) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={80}
            outerRadius={120}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel && centerValue && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{centerValue}</div>
            <div className="text-sm text-muted-foreground">{centerLabel}</div>
          </div>
        </div>
      )}
    </div>
  )
}

interface StackedBarChartProps {
  data: any[]
  categories: string[]
  colors?: string[]
  height?: number
}

export function StackedBarChart({
  data,
  categories,
  colors = DEFAULT_COLORS,
  height = 300
}: StackedBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        {categories.map((category, index) => (
          <Bar
            key={category}
            dataKey={category}
            stackId="stack"
            fill={colors[index % colors.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

interface HeatmapProps {
  data: Array<{
    day: string
    hour: number
    value: number
  }>
  height?: number
}

export function Heatmap({ data, height = 300 }: HeatmapProps) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const hours = Array.from({ length: 24 }, (_, i) => i)

  const getColor = (value: number) => {
    const intensity = Math.min(value / 10, 1) // Normalize to 0-1
    const opacity = 0.1 + intensity * 0.8 // 10% to 90% opacity
    return `rgba(59, 130, 246, ${opacity})` // Blue with varying opacity
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-24 gap-1 min-w-full" style={{ height }}>
        {/* Hour labels */}
        <div className="col-span-24 grid grid-cols-24 gap-1">
          {hours.map(hour => (
            <div key={hour} className="text-xs text-center text-muted-foreground">
              {hour}
            </div>
          ))}
        </div>

        {/* Heatmap cells */}
        {days.map(day => (
          <div key={day} className="col-span-24 grid grid-cols-24 gap-1">
            {hours.map(hour => {
              const cellData = data.find(d => d.day === day && d.hour === hour)
              const value = cellData?.value || 0
              return (
                <div
                  key={`${day}-${hour}`}
                  className="aspect-square rounded border"
                  style={{ backgroundColor: getColor(value) }}
                  title={`${day} ${hour}:00 - ${value} reviews`}
                />
              )
            })}
          </div>
        ))}

        {/* Day labels */}
        <div className="col-span-24 grid grid-cols-24 gap-1">
          {days.map((day, index) => (
            <div key={day} className={`text-xs text-center text-muted-foreground ${index === 0 ? 'col-start-1' : ''} col-span-3`}>
              {index % 3 === 0 ? day : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface ProgressRingProps {
  value: number
  max: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
  showValue?: boolean
}

export function ProgressRing({
  value,
  max,
  size = 120,
  strokeWidth = 8,
  color = "var(--orange)",
  label,
  showValue = true
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const percentage = (value / max) * 100
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-300 ease-out"
          />
        </svg>
        {showValue && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-xl font-bold text-foreground">
                {Math.round(percentage)}%
              </div>
              {label && (
                <div className="text-xs text-muted-foreground">{label}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
