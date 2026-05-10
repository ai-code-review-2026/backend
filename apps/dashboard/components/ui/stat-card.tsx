"use client";

import * as React from "react";
import { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

import { cn } from "./utils";
import { Card } from "./card";
import { AnimatedCounter } from "./animated-counter";

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: number;
  icon?: LucideIcon;
  iconColor?: "blue" | "green" | "amber" | "red" | "cyan";
  trend?: {
    value: number;
    isPositive?: boolean;
  };
  suffix?: string;
  prefix?: string;
  decimals?: number;
  description?: string;
  variant?: "default" | "elevated" | "gradient";
}

const iconColorClasses = {
  blue: "from-blue-500 to-blue-700",
  green: "from-green-500 to-green-700",
  amber: "from-amber-500 to-amber-700",
  red: "from-red-500 to-red-700",
  cyan: "from-cyan-500 to-cyan-700",
};

const trendColorClasses = {
  positive: "text-[color:var(--green-status)]",
  negative: "text-destructive",
  neutral: "text-muted-foreground",
};

export function StatCard({
  title,
  value,
  icon: Icon,
  iconColor = "blue",
  trend,
  suffix = "",
  prefix = "",
  decimals = 0,
  description,
  variant = "elevated",
  className,
  ...props
}: StatCardProps) {
  const trendType = trend
    ? trend.isPositive === true
      ? "positive"
      : trend.isPositive === false
        ? "negative"
        : "neutral"
    : "neutral";

  const TrendIcon =
    trendType === "positive"
      ? TrendingUp
      : trendType === "negative"
        ? TrendingDown
        : Minus;

  return (
    <Card
      variant={variant}
      className={cn("group relative overflow-hidden", className)}
      {...props}
    >
      {/* Background gradient effect */}
      {variant === "gradient" && (
        <div className="absolute inset-0 bg-gradient-hero opacity-90" />
      )}

      <div className="relative z-10 flex flex-col gap-4 p-6">
        {/* Header avec icon et trend */}
        <div className="flex items-start justify-between">
          {Icon && (
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br shadow-pro-md transition-transform duration-300 group-hover:scale-110",
                iconColorClasses[iconColor],
              )}
            >
              <Icon className="h-6 w-6 text-white" />
            </div>
          )}

          {trend !== undefined && (
            <div
              className={cn(
                "flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium",
                variant === "gradient"
                  ? "bg-white/20 text-white"
                  : "bg-accent/50",
              )}
            >
              <TrendIcon className="h-4 w-4" />
              <span
                className={cn(
                  variant === "gradient" ? "text-white" : trendColorClasses[trendType],
                )}
              >
                {trend.value > 0 && "+"}
                {trend.value}%
              </span>
            </div>
          )}
        </div>

        {/* Value */}
        <div>
          <AnimatedCounter
            value={value}
            duration={2000}
            decimals={decimals}
            prefix={prefix}
            suffix={suffix}
            className={cn(
              "text-3xl font-bold transition-colors",
              variant === "gradient"
                ? "text-white"
                : "text-foreground group-hover:text-primary",
            )}
          />
        </div>

        {/* Title & Description */}
        <div className="space-y-1">
          <p
            className={cn(
              "text-sm font-medium",
              variant === "gradient"
                ? "text-white/90"
                : "text-muted-foreground",
            )}
          >
            {title}
          </p>
          {description && (
            <p
              className={cn(
                "text-xs",
                variant === "gradient"
                  ? "text-white/70"
                  : "text-muted-foreground",
              )}
            >
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Decorative gradient overlay on hover */}
      {variant !== "gradient" && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      )}
    </Card>
  );
}
