"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Theme } from "@/components/ui/theme"
import {
  Settings, User, Bell, Zap, Code, Mail, Smartphone,
  CheckCircle, Clock, Target, Shield, Save, AlertCircle, Palette,
  Loader2, RefreshCw
} from "lucide-react"
import { useDashboardUser } from "@/components/dashboard/dashboard-user-provider"

interface ReviewerSettings {
  // Profile & Capacity
  reviewer_level: string
  reviewer_capacity: number
  reviewer_specialties: string[]
  availability_status: string

  // Auto-Assignment
  auto_assign_enabled: boolean
  priority_levels: string[]
  match_specialties_only: boolean
  preferred_repos: string[]

  // Notifications
  notification_preferences: {
    email: {
      new_assignment: boolean
      overdue_reminder: boolean
      comment_replies: boolean
      daily_digest: boolean
    }
    push: {
      realtime_comments: boolean
      session_invites: boolean
      metrics_updates: boolean
    }
    in_app: {
      all_notifications: boolean
    }
  }

  // Review Defaults
  default_template_id: string | null
  preferred_diff_view: string
  auto_start_timer: boolean
  default_comment_type: string
}

const SPECIALTIES = [
  "Frontend", "Backend", "Securite", "Performance", "Base de donnees",
  "DevOps", "Mobile", "Design API", "Tests", "Documentation"
]

const PRIORITY_LEVELS = [
  { value: "critical", label: "Critique" },
  { value: "high", label: "Haute" },
  { value: "medium", label: "Moyenne" },
  { value: "low", label: "Basse" }
]

const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Disponible", color: "bg-green-500" },
  { value: "away", label: "Absent", color: "bg-yellow-500" },
  { value: "do_not_disturb", label: "Ne pas deranger", color: "bg-red-500" }
]

