"use client"
/* eslint-disable react/no-unescaped-entities */

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Plug, CheckCircle2, XCircle, RotateCw, Key, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { extractApiErrorMessage, formatDisplayValue } from "@/lib/display"
import { BANNER_INFO, INPUT_STANDARD } from "@/lib/design-tokens"

type GithubReposPayload = {
  connected?: boolean
  items?: Array<{
    id: number
    fullName: string
    private: boolean
  }>
  error?: string | null
  login?: string | null
  tokenAvailable?: boolean
  note?: string | null
}

type IntegrationsPayload = {
  config?: {
    ciEnabled?: boolean
    failOnBlocker?: boolean
  }
  ciToken?: {
    exists?: boolean
    prefix?: string | null
    createdAt?: string | null
    revoked?: boolean
  }
  storage?: {
    enabled?: boolean
    provider?: string
    endpoint?: string
    bucket?: string
    secure?: boolean
  }
  providers?: {
    githubAppConfigured?: boolean
    githubWebhookConfigured?: boolean
    qdrantEnabled?: boolean
  }
  webhooks?: Array<{
    repo: string
    event: string
    timestamp?: string | null
  }>
  error?: string
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "n/a"
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString("fr-FR")
}

export function Integrations() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [integrationData, setIntegrationData] = useState<IntegrationsPayload | null>(null)
  const [githubData, setGithubData] = useState<GithubReposPayload | null>(null)
  const [lastRotatedToken, setLastRotatedToken] = useState<string | null>(null)
  const [storageProbe, setStorageProbe] = useState<{ ok: boolean; message: string; checkedAt: string } | null>(null)

  const loadIntegrations = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const [integrationsResponse, githubResponse] = await Promise.all([
        fetch("/api/dashboard/admin/integrations", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        fetch("/api/dashboard/github/repos", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
      ])

      const integrationsPayload = (await integrationsResponse.json().catch(() => ({}))) as IntegrationsPayload
      const githubPayload = (await githubResponse.json().catch(() => ({}))) as GithubReposPayload

      if (!integrationsResponse.ok) {
        throw new Error(extractApiErrorMessage(integrationsPayload, "Impossible de charger les integrations."))
      }

      setIntegrationData(integrationsPayload)
      setGithubData(githubPayload)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de charger les integrations.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadIntegrations()
  }, [])

  const config = integrationData?.config ?? { ciEnabled: true, failOnBlocker: true }
  const ciToken = integrationData?.ciToken ?? { exists: false, revoked: true }
  const storage = integrationData?.storage ?? {
    enabled: false,
    provider: "S3 Compatible (MinIO)",
    endpoint: "-",
    bucket: "-",
    secure: false,
  }
  const storageEnabled = Boolean(storage.enabled)

  const githubConnectionStatus: "loading" | "connected" | "disconnected" =
    loading
      ? "loading"
      : githubData?.connected !== false ||
          githubData?.tokenAvailable === true ||
          (githubData?.items?.length ?? 0) > 0 ||
          Boolean(githubData?.login)
        ? "connected"
        : "disconnected"
  const githubRepoCount = githubData?.items?.length ?? 0

  const saveConfig = async (updates: { ciEnabled?: boolean; failOnBlocker?: boolean }) => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/dashboard/admin/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(updates),
      })
      const payload = (await response.json().catch(() => ({}))) as IntegrationsPayload
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload, "Mise a jour integration impossible."))
      }
      setIntegrationData((previous) => ({
        ...(previous ?? {}),
        ...payload,
        config: payload.config ?? previous?.config,
      }))
      setMessage("Configuration integration sauvegardee.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mise a jour integration impossible.")
    } finally {
      setSaving(false)
    }
  }

  const rotateToken = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/dashboard/admin/integrations/ci-token", {
        method: "POST",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as {
        token?: string
        prefix?: string
        createdAt?: string
        error?: string
      }
      const rotatedToken = payload.token
      if (!response.ok || typeof rotatedToken !== "string") {
        throw new Error(extractApiErrorMessage(payload, "Rotation token impossible."))
      }
      setLastRotatedToken(rotatedToken)
      setIntegrationData((previous) => ({
        ...(previous ?? {}),
        ciToken: {
          exists: true,
          prefix: payload.prefix ?? rotatedToken.slice(0, 12),
          createdAt: payload.createdAt ?? new Date().toISOString(),
          revoked: false,
        },
      }))
      setMessage("Nouveau token CI genere.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rotation token impossible.")
    } finally {
      setSaving(false)
    }
  }

  const revokeToken = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/dashboard/admin/integrations/ci-token", {
        method: "DELETE",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload, "Revocation token impossible."))
      }
      setLastRotatedToken(null)
      setIntegrationData((previous) => ({
        ...(previous ?? {}),
        ciToken: {
          ...(previous?.ciToken ?? {}),
          exists: false,
          revoked: true,
        },
      }))
      setMessage("Token CI revoque.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revocation token impossible.")
    } finally {
      setSaving(false)
    }
  }

  const testStorage = async () => {
    if (!storageEnabled) {
      const checkedAt = new Date().toISOString()
      const disabledMessage =
        "Le stockage objet est desactive. Active OBJECT_STORAGE_ENABLED=true et configure MinIO avant de tester la connexion."
      setStorageProbe({
        ok: false,
        message: disabledMessage,
        checkedAt,
      })
      setMessage(disabledMessage)
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/dashboard/admin/integrations/storage/test", {
        method: "POST",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
        checkedAt?: string
        error?: string
      }
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload, "Test stockage impossible."))
      }
      setStorageProbe({
        ok: Boolean(payload.ok),
        message: formatDisplayValue(payload.message) || (payload.ok ? "OK" : "KO"),
        checkedAt: payload.checkedAt ?? new Date().toISOString(),
      })
      setMessage(formatDisplayValue(payload.message) || "Test stockage termine.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test stockage impossible.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div className="max-w-4xl mx-auto space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="flex justify-between items-start" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <h1 className="card-heading text-foreground mb-2 flex items-center gap-3">
            <Plug className="h-10 w-10 text-cyan-500" />
            Integrations
          </h1>
          <p className="text-muted-foreground">Configuration Git, CI et stockage reelle</p>
        </div>
      </motion.div>

      {message && (
        <div className={BANNER_INFO}>
          {message}
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Git Providers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <motion.div className="flex items-start justify-between p-6 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 group hover:border-gray-300 dark:hover:border-gray-600 transition-all" whileHover={{ x: 4 }}>
              <div className="flex items-start gap-4">
                <motion.div className="w-14 h-14 bg-gray-900 dark:bg-white rounded-xl flex items-center justify-center shadow-lg" whileHover={{ scale: 1.1, rotate: 5 }}>
                  <svg className="w-8 h-8 text-white dark:text-foreground" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </motion.div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-xl text-foreground">GitHub</span>
                    {githubConnectionStatus === "connected" ? (
                      <Badge className="gap-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white">
                        <CheckCircle2 className="h-3 w-3" />
                        Connecte
                      </Badge>
                    ) : githubConnectionStatus === "loading" ? (
                      <Badge variant="outline" className="gap-1">
                        <RotateCw className="h-3 w-3 animate-spin" />
                        Chargement
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Non connecte
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {githubRepoCount} repository(s) visible(s) via integration utilisateur.
                  </p>
                  <Badge variant="outline" className="text-xs">
                    {integrationData?.providers?.githubWebhookConfigured ? "Webhooks configures" : "Webhooks non configures"}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => void loadIntegrations()} disabled={loading}>
                  <RotateCw className="h-3 w-3" />
                  Tester
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/admin/organization">Configurer</Link>
                </Button>
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 backdrop-blur-xl border-blue-200/50 dark:border-blue-800/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Configuration CI
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <motion.div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-gray-900/50 border border-blue-200/50 dark:border-blue-800/50" whileHover={{ x: 4 }}>
              <div className="space-y-1">
                <Label className="text-base">Integration CI active</Label>
                <p className="text-sm text-muted-foreground">Analyser automatiquement les PRs via CI/CD</p>
              </div>
              <motion.div whileTap={{ scale: 0.9 }}>
                <Switch
                  checked={Boolean(config.ciEnabled)}
                  onCheckedChange={(value) => {
                    setIntegrationData((previous) => ({
                      ...(previous ?? {}),
                      config: {
                        ...(previous?.config ?? {}),
                        ciEnabled: value,
                        failOnBlocker: previous?.config?.failOnBlocker ?? true,
                      },
                    }))
                    void saveConfig({ ciEnabled: value })
                  }}
                />
              </motion.div>
            </motion.div>

            <div>
              <Label>Token API pour CI</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  type="text"
                  value={
                    ciToken.exists && !ciToken.revoked
                      ? `${ciToken.prefix ?? "token"}****************`
                      : "Aucun token actif"
                  }
                  readOnly
                  className={`font-mono text-sm ${INPUT_STANDARD}`}
                />
                <Button variant="outline" size="sm" className="gap-2" onClick={() => void rotateToken()} disabled={saving}>
                  <Key className="h-3 w-3" />
                  Rotation
                </Button>
                <Button variant="outline" size="sm" onClick={() => void revokeToken()} disabled={saving}>
                  Revoquer
                </Button>
              </div>
              {ciToken.createdAt && (
                <p className="text-sm text-muted-foreground mt-2">
                  Derniere rotation: {formatTimestamp(ciToken.createdAt)}
                </p>
              )}
              {lastRotatedToken && (
                <p className="text-xs text-emerald-300 mt-2 break-all">
                  Nouveau token (affiche une seule fois): {lastRotatedToken}
                </p>
              )}
            </div>

            <motion.div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-gray-900/50 border border-blue-200/50 dark:border-blue-800/50" whileHover={{ x: 4 }}>
              <div className="space-y-1">
                <Label className="text-base">Fail on BLOCKER</Label>
                <p className="text-sm text-muted-foreground">
                  Faire echouer le build CI si des BLOCKER sont detectes
                </p>
              </div>
              <motion.div whileTap={{ scale: 0.9 }}>
                <Switch
                  checked={Boolean(config.failOnBlocker)}
                  onCheckedChange={(value) => {
                    setIntegrationData((previous) => ({
                      ...(previous ?? {}),
                      config: {
                        ...(previous?.config ?? {}),
                        ciEnabled: previous?.config?.ciEnabled ?? true,
                        failOnBlocker: value,
                      },
                    }))
                    void saveConfig({ failOnBlocker: value })
                  }}
                />
              </motion.div>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Stockage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-3">
                <Label>Provider de stockage</Label>
                <Badge
                  variant="outline"
                  className={
                    storageEnabled
                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                      : "border-amber-400/40 bg-amber-500/10 text-amber-200"
                  }
                >
                  {storageEnabled ? "Active" : "Desactive"}
                </Badge>
              </div>
              <Input value={storage.provider ?? "S3 Compatible (MinIO)"} readOnly className={`mt-2 ${INPUT_STANDARD}`} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Endpoint</Label>
                <Input value={storage.endpoint ?? "-"} readOnly className={`mt-2 ${INPUT_STANDARD}`} />
              </div>
              <div>
                <Label>Bucket</Label>
                <Input value={storage.bucket ?? "-"} readOnly className={`mt-2 ${INPUT_STANDARD}`} />
              </div>
            </div>
            {!storageEnabled && (
              <div className="rounded-xl border border-amber-200/50 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
                Le stockage objet est actuellement desactive dans le backend. Active <code>OBJECT_STORAGE_ENABLED=true</code> et configure MinIO pour lancer un probe reussi.
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => void testStorage()}
                disabled={saving || !storageEnabled}
                title={storageEnabled ? "Tester la connexion au stockage" : "Active d'abord le stockage objet dans la configuration backend"}
              >
                <RotateCw className="h-3 w-3" />
                Tester connexion
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/admin/organization">Configurer</Link>
              </Button>
            </div>
            {storageProbe && (
              <motion.div className={`p-4 rounded-xl border flex items-start gap-3 ${storageProbe.ok ? "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200/50 dark:border-green-800/50" : "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200/50 dark:border-amber-800/50"}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                {storageProbe.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-[color:var(--green-status)] mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-[color:var(--orange)] dark:text-amber-400 mt-0.5 flex-shrink-0" />
                )}
                <div className="text-sm">
                  <div>{storageProbe.message}</div>
                  <div className="text-xs opacity-80 mt-1">{formatTimestamp(storageProbe.checkedAt)}</div>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Statut des webhooks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(integrationData?.webhooks ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun webhook recent.</p>
              ) : (
                (integrationData?.webhooks ?? []).map((webhook, index) => (
                  <motion.div key={`${webhook.repo}-${index}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + index * 0.1 }} whileHover={{ x: 4 }} className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-gray-50 to-transparent dark:from-gray-800/50 dark:to-transparent border border-gray-200/50 dark:border-gray-700/50">
                    <div className="flex items-center gap-3">
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2, delay: index * 0.5 }}>
                        <CheckCircle2 className="h-5 w-5 text-[color:var(--green-status)]" />
                      </motion.div>
                      <div>
                        <span className="font-medium text-foreground">{webhook.repo}</span>
                        <p className="text-sm text-muted-foreground mt-1">
                          Dernier evenement: {webhook.event} • {formatTimestamp(webhook.timestamp)}
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white">Actif</Badge>
                  </motion.div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
