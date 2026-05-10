"use client"

import React, { useEffect, useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AnimatePresence, motion } from "framer-motion"
import {
  Check,
  ChevronDown,
  Monitor,
  Moon, 
  Sun,
  Sunset,
  Trees,
  Waves,
} from "lucide-react"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

const themeIcons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
  sunset: Sunset,
  ocean: Waves,
  forest: Trees,
}

export type ThemeToggleVariant =
  | "button"
  | "switch"
  | "dropdown"
  | "tabs" 
  | "grid"
  | "radial"  
  | "cards" 
export type ThemeToggleSize = "sm" | "md" | "lg"

interface ThemeToggleProps {
  variant?: ThemeToggleVariant
  size?: ThemeToggleSize
  showLabel?: boolean
  themes?: Theme[]
  className?: string
}

export type Theme = "light" | "dark" | "system" | "sunset" | "ocean" | "forest"

export type ThemeConfig = {
  name: string
  label: string
  colors: {
    background: string
    foreground: string
    primary: string
    secondary: string
    accent: string
    muted: string
    border: string
    card: string
  }
}

export const themeConfigs: Record<Theme, ThemeConfig> = {
  light: {
    name: "light",
    label: "Light",
    colors: {
      background: "#f7f7f8",
      foreground: "#0c0c0d",
      primary: "#e8713a",
      secondary: "#45454a",
      accent: "#17f0c4",
      muted: "#efeff2",
      border: "#d9d9de",
      card: "#ffffff",
    },
  },
  dark: {
    name: "dark",
    label: "Dark",
    colors: {
      background: "#0c0c0d",
      foreground: "#f5f5f5",
      primary: "#e8713a",
      secondary: "#a0a0a8",
      accent: "#17f0c4",
      muted: "#1a1a1e",
      border: "#26262c",
      card: "#141416",
    },
  },
  system: {
    name: "system",
    label: "System",
    colors: {
      background: "#f7f7f8",
      foreground: "#0c0c0d",
      primary: "#e8713a",
      secondary: "#45454a",
      accent: "#17f0c4",
      muted: "#efeff2",
      border: "#d9d9de",
      card: "#ffffff",
    },
  },
  sunset: {
    name: "sunset",
    label: "Sunset",
    colors: {
      background: "#181214",
      foreground: "#f8eadf",
      primary: "#f97316",
      secondary: "#fb7185",
      accent: "#f59e0b",
      muted: "#23181b",
      border: "#3a2528",
      card: "#1f1418",
    },
  },
  ocean: {
    name: "ocean",
    label: "Ocean",
    colors: {
      background: "#101416",
      foreground: "#e7fdfa",
      primary: "#17f0c4",
      secondary: "#0ea5a3",
      accent: "#22c55e",
      muted: "#182225",
      border: "#244047",
      card: "#13191b",
    },
  },
  forest: {
    name: "forest",
    label: "Forest",
    colors: {
      background: "#101512",
      foreground: "#edf7ef",
      primary: "#22c55e",
      secondary: "#16a34a",
      accent: "#17f0c4",
      muted: "#18201b",
      border: "#233129",
      card: "#131814",
    },
  },
}

