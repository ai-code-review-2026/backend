"use client"

import { motion } from "framer-motion"

/**
 * Diff Editor UI Components
 * 
 * Small reusable UI components for the diff editor interface.
 */

export function ExtBadge({ ext, color }: { ext: string; color: string }) {
  return (
    <span
      className="inline-flex items-center justify-center text-white flex-shrink-0 font-bold"
      style={{
        background: color,
        width: 20,
        height: 15,
        fontSize: 8,
        borderRadius: 3,
        letterSpacing: "0.03em",
      }}
    >
      {ext}
    </span>
  )
}

export function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <svg width={72} height={72} className="flex-shrink-0">
      <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
      <motion.circle
        cx={36}
        cy={36}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        transform="rotate(-90 36 36)"
        style={{ filter: `drop-shadow(0 0 5px ${color}66)` }}
      />
      <text
        x={36}
        y={36}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={16}
        fontWeight="bold"
        fontFamily="Inter, sans-serif"
      >
        {score}
      </text>
    </svg>
  )
}

export function LoadingSpinner({ size = 20 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center p-8">
      <motion.div
        className="border-2 border-[--orange] border-t-transparent rounded-full"
        style={{ width: size, height: size }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
    </div>
  )
}

export function StatusBadge({
  status,
  className = "",
}: {
  status: "COMPLETED" | "FAILED" | "RUNNING" | "QUEUED" | "RECEIVED"
  className?: string
}) {
  const colors = {
    COMPLETED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    FAILED: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    RUNNING: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    QUEUED: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    RECEIVED: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 border font-mono text-[10px] uppercase tracking-wider ${
        colors[status] || colors.RECEIVED
      } ${className}`}
    >
      {status}
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: "BLOCKER" | "WARN" | "INFO" | string }) {
  const colors = {
    BLOCKER: "bg-rose-500/10 text-rose-400 border-rose-500/40",
    WARN: "bg-amber-500/10 text-amber-400 border-amber-500/40",
    INFO: "bg-blue-500/10 text-blue-400 border-blue-500/40",
  }

  const color = colors[severity as keyof typeof colors] || colors.INFO

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 border font-mono text-[10px] uppercase tracking-wider ${color}`}
    >
      {severity}
    </span>
  )
}
