import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-[--orange] text-white hover:bg-[--orange-hover]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90",
        outline:
          "border border-[--border-card] bg-transparent text-foreground hover:border-[--orange] hover:text-[--orange]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-[--bg-card-inner] hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        teal:
          "border border-[#17f0c4] bg-[#17f0c4]/10 text-[#17f0c4] hover:bg-[#17f0c4]/20",
      },
      size: {
        default: "h-10 px-5 text-sm has-[>svg]:px-4",
        sm: "h-8 px-3 text-xs gap-1.5 has-[>svg]:px-2.5",
        lg: "h-12 px-7 text-base has-[>svg]:px-5",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
      loading?: boolean;
    }
>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      disabled,
      loading,
      children,
      ...props
    },
    ref,
  ) => {
    const hasSingleChildElement =
      React.Children.count(children) === 1 && React.isValidElement(children);
    const useSlot = asChild && hasSingleChildElement && !loading;
    const Comp = useSlot ? Slot : "button";

    return (
      <Comp
        data-slot="button"
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        {...props}
      >
        {useSlot ? (
          children
        ) : (
          <>
            {loading ? (
              <svg
                className="animate-spin-smooth-infinite h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
