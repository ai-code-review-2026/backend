import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const spinnerVariants = cva("inline-block", {
  variants: {
    size: {
      sm: "h-4 w-4",
      md: "h-8 w-8",
      lg: "h-12 w-12",
      xl: "h-16 w-16",
    },
    variant: {
      primary: "text-primary",
      accent: "text-accent",
      white: "text-white",
      muted: "text-muted-foreground",
    },
  },
  defaultVariants: {
    size: "md",
    variant: "primary",
  },
});

interface SpinnerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerVariants> {
  label?: string;
}

function Spinner({
  className,
  size = "md",
  variant = "primary",
  label,
  ...props
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label || "Loading"}
      className={cn("inline-flex items-center justify-center", className)}
      {...props}
    >
      <svg
        className={cn(
          spinnerVariants({ size, variant }),
          "animate-spin-smooth-infinite",
        )}
        viewBox="0 0 50 50"
        fill="none"
      >
        <defs>
          <linearGradient
            id="spinner-gradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#e8713a" />
            <stop offset="100%" stopColor="#17f0c4" />
          </linearGradient>
        </defs>
        <circle
          className="opacity-25"
          cx="25"
          cy="25"
          r="20"
          stroke="currentColor"
          strokeWidth="4"
        />
        <circle
          cx="25"
          cy="25"
          r="20"
          stroke={variant === "white" ? "currentColor" : "url(#spinner-gradient)"}
          strokeWidth="4"
          strokeDasharray="80 60"
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}

// Simple dot pulse loader (more subtle)
interface DotPulseProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "primary" | "accent" | "white";
}

function DotPulse({ className, variant = "primary", ...props }: DotPulseProps) {
  const dotClass = cn(
    "h-2 w-2 rounded-full animate-pulse-glow",
    variant === "primary" && "bg-primary",
    variant === "accent" && "bg-accent",
    variant === "white" && "bg-white",
  );

  return (
    <div
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    >
      <div className={dotClass} style={{ animationDelay: "0ms" }} />
      <div className={dotClass} style={{ animationDelay: "150ms" }} />
      <div className={dotClass} style={{ animationDelay: "300ms" }} />
    </div>
  );
}

export { Spinner, DotPulse, spinnerVariants };
export { CircuitLoader } from "./circuit-loader";
