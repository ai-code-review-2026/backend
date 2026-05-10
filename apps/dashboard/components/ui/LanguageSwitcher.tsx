"use client"

// Simple language switcher that just shows English
export function LanguageSwitcher() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="text-lg">🇺🇸</span>
      <span className="hidden sm:inline">English</span>
      <span className="sm:hidden">EN</span>
    </div>
  )
}