export function Theme({
  variant = "button",
  size = "md",
  showLabel = false,
  themes = ["light", "dark"],
  className,
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const sizeClasses = {
    sm: "h-8 px-2 text-xs",
    md: "h-10 px-3 text-sm",
    lg: "h-12 px-4 text-base",
  }

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 20,
  }

  if (!isMounted) return null

  if (variant === "button") {
    const isDark = theme === "dark"
    const Icon = isDark ? Moon : Sun

    return (
      <motion.button
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg border transition-all duration-200",
          "border-border bg-card text-foreground",
          "hover:bg-muted active:scale-95",
          sizeClasses[size],
          className
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
      >
        <motion.div
          key={theme}
          initial={{ rotate: -180, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Icon size={iconSizes[size]} />
        </motion.div>
        {showLabel && (
          <span className="font-medium">{isDark ? "Dark" : "Light"}</span>
        )}
      </motion.button>
    )
  }

  if (variant === "switch") {
    const isLight = theme === "light"

    return (
      <motion.button
        onClick={() => setTheme(isLight ? "dark" : "light")}
        className={cn(
          "relative inline-flex items-center rounded-full border-2 transition-all duration-300",
          "border-border bg-muted",
          size === "sm"
            ? "h-6 w-12"
            : size === "md"
              ? "h-7 w-14"
              : "h-8 w-16",
          className
        )}
      >
        <motion.div
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-foreground shadow-lg",
            size === "sm" ? "h-4 w-4" : size === "md" ? "h-5 w-5" : "h-6 w-6"
          )}
          animate={{
            x: isLight ? 2 : size === "sm" ? 24 : size === "md" ? 28 : 32,
          }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
          <motion.div
            key={theme}
            initial={{ rotate: -180, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {isLight ? (
              <Sun
                size={size === "sm" ? 10 : size === "md" ? 12 : 14}
                className="text-background"
              />
            ) : (
              <Moon
                size={size === "sm" ? 10 : size === "md" ? 12 : 14}
                className="text-background"
              />
            )}
          </motion.div>
        </motion.div>
      </motion.button>
    )
  }

  if (variant === "dropdown") {
    function isTheme(value: unknown): value is Theme {
      return (
        typeof value === "string" && ["light", "dark", "system"].includes(value)
      )
    }

    const safeTheme: Theme =
      isTheme(theme) && themes?.includes(theme) ? theme : "light"

    return (
      <div className="relative">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {showLabel ? (
              <motion.button
                className={cn(
                  "inline-flex items-center justify-between gap-2 rounded-lg border transition-all duration-200",
                  "border-border bg-card text-foreground",
                  "hover:bg-muted",
                  sizeClasses[size],
                  "min-w-[80px]",
                  className
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-2">
                  {React.createElement(themeIcons[safeTheme], {
                    size: iconSizes[size],
                  })}
                  <span className="font-medium">
                    {themeConfigs[safeTheme].label}
                  </span>
                </div>
                <ChevronDown size={iconSizes[size]} />
              </motion.button>
            ) : (
              <motion.button
                className={cn(
                  "inline-flex items-center justify-center rounded-lg border transition-all duration-200",
                  "border-border bg-card text-foreground",
                  "hover:bg-muted",
                  sizeClasses[size],
                  className
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {React.createElement(themeIcons[safeTheme], {
                  size: iconSizes[size],
                })}
              </motion.button>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            className="z-50 min-w-[100px] space-y-1"
          >
            {themes.map((themeOption) => {
              const Icon = themeIcons[themeOption]
              const isSelected = theme === themeOption

              return (
                <DropdownMenuItem
                  key={themeOption}
                  onClick={() => setTheme(themeOption)}
                  className={cn(
                    "flex items-center justify-between gap-2 px-3 py-2",
                    isSelected && "bg-primary text-primary-foreground"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={iconSizes[size]} />
                    <span className="font-medium">
                      {themeConfigs[themeOption].label}
                    </span>
                  </div>
                  {isSelected && <Check size={iconSizes[size]} />}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  if (variant === "tabs") {
    return (
      <Tabs value={theme} onValueChange={setTheme} className={cn(className)}>
        <TabsList
          className={cn(
            "inline-flex items-center rounded-lg border p-1",
            "border-border bg-muted"
          )}
        >
          {themes.map((themeOption) => {
            const Icon = themeIcons[themeOption]
            const isSelected = theme === themeOption

            return (
              <TabsTrigger
                key={themeOption}
                value={themeOption}
                className={cn(
                  "relative inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all",
                  size === "sm"
                    ? "h-6 px-2"
                    : size === "md"
                      ? "h-7 px-3"
                      : "h-8 px-4",
                  isSelected && "text-foreground"
                )}
              >
                {isSelected && (
                  <motion.div
                    layoutId="segmented-bg"
                    className="absolute inset-0 rounded-md bg-card shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <div className="relative z-10 flex items-center gap-1">
                  <Icon size={size === "sm" ? 12 : size === "md" ? 14 : 16} />
                  {showLabel && <span>{themeConfigs[themeOption].label}</span>}
                </div>
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>
    )
  }

  if (variant === "grid") {
    return (
      <div className={cn("flex justify-center", className)}>
        <RadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
          className="flex gap-2"
        >
          {themes.map((themeOption) => {
            const config = themeConfigs[themeOption]
            const Icon = themeIcons[themeOption]
            const isSelected = theme === themeOption

            return (
              <motion.label
                key={themeOption}
                htmlFor={`theme-${themeOption}`}
                className={cn(
                  "relative flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 p-2 transition-all",
                  size === "sm"
                    ? "h-16 w-16"
                    : size === "md"
                      ? "h-20 w-20"
                      : "h-24 w-24",
                  isSelected
                    ? "border-primary"
                    : "border-border"
                )}
                style={{
                  background: `${config.colors.background}`,
                  borderColor: isSelected
                    ? config.colors.primary
                    : config.colors.border,
                }}
              >
                <RadioGroupItem
                  id={`theme-${themeOption}`}
                  value={themeOption}
                  className="peer sr-only"
                />

                <span className="flex flex-col items-center justify-center gap-2 text-center text-xs font-medium">
                  <Icon
                    size={size === "sm" ? 16 : size === "md" ? 20 : 24}
                    style={{ color: config.colors.foreground }}
                  />
                  {showLabel && (
                    <span style={{ color: config.colors.foreground }}>
                      {config.label}
                    </span>
                  )}
                </span>
              </motion.label>
            )
          })}
        </RadioGroup>
      </div>
    )
  }

  if (variant === "radial") {
    const radius = size === "sm" ? 60 : size === "md" ? 80 : 100
    const centerSize = size === "sm" ? 40 : size === "md" ? 48 : 56

    function isTheme(value: unknown): value is Theme {
      return (
        typeof value === "string" && ["light", "dark", "system"].includes(value)
      )
    }

    const safeTheme: Theme =
      isTheme(theme) && themes?.includes(theme) ? theme : "light"

    return (
      <div className={cn("relative", className)}>
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center justify-center rounded-full border-2 transition-all",
            "border-primary bg-primary text-primary-foreground",
            "shadow-lg hover:scale-110"
          )}
          style={{
            width: centerSize,
            height: centerSize,
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            {React.createElement(themeIcons[safeTheme], {
              size: iconSizes[size],
            })}
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <>
              {themes.map((themeOption, index) => {
                const Icon = themeIcons[themeOption]
                const angle = (index * 360) / themes.length
                const x = Math.cos((angle - 90) * (Math.PI / 180)) * radius
                const y = Math.sin((angle - 90) * (Math.PI / 180)) * radius
                const isSelected = theme === themeOption

                return (
                  <motion.button
                    key={themeOption}
                    onClick={() => {
                      setTheme(themeOption)
                      setIsOpen(false)
                    }}
                    className={cn(
                      "absolute flex items-center justify-center rounded-full border-2 shadow-lg",
                      "hover:scale-110",
                      size === "sm"
                        ? "h-8 w-8"
                        : size === "md"
                          ? "h-10 w-10"
                          : "h-12 w-12",
                      isSelected
                        ? "scale-125 border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground"
                    )}
                    style={{
                      left: `calc(50% + ${x}px - ${size === "sm" ? 16 : size === "md" ? 20 : 24}px)`,
                      top: `calc(50% + ${y}px - ${size === "sm" ? 16 : size === "md" ? 20 : 24}px)`,
                    }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Icon size={size === "sm" ? 12 : size === "md" ? 16 : 18} />
                  </motion.button>
                )
              })}
            </>
          )}
        </AnimatePresence>
      </div>
    )
  }
   
  return null
}
