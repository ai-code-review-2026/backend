import { cn } from "@/lib/utils"
import { Theme } from "@/components/ui/theme"

export const ThemeTabs = () => {
  return (
    <div className="flex items-center gap-3">
      <Theme
        variant="tabs"
        size="sm"
        themes={["light", "dark", "system"]}
      />
      <Theme
        variant="tabs"
        size="md"
        showLabel
        themes={["light", "dark", "system"]}
      />
    </div>
  )
}

// Demo component showcasing all theme variants
export const ThemeShowcase = () => {
  return (
    <div className="space-y-8 p-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Button Variants</h3>
        <div className="flex items-center gap-4">
          <Theme variant="button" size="sm" />
          <Theme variant="button" size="md" />
          <Theme variant="button" size="lg" showLabel />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Switch Variants</h3>
        <div className="flex items-center gap-4">
          <Theme variant="switch" size="sm" />
          <Theme variant="switch" size="md" showLabel />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Dropdown Variants</h3>
        <div className="flex items-center gap-4">
          <Theme variant="dropdown" size="sm" />
          <Theme variant="dropdown" size="md" showLabel />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Tabs Variants</h3>
        <div className="flex items-center gap-4">
          <Theme variant="tabs" size="sm" />
          <Theme variant="tabs" size="md" showLabel />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Grid Variants</h3>
        <div className="flex items-center gap-4">
          <Theme variant="grid" size="sm" />
          <Theme variant="grid" size="md" showLabel />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Radial Variants</h3>
        <div className="flex items-center gap-4">
          <Theme variant="radial" size="sm" />
          <Theme variant="radial" size="md" showLabel />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Custom Theme Sets</h3>
        <div className="flex items-center gap-4">
          <Theme 
            variant="tabs" 
            size="md" 
            showLabel 
            themes={["light", "dark", "sunset", "ocean"]}
          />
          <Theme 
            variant="grid" 
            size="md" 
            showLabel 
            themes={["light", "dark", "sunset", "forest", "ocean"]}
          />
        </div>
      </div>
    </div>
  )
}

export default ThemeTabs
