"use client"
/* eslint-disable react/no-unescaped-entities */

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Shield, Save, TestTube, History, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { extractApiErrorMessage } from "@/lib/display"

type SeverityProfile = "strict" | "moderate" | "relaxed"

type RepoRule = {
  repo: string
  severityProfile: SeverityProfile
}

type PolicyConfig = {
  failOnBlocker: boolean
  maxComments: number
  enabledCategories: Record<string, boolean>
  ignoredPaths: string[]
  repoRules: RepoRule[]
}

type PoliciesPayload = {
  config?: PolicyConfig
  version?: number
  updatedAt?: string | null
  repos?: Array<{
    repo: string
    analysisCount: number
    lastAnalysisAt: string | null
  }>
  error?: string
}

type PolicyTestPayload = {
  decision?: "APPROVE" | "WARN" | "BLOCK"
  reasons?: string[]
  counts?: {
    blocker?: number
    warn?: number
    info?: number
    total?: number
    maxComments?: number
  }
  analysisId?: string
  repo?: string
  error?: string
}

const DEFAULT_POLICY: PolicyConfig = {
  failOnBlocker: true,
  maxComments: 50,
  enabledCategories: {
    security: true,
    performance: true,
    quality: true,
    maintainability: true,
  },
  ignoredPaths: ["vendor/**", "node_modules/**", "dist/**", "build/**"],
  repoRules: [],
}

