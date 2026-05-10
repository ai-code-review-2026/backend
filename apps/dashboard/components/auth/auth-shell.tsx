"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Activity, Hexagon } from "lucide-react"

import { Theme } from "@/components/ui/theme"

type AuthMode = "sign-in" | "sign-up"

type AuthShellProps = {
  children: ReactNode
  mode: AuthMode
}

function BrandLogo() {
  return (
    <span className="relative flex size-11 items-center justify-center overflow-hidden rounded-[10px] bg-[--orange] text-white shadow-[0_12px_30px_var(--auth-orange-shadow)]">
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_42%)]" />
      <Hexagon className="relative h-6 w-6" strokeWidth={2.2} />
      <span className="absolute size-3 rounded-full border-2 border-white/90" />
    </span>
  )
}

export function AuthShell({ children, mode }: AuthShellProps) {

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-[#F4F4F5] dark:bg-[#0B0D12] text-foreground">
      <section className="relative flex h-full w-full flex-col overflow-hidden bg-[#F4F4F5] dark:bg-[#0B0D12]">

        <div className="relative flex h-16 shrink-0 items-center justify-between px-6 sm:px-10 lg:h-20 lg:px-12">
          <Link href="/" className="inline-flex items-center gap-4">
            <BrandLogo />
            <span>
              <span className="block text-xl font-semibold tracking-tight text-foreground lg:text-2xl">Devora</span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.42em] text-muted-foreground lg:text-[10px] lg:tracking-[0.5em]">
                AI Review Workspace
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="hidden h-8 items-center gap-2 rounded-full border border-[--auth-border] bg-[--auth-glass] px-4 text-xs text-muted-foreground shadow-sm sm:flex">
              <Activity className="h-3.5 w-3.5 text-[--orange]" />
              Real-time sync
            </div>
            <Theme
              variant="button"
              size="sm"
              className="h-8 rounded-full border-[--auth-border] bg-[--auth-glass] px-2 hover:bg-[--auth-panel-muted]"
            />
          </div>
        </div>

        <div className="relative grid min-h-0 flex-1 items-center gap-6 overflow-hidden px-6 py-4 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(520px,0.86fr)] lg:gap-12 lg:px-12 lg:py-5 xl:px-20 2xl:px-28">
          <div className="order-2 hidden w-full max-w-[760px] lg:order-1 lg:flex lg:items-center lg:justify-center">
            <div className="relative h-full w-full overflow-hidden rounded-[16px] bg-[#F4F4F5] dark:bg-[#0B0D12]">
              <video
                className="h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="Devora workspace preview"
              >
                <source src="/videos/login.webm" type="video/webm" />
              </video>
            </div>
          </div>

          <div className="order-1 mx-auto min-h-0 w-full max-w-[620px] lg:order-2">
            <div className="max-h-full overflow-hidden rounded-[16px] bg-[#F4F4F5] dark:bg-[#0B0D12] px-6 py-5 sm:px-8 sm:py-7 border-0 outline-none shadow-none">
              {children}
            </div>
          </div>
        </div>

        <div className="relative flex h-12 shrink-0 flex-wrap items-center gap-x-10 gap-y-2 px-6 text-xs text-muted-foreground sm:px-10 lg:px-12 xl:px-20 2xl:px-28">
          <span>Copyright 2026 Devora. All rights reserved.</span>
          <Link href="/privacy" className="transition-colors hover:text-[--orange]">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-[--orange]">
            Terms
          </Link>
        </div>
      </section>
    </main>
  )
}
