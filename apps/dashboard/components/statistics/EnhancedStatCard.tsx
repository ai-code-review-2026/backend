"use client"

import { motion } from "framer-motion"
import { LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AnimatedMetric, Sparkline, TrendIndicator } from "./AnimatedComponents"

interface EnhancedStatCardProps {
  title: string
  value: number
  previousValue?: number
  trend?: number[]
  icon: LucideIcon
  suffix?: string
  prefix?: string
  decimals?: number
  description?: string
  color?: string
  delay?: number
}

export function EnhancedStatCard({
  title,
  value,
  previousValue,
  trend = [],
  icon: Icon,
  suffix = "",
  prefix = "",
  decimals = 0,
  description,
  color = "var(--orange)",
  delay = 0,
}: EnhancedStatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card className="relative overflow-hidden border-[--border-card] bg-[--bg-card] hover:bg-[--bg-card-hover] transition-all duration-300 group">
        {/* Gradient background glow */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: `radial-gradient(circle at top right, ${color}15, transparent 70%)`,
          }}
        />

        <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div
            className="p-2 rounded-lg transition-all duration-300 group-hover:scale-110"
            style={{
              backgroundColor: `${color}15`,
              color: color,
            }}
          >
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>

        <CardContent className="relative z-10">
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-bold text-foreground">
              <AnimatedMetric
                value={value}
                suffix={suffix}
                prefix={prefix}
                decimals={decimals}
                duration={1200}
              />
            </div>
            {trend.length > 0 && <Sparkline data={trend} color={color} width={60} height={20} />}
          </div>

          {previousValue !== undefined && (
            <div className="mt-2">
              <TrendIndicator value={value} comparison={previousValue} suffix={suffix} />
            </div>
          )}

          {description && (
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{description}</p>
          )}
        </CardContent>

        {/* Bottom accent line */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-1"
          style={{ backgroundColor: color }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: delay + 0.3 }}
        />
      </Card>
    </motion.div>
  )
}

interface MetricComparisonCardProps {
  title: string
  current: number
  previous: number
  suffix?: string
  icon: LucideIcon
  description?: string
}

export function MetricComparisonCard({
  title,
  current,
  previous,
  suffix = "",
  icon: Icon,
  description,
}: MetricComparisonCardProps) {
  const change = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0
  const isImprovement = change >= 0

  return (
    <Card className="border-[--border-card] bg-[--bg-card]">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Actuel</p>
            <div className="text-2xl font-bold text-foreground">
              <AnimatedMetric value={current} suffix={suffix} decimals={0} />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Précédent</p>
            <div className="text-2xl font-bold text-muted-foreground/60">
              {previous}
              {suffix}
            </div>
          </div>
        </div>

        <div
          className={`mt-3 px-3 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1 ${
            isImprovement
              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
              : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
          }`}
        >
          {isImprovement ? "↑" : "↓"}
          {Math.abs(change).toFixed(1)}% vs période précédente
        </div>

        {description && <p className="mt-2 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  )
}

interface GradientStatCardProps {
  title: string
  value: number | string
  icon: LucideIcon
  gradient: string
  iconBg: string
}

export function GradientStatCard({ title, value, icon: Icon, gradient, iconBg }: GradientStatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      whileHover={{ scale: 1.02 }}
    >
      <Card
        className="relative overflow-hidden border-0"
        style={{
          background: gradient,
        }}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-white/80">{title}</p>
              <div className="text-3xl font-bold text-white">
                {typeof value === "number" ? <AnimatedMetric value={value} /> : value}
              </div>
            </div>
            <div
              className="p-3 rounded-xl"
              style={{
                backgroundColor: iconBg,
              }}
            >
              <Icon className="h-6 w-6 text-white" />
            </div>
          </div>
        </CardContent>

        {/* Animated background circles */}
        <motion.div
          className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/5"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        />
      </Card>
    </motion.div>
  )
}