export function PoliciesRules() {
  const [config, setConfig] = useState<PolicyConfig>(DEFAULT_POLICY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [version, setVersion] = useState<number>(0)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [availableRepos, setAvailableRepos] = useState<string[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string>("")
  const [selectedSeverityProfile, setSelectedSeverityProfile] = useState<SeverityProfile>("strict")
  const [testTarget, setTestTarget] = useState("")
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<PolicyTestPayload | null>(null)

  const ignoredPathsText = useMemo(() => config.ignoredPaths.join("\n"), [config.ignoredPaths])

  const loadPolicies = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch("/api/dashboard/admin/policies", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as PoliciesPayload
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload, "Impossible de charger les policies."))
      }
      setConfig(payload.config ?? DEFAULT_POLICY)
      setVersion(typeof payload.version === "number" ? payload.version : 0)
      setUpdatedAt(typeof payload.updatedAt === "string" ? payload.updatedAt : null)
      const repos = Array.isArray(payload.repos) ? payload.repos.map((item) => item.repo) : []
      setAvailableRepos(repos)
      setSelectedRepo((previous) => previous || repos[0] || "")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de charger les policies.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPolicies()
  }, [loadPolicies])

  const setCategoryEnabled = (category: keyof PolicyConfig["enabledCategories"], enabled: boolean) => {
    setConfig((previous) => ({
      ...previous,
      enabledCategories: {
        ...previous.enabledCategories,
        [category]: enabled,
      },
    }))
  }

  const savePolicies = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/dashboard/admin/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ config }),
      })
      const payload = (await response.json().catch(() => ({}))) as PoliciesPayload
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload, "Sauvegarde des policies impossible."))
      }
      setVersion(typeof payload.version === "number" ? payload.version : version)
      setUpdatedAt(typeof payload.updatedAt === "string" ? payload.updatedAt : updatedAt)
      setMessage("Policies sauvegardees.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sauvegarde des policies impossible.")
    } finally {
      setSaving(false)
    }
  }

  const addRepoRule = () => {
    if (!selectedRepo) {
      setMessage("Selectionnez un repository.")
      return
    }
    setConfig((previous) => {
      const exists = previous.repoRules.some(
        (rule) => rule.repo === selectedRepo && rule.severityProfile === selectedSeverityProfile,
      )
      if (exists) {
        return previous
      }
      return {
        ...previous,
        repoRules: [
          ...previous.repoRules,
          {
            repo: selectedRepo,
            severityProfile: selectedSeverityProfile,
          },
        ],
      }
    })
    setMessage("Regle repository ajoutee.")
  }

  const removeRepoRule = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      repoRules: previous.repoRules.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const runPolicyTest = async () => {
    setTesting(true)
    setMessage(null)
    setTestResult(null)
    try {
      const response = await fetch("/api/dashboard/admin/policies/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          target: testTarget.trim() || undefined,
          config,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as PolicyTestPayload
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload, "Test policy impossible."))
      }
      setTestResult(payload)
      setMessage("Test policy termine.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test policy impossible.")
    } finally {
      setTesting(false)
    }
  }

  return (
    <motion.div className="max-w-4xl mx-auto space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="flex justify-between items-start" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <h1 className="card-heading text-foreground mb-2 flex items-center gap-3">
            <Shield className="h-10 w-10 text-[color:var(--orange)]" />
            Policies & Rules
          </h1>
          <p className="text-muted-foreground">Configuration reelle des regles d'analyse</p>
        </div>
        <div className="flex gap-3">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button variant="outline" className="gap-2" onClick={() => setShowHistory((previous) => !previous)}>
              <History className="h-4 w-4" />
              Historique
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button className="gap-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700" onClick={() => void savePolicies()} disabled={saving || loading}>
              <Save className="h-4 w-4" />
              Sauvegarder
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {message && (
        <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          {message}
        </div>
      )}

      {showHistory && (
        <div className="rounded-xl border border-gray-200/60 bg-white/70 p-4 text-sm dark:border-gray-700/60 dark:bg-gray-900/60">
          <p>Version actuelle: {version}</p>
          <p>Derniere mise a jour: {updatedAt ? new Date(updatedAt).toLocaleString("fr-FR") : "n/a"}</p>
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Seuils de severite
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <motion.div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-gray-50 to-transparent dark:from-gray-800/50 dark:to-transparent border border-gray-200/50 dark:border-gray-700/50" whileHover={{ x: 4 }}>
              <div className="space-y-1">
                <Label className="text-base">Fail CI sur BLOCKER</Label>
                <p className="text-sm text-muted-foreground">
                  Bloquer la PR si des problemes BLOCKER sont detectes
                </p>
              </div>
              <motion.div whileTap={{ scale: 0.9 }}>
                <Switch checked={config.failOnBlocker} onCheckedChange={(value) => setConfig((previous) => ({ ...previous, failOnBlocker: value }))} />
              </motion.div>
            </motion.div>

            <div className="space-y-3">
              <Label className="text-base">Nombre maximum de commentaires par PR</Label>
              <div className="flex items-center gap-4">
                <Slider value={[config.maxComments]} onValueChange={(value) => setConfig((previous) => ({ ...previous, maxComments: value[0] ?? previous.maxComments }))} max={100} step={5} className="flex-1" />
                <motion.span className="text-sm font-semibold w-12 text-right px-3 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white" key={config.maxComments} initial={{ scale: 1.2 }} animate={{ scale: 1 }}>
                  {config.maxComments}
                </motion.span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Categories actives</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { id: "security", label: "Security", desc: "Vulnerabilites et problemes de securite", gradient: "from-red-500 to-orange-500" },
              { id: "performance", label: "Performance", desc: "Optimisations et goulots d'etranglement", gradient: "from-orange-500 to-yellow-500" },
              { id: "quality", label: "Quality", desc: "Bonnes pratiques et qualite du code", gradient: "from-blue-500 to-cyan-500" },
              { id: "maintainability", label: "Maintainability", desc: "Maintenabilite et lisibilite du code", gradient: "from-purple-500 to-pink-500" },
            ].map((category, index) => (
              <motion.div key={category.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + index * 0.1 }} whileHover={{ x: 4 }} className={`flex items-center justify-between p-4 rounded-xl bg-gradient-to-r ${category.gradient} bg-opacity-5 border border-gray-200/50 dark:border-gray-700/50`}>
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${category.gradient}`}>
                    <Shield className="h-5 w-5 text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-base">{category.label}</Label>
                    <p className="text-sm text-muted-foreground">{category.desc}</p>
                  </div>
                </div>
                <motion.div whileTap={{ scale: 0.9 }}>
                  <Switch checked={Boolean(config.enabledCategories[category.id])} onCheckedChange={(value) => setCategoryEnabled(category.id as keyof PolicyConfig["enabledCategories"], value)} />
                </motion.div>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Filtres de fichiers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Chemins ignores (glob patterns)</Label>
              <Textarea
                placeholder="Ex: vendor/**&#10;node_modules/**&#10;**/*.test.ts"
                className="mt-2 font-mono text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                rows={5}
                value={ignoredPathsText}
                onChange={(event) =>
                  setConfig((previous) => ({
                    ...previous,
                    ignoredPaths: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 backdrop-blur-xl border-blue-200/50 dark:border-blue-800/50">
          <CardHeader>
            <CardTitle>Regles par repository</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Repository</Label>
                <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                  <SelectTrigger className="mt-2 bg-white dark:bg-gray-800">
                    <SelectValue placeholder={availableRepos.length > 0 ? "Selectionner un repo" : "Aucun repo"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRepos.map((repo) => (
                      <SelectItem key={repo} value={repo}>
                        {repo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Profil de severite</Label>
                <Select value={selectedSeverityProfile} onValueChange={(value: SeverityProfile) => setSelectedSeverityProfile(value)}>
                  <SelectTrigger className="mt-2 bg-white dark:bg-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strict">Strict (production)</SelectItem>
                    <SelectItem value="moderate">Modere</SelectItem>
                    <SelectItem value="relaxed">Detendu (dev)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="outline" size="sm" className="bg-white dark:bg-gray-800" onClick={addRepoRule}>
              Ajouter regle specifique
            </Button>
            {config.repoRules.length > 0 && (
              <div className="space-y-2">
                {config.repoRules.map((rule, index) => (
                  <div key={`${rule.repo}-${rule.severityProfile}-${index}`} className="flex items-center justify-between rounded-lg border border-blue-200/40 bg-white/70 px-3 py-2 text-sm dark:border-blue-800/40 dark:bg-gray-900/40">
                    <span>
                      {rule.repo} - {rule.severityProfile}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => removeRepoRule(index)}>
                      Supprimer
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5 text-emerald-500" />
              Tester la policy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>PR, commit, ou analysis id</Label>
              <Input placeholder="Ex: PR #456, commit a3f2c1d, ou analysis id" className="mt-2 bg-white dark:bg-gray-800" value={testTarget} onChange={(event) => setTestTarget(event.target.value)} />
            </div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700" onClick={() => void runPolicyTest()} disabled={testing || loading}>
                <TestTube className="h-4 w-4" />
                Lancer test
              </Button>
            </motion.div>
            {testResult && (
              <div className="rounded-xl border border-gray-200/60 bg-white/70 p-4 text-sm dark:border-gray-700/60 dark:bg-gray-900/60">
                <p className="font-semibold">
                  Decision:{" "}
                  <span
                    className={
                      testResult.decision === "BLOCK"
                        ? "text-destructive"
                        : testResult.decision === "WARN"
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }
                  >
                    {testResult.decision}
                  </span>
                </p>
                <p className="mt-1">Analysis: {testResult.analysisId ?? "n/a"} ({testResult.repo ?? "n/a"})</p>
                <p className="mt-1">
                  Compteurs: BLOCKER {testResult.counts?.blocker ?? 0} | WARN {testResult.counts?.warn ?? 0} | INFO{" "}
                  {testResult.counts?.info ?? 0}
                </p>
                {Array.isArray(testResult.reasons) && testResult.reasons.length > 0 && (
                  <p className="mt-1">Raisons: {testResult.reasons.join(", ")}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
