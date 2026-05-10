"use client"

import { motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"

interface AnimatedMetricProps {
  value: number
  duration?: number
  suffix?: string
  prefix?: string
  decimals?: number
  className?: string
}

export function AnimatedMetric({
  value,
  duration = 1000,
  suffix = "",
  prefix = "",
  decimals = 0,
  className = "",
}: AnimatedMetricProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const frameRef = useRef<number>()
  const startTimeRef = useRef<number>()

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1)

      // Easing function (easeOutCubic)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(value * eased)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      }
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  return (
    <span className={className}>
      {prefix}
      {displayValue.toFixed(decimals)}
      {suffix}
    </span>
  )
}

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  className?: string
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  color = "var(--orange)",
  className = "",
}: SparklineProps) {
  if (data.length === 0) return null

  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width
      const y = height - ((value - min) / range) * height
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg width={width} height={height} className={className}>
      <motion.polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </svg>
  )
}

interface GlowingScoreProps {
  score: number
  size?: number
  label?: string
  className?: string
}

export function GlowingScore({ score, size = 80, label, className = "" }: GlowingScoreProps) {
  const getColor = (value: number) => {
    if (value >= 80) return "#22c55e"
    if (value >= 60) return "#f59e0b"
    return "#ef4444"
  }

  const color = getColor(score)
  const radius = size / 2 - 8
  const circumference = 2 * Math.PI * radius

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="6"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - (score / 100) * circumference }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            style={{ filter: `drop-shadow(0 0 8px ${color}66)` }}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center text-2xl font-bold"
          style={{ color }}
        >
          <AnimatedMetric value={score} decimals={0} />
        </div>
      </div>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  )
}

interface TrendIndicatorProps {
  value: number
  comparison?: number
  suffix?: string
  showPercentage?: boolean
  className?: string
}

export function TrendIndicator({
  value,
  comparison,
  suffix = "",
  showPercentage = true,
  className = "",
}: TrendIndicatorProps) {
  if (comparison === undefined || comparison === 0) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-foreground font-semibold">
          {value}
          {suffix}
        </span>
        <span className="text-xs text-muted-foreground">—</span>
      </div>
    )
  }

  const change = ((value - comparison) / Math.abs(comparison)) * 100
  const isPositive = change > 0
  const isNegative = change < 0

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-foreground font-semibold">
        {value}
        {suffix}
      </span>
      {showPercentage && (
        <motion.span
          className={`text-xs font-medium flex items-center gap-0.5 ${
            isPositive ? "text-green-500" : isNegative ? "text-red-500" : "text-muted-foreground"
          }`}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {isPositive && "↑"}
          {isNegative && "↓"}
          {Math.abs(change).toFixed(1)}%
        </motion.span>
      )}
    </div>
  )
}

interface PulseDotProps {
  color?: string
  size?: number
  className?: string
}

export function PulseDot({ color = "var(--orange)", size = 8, className = "" }: PulseDotProps) {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color }}
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.7, 0, 0.7],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <div className="absolute inset-0 rounded-full" style={{ backgroundColor: color }} />
    </div>
  )
}
