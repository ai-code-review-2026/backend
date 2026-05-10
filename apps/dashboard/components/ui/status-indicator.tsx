"use client"

/**
 * Animated Status Indicator — sourced & adapted from 21st.dev
 * Displays an animated pulse dot + label for pipeline analysis statuses.
 * Uses the platform's CSS design tokens (--green-status, --orange, etc.)
 */

import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

export type AnalysisStatus =
  | "RECEIVED"
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "PENDING"
  | "SUCCESS"
  | "ERROR"
  | "WARNING"
  | string

type StatusConfig = {
  dot: string
  ping: string
  label: string
  text: string
}

const STATUS_MAP: Record<string, StatusConfig> = {
  COMPLETED: {
    dot: "bg-[color:var(--green-status)]",
    ping: "bg-[color:var(--green-status)]",
    label: "Completed",
    text: "text-[color:var(--green-status)]",
  },
  SUCCESS: {
    dot: "bg-[color:var(--green-status)]",
    ping: "bg-[color:var(--green-status)]",
    label: "Success",
    text: "text-[color:var(--green-status)]",
  },
  RUNNING: {
    dot: "bg-[color:var(--orange)]",
    ping: "bg-[color:var(--orange)]",
    label: "Running",
    text: "text-[color:var(--orange)]",
  },
  QUEUED: {
    dot: "bg-teal-400",
    ping: "bg-teal-400",
    label: "Queued",
    text: "text-teal-400",
  },
  RECEIVED: {
    dot: "bg-teal-400",
    ping: "bg-teal-400",
    label: "Received",
    text: "text-teal-400",
  },
  PENDING: {
    dot: "bg-teal-400",
    ping: "bg-teal-400",
    label: "Pending",
    text: "text-teal-400",
  },
  FAILED: {
    dot: "bg-destructive",
    ping: "bg-destructive",
    label: "Failed",
    text: "text-destructive",
  },
  ERROR: {
    dot: "bg-destructive",
    ping: "bg-destructive",
    label: "Error",
    text: "text-destructive",
  },
  CANCELLED: {
    dot: "bg-muted-foreground",
    ping: "bg-muted-foreground",
    label: "Cancelled",
    text: "text-muted-foreground",
  },
  WARNING: {
    dot: "bg-[color:var(--orange)]",
    ping: "bg-[color:var(--orange)]",
    label: "Warning",
    text: "text-[color:var(--orange)]",
  },
}

const PULSING_STATUSES = new Set(["RUNNING", "QUEUED", "RECEIVED", "PENDING"])

interface StatusIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  status: AnalysisStatus
  showLabel?: boolean
  labelOverride?: string
  size?: "sm" | "md" | "lg"
}

export function StatusIndicator({
  status,
  showLabel = true,
  labelOverride,
  size = "sm",
  className,
  ...props
}: StatusIndicatorProps) {
  const normalized = status?.toUpperCase() ?? "PENDING"
  const config = STATUS_MAP[normalized] ?? {
    dot: "bg-muted-foreground",
    ping: "bg-muted-foreground",
    label: status ?? "Unknown",
    text: "text-muted-foreground",
  }

  const isPulsing = PULSING_STATUSES.has(normalized)

  const dotSize = size === "lg" ? "h-2.5 w-2.5" : size === "md" ? "h-2 w-2" : "h-1.5 w-1.5"
  const textSize = size === "lg" ? "text-sm" : size === "md" ? "text-xs" : "text-xs"

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    >
      {/* Pulse dot */}
      <span className={cn("relative flex shrink-0", dotSize)}>
        {isPulsing && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              config.ping
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full",
            dotSize,
            config.dot
          )}
        />
      </span>

      {/* Label */}
      {showLabel && (
        <span className={cn("font-medium leading-none", textSize, config.text)}>
          {labelOverride ?? config.label}
        </span>
      )}
    </span>
  )
}
