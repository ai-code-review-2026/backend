import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-none border w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-colors duration-200 overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-0 bg-primary text-primary-foreground px-2 py-0.5 text-xs font-semibold",
        secondary:
          "border-0 bg-secondary text-secondary-foreground px-2 py-0.5 text-xs font-semibold",
        destructive:
          "bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 text-xs",
        outline:
          "border border-border text-foreground px-2 py-0.5 text-xs",
        tag:
          "font-mono uppercase tracking-wider text-[--orange] bg-[--orange-glow] border border-[--border-accent] px-2 py-0.5 text-[11px]",
        "teal-tag":
          "font-mono uppercase tracking-wider text-[#17f0c4] bg-[#17f0c4]/10 border border-[#17f0c4]/30 px-2 py-0.5 text-[11px]",
        success:
          "bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 text-xs",
        warning:
          "bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 text-xs",
        error:
          "bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 text-xs",
        outlinePrimary:
          "border border-primary/50 text-primary bg-primary/5 px-2 py-0.5 text-xs",
      },
      size: {
        default: "px-2 py-0.5 text-xs",
        sm: "px-1.5 py-0.5 text-[10px]",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Badge({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const hasSingleChildElement =
    React.Children.count(children) === 1 && React.isValidElement(children);
  const Comp = asChild && hasSingleChildElement ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
