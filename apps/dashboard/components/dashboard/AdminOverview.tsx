"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Activity, Building2, Database, Plug, Shield, Users } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AnimatedCounter } from "@/components/ui/animated-counter"

type AdminOverviewStats = {
  sources: number
  users: number
  policiesVersion: number
  queuedJobs: number
  integrationsHealthy: number
}

const SECTIONS = [
  { href: "/dashboard/admin/knowledge-base", label: "Base de Connaissance", icon: Database },
  { href: "/dashboard/admin/policies", label: "Policies & Rules", icon: Shield },
  { href: "/dashboard/admin/users", label: "Utilisateurs", icon: Users },
  { href: "/dashboard/admin/organization", label: "Organizations", icon: Building2 },
  { href: "/dashboard/admin/observability", label: "Observabilité", icon: Activity },
  { href: "/dashboard/admin/integrations", label: "Intégrations", icon: Plug },
]

export function AdminOverview() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<AdminOverviewStats>({
    sources: 0,
    users: 0,
    policiesVersion: 0,
    queuedJobs: 0,
    integrationsHealthy: 0,
  })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [kbRes, usersRes, policiesRes, observabilityRes, integrationsRes] = await Promise.all([
          fetch("/api/dashboard/admin/knowledge-base/repos?limit=1", { cache: "no-store" }),
          fetch("/api/dashboard/admin/users?limit=1", { cache: "no-store" }),
          fetch("/api/dashboard/admin/policies", { cache: "no-store" }),
          fetch("/api/dashboard/admin/observability", { cache: "no-store" }),
          fetch("/api/dashboard/admin/integrations", { cache: "no-store" }),
        ])

        const kbPayload = (await kbRes.json().catch(() => ({}))) as { total?: number; items?: unknown[] }
        const usersPayload = (await usersRes.json().catch(() => ({}))) as {
          stats?: { totalUsers?: number }
          items?: unknown[]
        }
        const policiesPayload = (await policiesRes.json().catch(() => ({}))) as { version?: number }
        const observabilityPayload = (await observabilityRes.json().catch(() => ({}))) as {
          metrics?: { queuedJobs?: number }
        }
        const integrationsPayload = (await integrationsRes.json().catch(() => ({}))) as {
          providers?: {
            githubAppConfigured?: boolean
            githubWebhookConfigured?: boolean
            qdrantEnabled?: boolean
          }
          storage?: { enabled?: boolean }
        }

        if (!kbRes.ok || !usersRes.ok || !policiesRes.ok || !observabilityRes.ok || !integrationsRes.ok) {
          throw new Error("Impossible de charger le panorama admin.")
        }

        const providerFlags = integrationsPayload.providers ?? {}
        const integrationsHealthy = [
          Boolean(providerFlags.githubAppConfigured),
          Boolean(providerFlags.githubWebhookConfigured),
          Boolean(providerFlags.qdrantEnabled),
          Boolean(integrationsPayload.storage?.enabled),
        ].filter(Boolean).length

        setStats({
          sources: Number(kbPayload.total ?? kbPayload.items?.length ?? 0),
          users: Number(usersPayload.stats?.totalUsers ?? usersPayload.items?.length ?? 0),
          policiesVersion: Number(policiesPayload.version ?? 0),
          queuedJobs: Number(observabilityPayload.metrics?.queuedJobs ?? 0),
          integrationsHealthy,
        })
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger le panorama admin.")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  return (
    <motion.div className="mx-auto max-w-6xl space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div>
        <h1 className="card-heading text-foreground">Administration</h1>
        <p className="meta-text text-muted-foreground">
          Vue consolidée des données réelles de la zone admin.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-400/50 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Sources KB", value: stats.sources },
          { label: "Utilisateurs", value: stats.users },
          { label: "Version policies", value: stats.policiesVersion },
          { label: "Jobs en attente", value: stats.queuedJobs },
          { label: "Intégrations OK", value: stats.integrationsHealthy },
        ].map((item) => (
          <Card key={item.label} variant="default">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <span className="text-2xl font-bold text-muted-foreground animate-pulse">—</span>
              ) : (
                <AnimatedCounter value={item.value} className="text-2xl font-bold text-foreground" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card variant="default">
        <CardHeader>
          <CardTitle>Sections</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <Link key={section.href} href={section.href}>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Icon className="h-4 w-4" />
                  {section.label}
                </Button>
              </Link>
            )
          })}
        </CardContent>
      </Card>
    </motion.div>
  )
}
