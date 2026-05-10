"use client"

import { motion } from "framer-motion"

interface SeverityIndicatorProps {
  critical?: number
  high?: number
  medium?: number
  low?: number
  size?: "sm" | "md" | "lg"
}

export function SeverityIndicator({
  critical = 0,
  high = 0,
  medium = 0,
  low = 0,
  size = "md",
}: SeverityIndicatorProps) {
  const total = critical + high + medium + low
  
  const sizes = {
    sm: { circle: 60, stroke: 8, text: "text-xs" },
    md: { circle: 80, stroke: 10, text: "text-sm" },
    lg: { circle: 120, stroke: 12, text: "text-base" },
  }
  
  const config = sizes[size]
  const radius = (config.circle - config.stroke) / 2
  const circumference = 2 * Math.PI * radius

  // Calculate percentages and dash offsets
  const criticalPercent = total > 0 ? (critical / total) * 100 : 0
  const highPercent = total > 0 ? (high / total) * 100 : 0
  const mediumPercent = total > 0 ? (medium / total) * 100 : 0
  const lowPercent = total > 0 ? (low / total) * 100 : 0

  const criticalDash = (criticalPercent / 100) * circumference
  const highDash = (highPercent / 100) * circumference
  const mediumDash = (mediumPercent / 100) * circumference
  const lowDash = (lowPercent / 100) * circumference

  const criticalOffset = 0
  const highOffset = criticalDash
  const mediumOffset = criticalDash + highDash
  const lowOffset = criticalDash + highDash + mediumDash

  return (
    <div className="flex items-center gap-4">
      {/* Circle Chart */}
      <div className="relative" style={{ width: config.circle, height: config.circle }}>
        <svg width={config.circle} height={config.circle} className="-rotate-90 transform">
          {/* Background circle */}
          <circle
            cx={config.circle / 2}
            cy={config.circle / 2}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={config.stroke}
          />

          {/* Low severity (gray) */}
          {low > 0 && (
            <motion.circle
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference - lowDash }}
              transition={{ duration: 1, delay: 0.3 }}
              cx={config.circle / 2}
              cy={config.circle / 2}
              r={radius}
              fill="none"
              stroke="#6b7280"
              strokeWidth={config.stroke}
              strokeDasharray={circumference}
              strokeDashoffset={circumference - lowDash}
              style={{
                transformOrigin: "50% 50%",
                transform: `rotate(${(lowOffset / circumference) * 360}deg)`,
              }}
            />
          )}

          {/* Medium severity (blue) */}
          {medium > 0 && (
            <motion.circle
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference - mediumDash }}
              transition={{ duration: 1, delay: 0.2 }}
              cx={config.circle / 2}
              cy={config.circle / 2}
              r={radius}
              fill="none"
              stroke="#e8713a"
              strokeWidth={config.stroke}
              strokeDasharray={circumference}
              strokeDashoffset={circumference - mediumDash}
              style={{
                transformOrigin: "50% 50%",
                transform: `rotate(${(mediumOffset / circumference) * 360}deg)`,
              }}
            />
          )}

          {/* High severity (yellow/amber) */}
          {high > 0 && (
            <motion.circle
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference - highDash }}
              transition={{ duration: 1, delay: 0.1 }}
              cx={config.circle / 2}
              cy={config.circle / 2}
              r={radius}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={config.stroke}
              strokeDasharray={circumference}
              strokeDashoffset={circumference - highDash}
              style={{
                transformOrigin: "50% 50%",
                transform: `rotate(${(highOffset / circumference) * 360}deg)`,
              }}
            />
          )}

          {/* Critical severity (red) */}
          {critical > 0 && (
            <motion.circle
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference - criticalDash }}
              transition={{ duration: 1 }}
              cx={config.circle / 2}
              cy={config.circle / 2}
              r={radius}
              fill="none"
              stroke="#ef4444"
              strokeWidth={config.stroke}
              strokeDasharray={circumference}
              strokeDashoffset={circumference - criticalDash}
              style={{
                transformOrigin: "50% 50%",
                transform: `rotate(${(criticalOffset / circumference) * 360}deg)`,
              }}
            />
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className={`space-y-2 ${config.text}`}>
        {critical > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <span className="font-medium text-gray-700">
              {critical} critical
            </span>
          </div>
        )}
        {high > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-amber-500" />
            <span className="font-medium text-gray-700">
              {high} high
            </span>
          </div>
        )}
        {medium > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-blue-500" />
            <span className="font-medium text-gray-700">
              {medium} medium
            </span>
          </div>
        )}
        {low > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-gray-500" />
            <span className="font-medium text-gray-700">
              {low} low
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