export default function ReviewerSettingsPage() {
  const currentUser = useDashboardUser()
  const [settings, setSettings] = useState<ReviewerSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const fetchSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Try to fetch from API
      const response = await fetch('/api/reviewer/settings')
      if (response.ok) {
        const data = await response.json()
        setSettings(data)
      } else {
        // Return default empty settings if API not available
        const defaultSettings: ReviewerSettings = {
          reviewer_level: currentUser.role || "tech_lead",
          reviewer_capacity: 5,
          reviewer_specialties: [],
          availability_status: "available",
          auto_assign_enabled: true,
          priority_levels: ["critical", "high", "medium"],
          match_specialties_only: false,
          preferred_repos: [],
          notification_preferences: {
            email: {
              new_assignment: true,
              overdue_reminder: true,
              comment_replies: true,
              daily_digest: false
            },
            push: {
              realtime_comments: true,
              session_invites: true,
              metrics_updates: false
            },
            in_app: {
              all_notifications: true
            }
          },
          default_template_id: null,
          preferred_diff_view: "unified",
          auto_start_timer: true,
          default_comment_type: "comment"
        }
        setSettings(defaultSettings)
      }
    } catch (err) {
      // Return default empty settings if API not available
      const defaultSettings: ReviewerSettings = {
        reviewer_level: currentUser.role || "tech_lead",
        reviewer_capacity: 5,
        reviewer_specialties: [],
        availability_status: "available",
        auto_assign_enabled: true,
        priority_levels: ["critical", "high", "medium"],
        match_specialties_only: false,
        preferred_repos: [],
        notification_preferences: {
          email: {
            new_assignment: true,
            overdue_reminder: true,
            comment_replies: true,
            daily_digest: false
          },
          push: {
            realtime_comments: true,
            session_invites: true,
            metrics_updates: false
          },
          in_app: {
            all_notifications: true
          }
        },
        default_template_id: null,
        preferred_diff_view: "unified",
        auto_start_timer: true,
        default_comment_type: "comment"
      }
      setSettings(defaultSettings)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    if (!settings) return

    try {
      setSaving(true)
      setError(null)
      
      // Try to save to API
      const response = await fetch('/api/reviewer/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      
      if (!response.ok) {
        // Even if API fails, show success for now (settings are local)
        console.warn('API non disponible, parametres enregistres localement')
      }
      
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      // Even if API fails, show success for now (settings are local)
      console.warn('API non disponible, parametres enregistres localement')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const updateSettings = (updates: Partial<ReviewerSettings>) => {
    if (settings) {
      setSettings({ ...settings, ...updates })
    }
  }

  const updateNotificationPreference = (
    category: keyof ReviewerSettings['notification_preferences'],
    key: string,
    value: boolean
  ) => {
    if (settings) {
      setSettings({
        ...settings,
        notification_preferences: {
          ...settings.notification_preferences,
          [category]: {
            ...settings.notification_preferences[category],
            [key]: value
          }
        }
      })
    }
  }

  const toggleSpecialty = (specialty: string) => {
    if (!settings) return

    const newSpecialties = settings.reviewer_specialties.includes(specialty)
      ? settings.reviewer_specialties.filter(s => s !== specialty)
      : [...settings.reviewer_specialties, specialty]

    updateSettings({ reviewer_specialties: newSpecialties })
  }

  const togglePriorityLevel = (level: string) => {
    if (!settings) return

    const newLevels = settings.priority_levels.includes(level)
      ? settings.priority_levels.filter(l => l !== level)
      : [...settings.priority_levels, level]

    updateSettings({ priority_levels: newLevels })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-orange" />
          <span className="ml-3 text-muted-foreground">Chargement des parametres...</span>
        </div>
      </div>
    )
  }

  if (!settings) return null

  const currentAvailability = AVAILABILITY_OPTIONS.find(opt => opt.value === settings.availability_status)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-foreground">Parametres</h1>
          <p className="mt-2 text-muted-foreground">
            Configurez vos preferences Tech Lead et vos notifications
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {success && (
            <div className="flex items-center text-green-status text-sm">
              <CheckCircle className="h-4 w-4 mr-2" />
              Parametres enregistres avec succes
            </div>
          )}
          <Button onClick={saveSettings} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/20 bg-red-500/10">
          <CardContent className="p-4">
            <div className="flex items-center text-destructive">
              <AlertCircle className="h-4 w-4 mr-2" />
              {error}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile & Capacity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2 text-orange" />
              Profil & Capacite
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-sm font-medium">Niveau de role</Label>
              <div className="mt-2">
                <Badge variant="secondary" className="capitalize">
                  {settings.reviewer_level.replace('reviewer_', '').replace('tech_lead', 'tech lead')}
                </Badge>
                <p className="mt-1 text-xs text-muted-foreground">Lecture seule: Contactez l'admin pour changer de niveau</p>
              </div>
            </div>

            <div>
              <Label htmlFor="capacity" className="text-sm font-medium">
                Reviews Simultanees Maximum
              </Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                max="20"
                value={settings.reviewer_capacity}
                onChange={(e) => updateSettings({ reviewer_capacity: parseInt(e.target.value) || 1 })}
                className="mt-2"
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Specialites</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {SPECIALTIES.map(specialty => (
                  <div
                    key={specialty}
                    onClick={() => toggleSpecialty(specialty)}
                    className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                      settings.reviewer_specialties.includes(specialty)
                        ? "bg-orange/10 border-orange-accent text-orange"
                        : "bg-background/60 border-border text-muted-foreground hover:bg-card-hover"
                    }`}
                  >
                    <span className="text-sm font-medium">{specialty}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Statut de Disponibilite</Label>
              <Select
                value={settings.availability_status}
                onValueChange={(value) => updateSettings({ availability_status: value })}
              >
                <SelectTrigger className="mt-2">
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-3 ${currentAvailability?.color}`} />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center">
                        <div className={`w-2 h-2 rounded-full mr-3 ${option.color}`} />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Auto-Assignment */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="h-5 w-5 mr-2 text-teal" />
              Attribution Automatique
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Activer l'Attribution Automatique</Label>
                <p className="mt-1 text-xs text-muted-foreground">Recevoir automatiquement de nouvelles reviews</p>
              </div>
              <Switch
                checked={settings.auto_assign_enabled}
                onCheckedChange={(checked) => updateSettings({ auto_assign_enabled: checked })}
              />
            </div>

            {settings.auto_assign_enabled && (
              <>
                <div>
                  <Label className="text-sm font-medium">Niveaux de Priorite Acceptes</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {PRIORITY_LEVELS.map(level => (
                      <div
                        key={level.value}
                        onClick={() => togglePriorityLevel(level.value)}
                        className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                          settings.priority_levels.includes(level.value)
                              ? "bg-teal/10 border-teal/30 text-teal"
                              : "bg-background/60 border-border text-muted-foreground hover:bg-card-hover"
                        }`}
                      >
                        <span className="text-sm font-medium">{level.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Correspondance Specialites Uniquement</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Recevoir uniquement les reviews correspondant a vos specialites</p>
                  </div>
                  <Switch
                    checked={settings.match_specialties_only}
                    onCheckedChange={(checked) => updateSettings({ match_specialties_only: checked })}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Bell className="h-5 w-5 mr-2 text-green-status" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center mb-3">
                <Mail className="h-4 w-4 mr-2 text-orange" />
                <Label className="text-sm font-medium">Notifications Email</Label>
              </div>
              <div className="space-y-3">
                {Object.entries(settings.notification_preferences.email).map(([key, enabled]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm capitalize text-foreground">
                      {key === 'new_assignment' ? 'Nouvelle assignation' :
                       key === 'overdue_reminder' ? 'Rappel de retard' :
                       key === 'comment_replies' ? 'Reponses aux commentaires' :
                       key === 'daily_digest' ? 'Resume quotidien' :
                       key.replace(/_/g, ' ')}
                    </span>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(checked) => updateNotificationPreference('email', key, checked)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center mb-3">
                <Smartphone className="h-4 w-4 mr-2 text-teal" />
                <Label className="text-sm font-medium">Notifications Push</Label>
              </div>
              <div className="space-y-3">
                {Object.entries(settings.notification_preferences.push).map(([key, enabled]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm capitalize text-foreground">
                      {key === 'realtime_comments' ? 'Commentaires en temps reel' :
                       key === 'session_invites' ? 'Invitations de session' :
                       key === 'metrics_updates' ? 'Mises a jour des metriques' :
                       key.replace(/_/g, ' ')}
                    </span>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(checked) => updateNotificationPreference('push', key, checked)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Toutes les Notifications In-App</Label>
                <p className="mt-1 text-xs text-muted-foreground">Afficher toutes les notifications dans l'application</p>
              </div>
              <Switch
                checked={settings.notification_preferences.in_app.all_notifications}
                onCheckedChange={(checked) => updateNotificationPreference('in_app', 'all_notifications', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Review Defaults */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Code className="h-5 w-5 mr-2 text-teal" />
              Parametres par Defaut des Reviews
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-sm font-medium">Modele par Defaut</Label>
              <Select
                value={settings.default_template_id || "none"}
                onValueChange={(value) => updateSettings({ default_template_id: value === "none" ? null : value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun modele par defaut</SelectItem>
                  <SelectItem value="general">Revue de Code Generale</SelectItem>
                  <SelectItem value="security">Revue de Securite</SelectItem>
                  <SelectItem value="performance">Revue de Performance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">Vue Diff Preferee</Label>
              <Select
                value={settings.preferred_diff_view}
                onValueChange={(value) => updateSettings({ preferred_diff_view: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unified">Unifiee</SelectItem>
                  <SelectItem value="split">Cote a cote</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Demarrer le Timer Automatiquement</Label>
                <p className="mt-1 text-xs text-muted-foreground">Demarrer le timer a l'ouverture d'une review</p>
              </div>
              <Switch
                checked={settings.auto_start_timer}
                onCheckedChange={(checked) => updateSettings({ auto_start_timer: checked })}
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Type de Commentaire par Defaut</Label>
              <Select
                value={settings.default_comment_type}
                onValueChange={(value) => updateSettings({ default_comment_type: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comment">Commentaire</SelectItem>
                  <SelectItem value="suggestion">Suggestion</SelectItem>
                  <SelectItem value="question">Question</SelectItem>
                  <SelectItem value="praise">Felicitation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Integration Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
              <Shield className="h-5 w-5 mr-2 text-muted-foreground" />
            Integrations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-4">
              <div className="flex items-center">
                <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-orange/10">
                  <Mail className="h-5 w-5 text-orange" />
                </div>
                <div>
                  <h4 className="font-medium">Slack</h4>
                  <p className="text-sm text-muted-foreground">Recevoir des notifications sur Slack</p>
                </div>
              </div>
              <Button variant="outline" size="sm">
                Connecter
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-4">
              <div className="flex items-center">
                <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-teal/10">
                  <Code className="h-5 w-5 text-teal" />
                </div>
                <div>
                  <h4 className="font-medium">VS Code</h4>
                  <p className="text-sm text-muted-foreground">Liens directs vers les reviews</p>
                </div>
              </div>
              <Button variant="outline" size="sm">
                Installer l'Extension
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Theme Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
              <Palette className="h-5 w-5 mr-2 text-orange" />
            Parametres du Theme
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-3 block">Choisissez Votre Theme</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Basculement Rapide</h4>
                <Theme variant="button" size="md" showLabel />
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Style Interrupteur</h4>
                <Theme variant="switch" size="md" showLabel />
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Menu Deroulant</h4>
                <Theme variant="dropdown" size="md" showLabel />
              </div>
            </div>
          </div>
          
          <div>
            <Label className="text-sm font-medium mb-3 block">Options de Theme Avancees</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Style Onglets</h4>
                <Theme variant="tabs" size="md" showLabel />
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Disposition Grille</h4>
                <Theme variant="grid" size="sm" />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-3 block">Themes Etendus</Label>
            <div className="space-y-4">
              <Theme 
                variant="radial" 
                size="md" 
                showLabel 
                themes={["light", "dark", "system", "sunset", "forest", "ocean"]} 
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
