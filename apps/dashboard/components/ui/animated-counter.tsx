"use client"

/**
 * AnimatedCounter — sourced & adapted from 21st.dev
 * Counts up from 0 → target using Framer Motion spring + useInView.
 * Triggers only once when the element enters the viewport.
 */

import * as React from "react"
import { motion, useSpring, useTransform, useInView, animate } from "framer-motion"
import { cn } from "@/lib/utils"

interface AnimatedCounterProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number
  /** Decimal places (default 0) */
  decimals?: number
  /** Prefix rendered before the number, e.g. "$" */
  prefix?: string
  /** Suffix rendered after the number, e.g. "%" */
  suffix?: string
  /** Animation duration in seconds (default 1.6) */
  duration?: number
}

export function AnimatedCounter({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1.6,
  className,
  ...props
}: AnimatedCounterProps) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-40px" })

  const spring = useSpring(0, { damping: 60, stiffness: 120, mass: 1 })

  const displayValue = useTransform(spring, (latest) =>
    decimals > 0
      ? latest.toFixed(decimals)
      : Math.round(latest).toLocaleString()
  )

  React.useEffect(() => {
    if (isInView) {
      const controls = animate(spring, value, { duration, ease: "easeOut" })
      return controls.stop
    }
  }, [isInView, value, spring, duration])

  return (
    <span ref={ref} className={cn("tabular-nums", className)} {...props}>
      {prefix}
      <motion.span>{displayValue}</motion.span>
      {suffix}
    </span>
  )
}
