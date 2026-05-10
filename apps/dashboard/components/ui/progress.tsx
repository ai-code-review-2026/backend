"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const progressVariants = cva("h-full w-full flex-1 transition-all duration-500", {
  variants: {
    variant: {
      default: "bg-primary",
      gradient: "bg-gradient-to-r from-orange-500 to-orange-700",
      gradientAccent: "bg-gradient-to-r from-orange-500 to-teal-500",
      success: "bg-gradient-to-r from-green-500 to-green-600",
      warning: "bg-gradient-to-r from-amber-500 to-amber-600",
      error: "bg-gradient-to-r from-red-500 to-red-600",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface ProgressProps
  extends React.ComponentProps<typeof ProgressPrimitive.Root>,
    VariantProps<typeof progressVariants> {
  showLabel?: boolean;
  labelPosition?: "inside" | "outside";
}

function Progress({
  className,
  value,
  variant,
  showLabel = false,
  labelPosition = "inside",
  ...props
}: ProgressProps) {
  const percentage = Math.round(value || 0);

  return (
    <div className="relative w-full">
      <ProgressPrimitive.Root
        data-slot="progress"
        className={cn(
          "bg-primary/10 relative h-3 w-full overflow-hidden rounded-full",
          className,
        )}
        {...props}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className={cn(progressVariants({ variant }), "shadow-sm")}
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
        {showLabel && labelPosition === "inside" && percentage > 10 && (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
            {percentage}%
          </span>
        )}
      </ProgressPrimitive.Root>
      {showLabel && labelPosition === "outside" && (
        <span className="mt-1 text-xs font-medium text-muted-foreground">
          {percentage}%
        </span>
      )}
    </div>
  );
}

// Circular progress variant
interface CircularProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  size?: number;
  strokeWidth?: number;
  variant?: "default" | "gradient" | "success" | "warning" | "error";
  showLabel?: boolean;
}

function CircularProgress({
  value,
  size = 120,
  strokeWidth = 8,
  variant = "default",
  showLabel = true,
  className,
  ...props
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  const percentage = Math.round(value || 0);

  const gradientId = `progress-gradient-${React.useId()}`;

  const variantColors = {
    default: { start: "#f09456", end: "#e8713a" },
    gradient: { start: "#e8713a", end: "#cf612d" },
    gradientAccent: { start: "#e8713a", end: "#17f0c4" },
    success: { start: "#10b981", end: "#059669" },
    warning: { start: "#f59e0b", end: "#d97706" },
    error: { start: "#ef4444", end: "#dc2626" },
  };

  const colors = variantColors[variant];

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.start} />
            <stop offset="100%" stopColor={colors.end} />
          </linearGradient>
        </defs>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-primary/10"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
          style={{ filter: "drop-shadow(0 0 8px rgba(232, 113, 58, 0.3))" }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{percentage}%</span>
        </div>
      )}
    </div>
  );
}

export { Progress, CircularProgress, progressVariants };
