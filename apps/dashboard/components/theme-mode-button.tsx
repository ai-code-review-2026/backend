"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"

export function ThemeModeButton({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = theme === "dark"
  const nextMode = isDark ? "Light Mode" : "Dark Mode"

  return (
    <motion.button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      aria-label={`Switch to ${nextMode}`}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-medium shadow-[0_8px_22px_-14px_rgba(2,6,23,0.65)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--ring]/60",
        "border-border bg-card text-foreground hover:bg-muted transition-colors",
        className
      )}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted">
        <AnimatePresence mode="wait" initial={false}>
          {mounted && (
            <motion.span
              key={nextMode}
              initial={{ rotate: -35, opacity: 0, scale: 0.6 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 35, opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.2 }}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <motion.span
        key={nextMode}
        initial={{ opacity: 0.7 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        {mounted ? nextMode : "Dark Mode"}
      </motion.span>
    </motion.button>
  )
}
