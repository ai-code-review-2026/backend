import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const iconVariants = cva(
  "inline-block",
  {
    variants: {
      size: {
        default: "h-4 w-4",
        sm: "h-3 w-3",
        lg: "h-5 w-5",
        xl: "h-6 w-6",
        icon: "h-4 w-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface IconsaxIconProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof iconVariants> {
  Icon: React.ComponentType<any>;
  variant?: "Linear" | "Outline" | "Bold" | "Bulk" | "TwoTone" | "Broken";
  color?: string;
}

const IconsaxIcon = React.forwardRef<HTMLDivElement, IconsaxIconProps>(
  ({ className, size, Icon, variant = "Outline", color, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(iconVariants({ size, className }))}
        {...props}
      >
        <Icon
          variant={variant}
          color={color}
          className="w-full h-full"
        />
      </div>
    );
  }
);

IconsaxIcon.displayName = "IconsaxIcon";

export { IconsaxIcon, iconVariants };