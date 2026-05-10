"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ChevronDown,
  ExternalLink,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info
} from "lucide-react"
import { permissionValidator, type PermissionValidationResult } from "@/lib/github-permissions"

interface PermissionValidationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoFullName: string
  onValidated: (result: PermissionValidationResult) => void
}

export function PermissionValidationDialog({
  open,
  onOpenChange,
  repoFullName,
  onValidated
}: PermissionValidationDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PermissionValidationResult | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const validatePermissions = async () => {
    if (!repoFullName) return

    try {
      setLoading(true)
      setError(null)

      const validationResult = await permissionValidator.validateImportPermissions(repoFullName)
      setResult(validationResult)

    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de validation")
    } finally {
      setLoading(false)
    }
  }

  // Validate permissions when dialog opens
  useEffect(() => {
    if (open && repoFullName) {
      validatePermissions()
    }
  }, [open, repoFullName])

  const handleContinue = () => {
    if (result) {
      onValidated(result)
    }
    onOpenChange(false)
  }

  const getPermissionIcon = (hasPermission: boolean, isRequired: boolean = false) => {
    if (hasPermission) {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    } else if (isRequired) {
      return <XCircle className="h-4 w-4 text-destructive" />
    } else {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    }
  }

  const getPermissionBadge = (level: string) => {
    const colors = {
      owner: "default",
      admin: "destructive", 
      maintainer: "secondary",
      collaborator: "outline",
      none: "outline"
    } as const

    return (
      <Badge variant={colors[level as keyof typeof colors] || "outline"}>
        {level.charAt(0).toUpperCase() + level.slice(1)}
      </Badge>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Validation des Permissions GitHub
          </DialogTitle>
          <DialogDescription>
            Vérification des permissions nécessaires pour {repoFullName}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Validation des permissions...</span>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erreur de validation</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="space-y-4">
            {/* Overall Status */}
            <Alert variant={result.valid ? "default" : "destructive"}>
              {result.valid ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <ShieldX className="h-4 w-4" />
              )}
              <AlertTitle>
                {result.valid ? "Permissions Validées" : "Permissions Insuffisantes"}
              </AlertTitle>
              <AlertDescription>
                {result.valid 
                  ? "Vous avez les permissions nécessaires pour importer ce repository."
                  : "Des permissions supplémentaires sont requises pour importer ce repository."
                }
              </AlertDescription>
            </Alert>

            {/* Current Permissions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vos Permissions Actuelles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Votre rôle:</span>
                  {getPermissionBadge(result.permissions.user_role)}
                </div>
                
                {result.permissions.organization_role && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Rôle organisation:</span>
                    {getPermissionBadge(result.permissions.organization_role)}
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    {getPermissionIcon(result.permissions.can_import, true)}
                    <span>Importer le repository</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {getPermissionIcon(result.permissions.can_manage_webhooks)}
                    <span>Gérer les webhooks</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {getPermissionIcon(result.permissions.can_invite_collaborators)}
                    <span>Inviter des collaborateurs</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {getPermissionIcon(result.permissions.permissions.push)}
                    <span>Accès au code</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Missing Permissions */}
            {result.permissions.missing_permissions.length > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Permissions Manquantes</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {result.permissions.missing_permissions.map((permission, index) => (
                      <li key={index} className="text-sm">{permission}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Warnings */}
            {result.permissions.warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Avertissements</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {result.permissions.warnings.map((warning, index) => (
                      <li key={index} className="text-sm">{warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Recommendations */}
            {result.recommendations.length > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Recommandations</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {result.recommendations.map((rec, index) => (
                      <li key={index} className="text-sm">{rec}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Detailed Permissions */}
            <Collapsible open={showDetails} onOpenChange={setShowDetails}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full">
                  <span>Voir les détails des permissions</span>
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Permissions GitHub Détaillées</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {Object.entries(result.permissions.permissions).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="capitalize">{key}:</span>
                          <Badge variant={value ? "default" : "outline"}>
                            {value ? "Oui" : "Non"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {result?.valid 
              ? "✅ Prêt pour l'import" 
              : result && !result.valid 
              ? "⚠️ Import limité possible" 
              : ""
            }
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button 
              onClick={handleContinue}
              disabled={!result || !result.permissions.can_import}
              variant={result?.valid ? "default" : "secondary"}
            >
              {result?.valid ? "Continuer l'Import" : "Import Limité"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}