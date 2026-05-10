"use client"

/**
 * InteractiveEmptyState — sourced & adapted from 21st.dev
 * Animated empty state with three floating icons, title, description and CTA.
 * On hover the icons fan out with framer-motion spring animations.
 * Uses the platform design tokens from globals.css.
 */

import { forwardRef, useId, type ReactNode } from "react"
import { motion, LazyMotion, domAnimation } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// ─── Icon animation variants ──────────────────────────────────────────────────
const ICON_VARIANTS = {
  left: {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1, rotate: -8, transition: { duration: 0.4, delay: 0.1 } },
    hover:   { x: -18, y: -4, rotate: -18, scale: 1.1, transition: { duration: 0.2 } },
  },
  center: {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1, transition: { duration: 0.4, delay: 0.2 } },
    hover:   { y: -10, scale: 1.15, transition: { duration: 0.2 } },
  },
  right: {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1, rotate: 8, transition: { duration: 0.4, delay: 0.3 } },
    hover:   { x: 18, y: -4, rotate: 18, scale: 1.1, transition: { duration: 0.2 } },
  },
}

const CONTENT_VARIANTS = {
  initial: { y: 16, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: 0.4, delay: 0.2 } },
}

const BUTTON_VARIANTS = {
  initial: { y: 16, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: 0.4, delay: 0.35 } },
}

// ─── Sub-components ────────────────────────────────────────────────────────────
type IconPos = "left" | "center" | "right"

function IconBox({ children, pos }: { children: ReactNode; pos: IconPos }) {
  return (
    <motion.div
      variants={ICON_VARIANTS[pos]}
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card shadow-md transition-all duration-300"
    >
      <span className="text-muted-foreground">{children}</span>
    </motion.div>
  )
}

function ThreeIcons({ icons }: { icons: [ReactNode, ReactNode, ReactNode] }) {
  return (
    <div className="flex items-end justify-center gap-1">
      <IconBox pos="left">{icons[0]}</IconBox>
      <IconBox pos="center">{icons[1]}</IconBox>
      <IconBox pos="right">{icons[2]}</IconBox>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export interface EmptyStateProps {
  title: string
  description?: string
  /** Exactly 3 ReactNode icons to display in a fan */
  icons?: [ReactNode, ReactNode, ReactNode]
  /** Primary CTA */
  action?: {
    label: string
    icon?: ReactNode
    onClick?: () => void
    href?: string
    disabled?: boolean
  }
  /** "default" = dashed border | "error" = red tint | "subtle" = no border */
  variant?: "default" | "error" | "subtle"
  size?: "sm" | "default" | "lg"
  className?: string
}

export const EmptyState = forwardRef<HTMLElement, EmptyStateProps>(
  (
    {
      title,
      description,
      icons,
      action,
      variant = "default",
      size = "default",
      className,
    },
    ref
  ) => {
    const titleId  = useId()
    const descId   = useId()

    const padding = { sm: "p-6", default: "p-8", lg: "p-12" }[size]
    const titleCls = { sm: "text-base", default: "text-lg", lg: "text-xl" }[size]
    const descCls  = { sm: "text-xs", default: "text-sm", lg: "text-base" }[size]

    const variantCls = {
      default: "border-2 border-dashed border-border hover:border-border/80 bg-card/40 hover:bg-card/60",
      error:   "border border-destructive/30 bg-destructive/5 hover:bg-destructive/10",
      subtle:  "border border-transparent bg-card/20 hover:bg-card/40",
    }[variant]

    return (
      <LazyMotion features={domAnimation}>
        <motion.section
          ref={ref as React.Ref<HTMLElement>}
          role="region"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          className={cn(
            "group relative flex flex-col items-center justify-center overflow-hidden rounded-xl text-center transition-all duration-300",
            padding,
            variantCls,
            className
          )}
          initial="initial"
          animate="animate"
          whileHover="hover"
        >
          {/* Icons fan */}
          {icons && (
            <div className="mb-5">
              <ThreeIcons icons={icons} />
            </div>
          )}

          {/* Text */}
          <motion.div variants={CONTENT_VARIANTS} className="mb-5 space-y-1.5">
            <h3
              id={titleId}
              className={cn("font-semibold text-foreground", titleCls)}
            >
              {title}
            </h3>
            {description && (
              <p
                id={descId}
                className={cn("max-w-xs leading-relaxed text-muted-foreground", descCls)}
              >
                {description}
              </p>
            )}
          </motion.div>

          {/* CTA */}
          {action && (
            <motion.div variants={BUTTON_VARIANTS}>
              <Button
                size="sm"
                variant="outline"
                onClick={action.onClick}
                disabled={action.disabled}
                className="gap-1.5 border-border bg-card hover:bg-card-hover"
                asChild={!!action.href}
              >
                {action.href ? (
                  <a href={action.href}>
                    {action.icon}
                    {action.label}
                  </a>
                ) : (
                  <>
                    {action.icon && (
                      <motion.span
                        className="transition-transform group-hover/btn:rotate-90"
                      >
                        {action.icon}
                      </motion.span>
                    )}
                    {action.label}
                  </>
                )}
              </Button>
            </motion.div>
          )}
        </motion.section>
      </LazyMotion>
    )
  }
)

EmptyState.displayName = "EmptyState"
