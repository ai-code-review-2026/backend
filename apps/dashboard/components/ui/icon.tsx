import * as React from "react";
import { IconsaxIcon, type IconsaxIconProps } from "./iconsax-icon";
import { iconsaxRegistry, type IconsaxName } from "@/lib/iconsax-registry";

interface IconProps extends Omit<IconsaxIconProps, "Icon"> {
  name: IconsaxName;
}

const Icon = React.forwardRef<HTMLDivElement, IconProps>(
  ({ name, ...props }, ref) => {
    const IconComponent = iconsaxRegistry[name];
    
    if (!IconComponent) {
      console.warn(`Icon "${name}" not found in registry`);
      return null;
    }

    return (
      <IconsaxIcon
        ref={ref}
        Icon={IconComponent}
        {...props}
      />
    );
  }
);

Icon.displayName = "Icon";

export { Icon };