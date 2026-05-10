"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AVAILABLE_PERMISSIONS,
  PERMISSION_CATEGORIES,
  DEFAULT_ROLE_PERMISSIONS,
  type Permission,
} from "@/lib/permissions"

interface PermissionEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userName: string
  currentRole: string
  currentPermissions: string[]
  onSave: (permissions: string[]) => Promise<void>
}

export function PermissionEditor({
  open,
  onOpenChange,
  userId,
  userName,
  currentRole,
  currentPermissions,
  onSave,
}: PermissionEditorProps) {
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(currentPermissions)
  )
  const [isSaving, setIsSaving] = useState(false)

  const roleDefaults = DEFAULT_ROLE_PERMISSIONS[currentRole] || []
  const roleDefaultsSet = new Set(roleDefaults)

  const togglePermission = (permission: string) => {
    const newPermissions = new Set(selectedPermissions)
    if (newPermissions.has(permission)) {
      newPermissions.delete(permission)
    } else {
      newPermissions.add(permission)
    }
    setSelectedPermissions(newPermissions)
  }

  const resetToRoleDefaults = () => {
    setSelectedPermissions(new Set(roleDefaults))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave(Array.from(selectedPermissions))
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to save permissions:", error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Permissions - {userName}</DialogTitle>
          <DialogDescription>
            Role: <span className="font-medium">{currentRole}</span>. Customize
            permissions for this user. Checked items = active permissions.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {Object.entries(PERMISSION_CATEGORIES).map(([category, permissions]) => (
              <div key={category} className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground border-b pb-1">
                  {category}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {permissions.map((permission) => {
                    const isSelected = selectedPermissions.has(permission)
                    const isRoleDefault = roleDefaultsSet.has(permission)
                    const description = AVAILABLE_PERMISSIONS[permission as Permission]

                    return (
                      <div
                        key={permission}
                        className="flex items-start space-x-3 p-2 rounded hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          id={`perm-${permission}`}
                          checked={isSelected}
                          onCheckedChange={() => togglePermission(permission)}
                        />
                        <div className="flex-1 space-y-0.5">
                          <Label
                            htmlFor={`perm-${permission}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {permission}
                            {isRoleDefault && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (default)
                              </span>
                            )}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {description}
                          </p>
                        </div>
                        {isSelected && (
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row justify-between items-center border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={resetToRoleDefaults}
            disabled={isSaving}
          >
            Reset to Role Defaults
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Permissions"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
