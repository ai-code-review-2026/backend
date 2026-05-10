import * as React from "react";
import { X } from "lucide-react";

import { cn } from "./utils";

function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-border flex h-10 w-full min-w-0 rounded-none border px-3 py-2 text-sm bg-[--bg-card-inner] transition-colors duration-200 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:border-[--orange] focus:ring-0",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

// Floating label input (inspired by uiverse.io)
interface InputFloatingProps extends React.ComponentProps<"input"> {
  label: string;
  icon?: React.ReactNode;
  clearable?: boolean;
  onClear?: () => void;
}

const InputFloating = React.forwardRef<HTMLInputElement, InputFloatingProps>(
  ({ className, label, icon, clearable, onClear, ...props }, ref) => {
    const [hasValue, setHasValue] = React.useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(e.target.value.length > 0);
      props.onChange?.(e);
    };

    const handleClear = () => {
      setHasValue(false);
      onClear?.();
    };

    return (
      <div className="relative group">
        <input
          ref={ref}
          className={cn(
            "peer h-12 w-full rounded-xl border-2 border-border",
            "bg-transparent px-4 pt-4 pb-1 text-base",
            "outline-none transition-all duration-300",
            "focus:border-primary focus:shadow-pro-md focus:bg-background",
            "dark:focus:border-primary",
            "placeholder-transparent",
            "disabled:pointer-events-none disabled:opacity-50",
            icon && "pl-11",
            clearable && hasValue && "pr-10",
            className,
          )}
          placeholder=" "
          onChange={handleChange}
          {...props}
        />
        <label
          className={cn(
            "absolute left-4 top-1/2 -translate-y-1/2",
            "text-muted-foreground text-base pointer-events-none",
            "transition-all duration-300",
            "peer-focus:top-2 peer-focus:text-xs peer-focus:text-primary",
            "peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-xs",
            "dark:peer-focus:text-primary",
            icon && "left-11",
          )}
        >
          {label}
        </label>
        {icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            {icon}
          </div>
        )}
        {clearable && hasValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  },
);
InputFloating.displayName = "InputFloating";

// Search input with icon
interface InputSearchProps extends React.ComponentProps<"input"> {
  onClear?: () => void;
}

const InputSearch = React.forwardRef<HTMLInputElement, InputSearchProps>(
  ({ className, onClear, ...props }, ref) => {
    const [hasValue, setHasValue] = React.useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(e.target.value.length > 0);
      props.onChange?.(e);
    };

    const handleClear = () => {
      setHasValue(false);
      onClear?.();
    };

    return (
      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={ref}
          type="search"
          className={cn(
            "h-11 w-full rounded-full border-2 border-border",
            "bg-input-background pl-11 pr-4 text-sm",
            "outline-none transition-all duration-300",
            "focus:border-primary focus:shadow-pro-md focus:bg-background",
            "placeholder:text-muted-foreground",
            "disabled:pointer-events-none disabled:opacity-50",
            hasValue && "pr-10",
            className,
          )}
          onChange={handleChange}
          {...props}
        />
        {hasValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  },
);
InputSearch.displayName = "InputSearch";

export { Input, InputFloating, InputSearch };
