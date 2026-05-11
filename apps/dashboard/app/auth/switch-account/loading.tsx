import { Activity, ArrowRight, Hexagon, Loader2, ShieldCheck } from "lucide-react"

import { Theme } from "@/components/ui/theme"

function BrandLogo() {
  return (
    <span className="relative flex size-10 items-center justify-center overflow-hidden rounded-[10px] bg-[--orange] text-white shadow-[0_12px_30px_var(--auth-orange-shadow)]">
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_42%)]" />
      <Hexagon className="relative h-5 w-5" strokeWidth={2.2} />
      <span className="absolute size-2.5 rounded-full border-2 border-white/90" />
    </span>
  )
}

export default function SwitchAccountLoading() {
  return (
    <main className="relative h-[100dvh] overflow-hidden bg-[--auth-frame] text-foreground">
      <section className="relative flex h-full w-full flex-col overflow-hidden bg-[--auth-frame]">
        <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(var(--auth-grid)_1px,transparent_1px),linear-gradient(90deg,var(--auth-grid)_1px,transparent_1px)] [background-size:24px_24px]" />

        <header className="relative flex h-16 shrink-0 items-center justify-between px-6 sm:px-10 lg:h-20 lg:px-12">
          <div className="inline-flex items-center gap-4">
            <BrandLogo />
            <span>
              <span className="block text-xl font-semibold tracking-tight text-foreground">Devora</span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.42em] text-muted-foreground">
                AI Review Workspace
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden h-8 items-center gap-2 rounded-full border border-[--auth-border] bg-[--auth-glass] px-4 text-xs text-muted-foreground shadow-sm sm:flex">
              <Activity className="h-3.5 w-3.5 text-[--orange]" />
              Session switch
            </div>
            <Theme
              variant="button"
              size="sm"
              className="h-8 rounded-full border-[--auth-border] bg-[--auth-glass] px-2 hover:bg-[--auth-panel-muted]"
            />
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-4 sm:px-10 lg:px-12">
          <section className="w-full max-w-[540px] rounded-[16px] border border-[--auth-border] bg-[--auth-card] shadow-[0_22px_70px_var(--auth-card-shadow)]">
            <div className="border-b border-[--auth-border] px-5 py-5 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-[--border-accent] bg-[--auth-accent-soft] text-[--orange]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--orange]">
                    Session switch
                  </p>
                  <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    Changement de compte
                  </h1>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Nettoyage de la session locale avant redirection vers le formulaire de connexion.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex items-center gap-3 rounded-[10px] border border-[--auth-border] bg-[--auth-field] px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-[--orange]" />
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Preparing sign-in
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">Redirection en cours...</p>
                </div>
              </div>

              <a
                href="/auth/reset-session/"
                className="inline-flex items-center gap-2 text-sm font-medium text-[--orange] hover:underline"
              >
                Continuer manuellement
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
