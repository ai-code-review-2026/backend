'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Sun, Moon, Monitor, Palette } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeOption {
  value: ThemeMode;
  label: string;
  icon: React.ReactNode;
  description?: string;
}

interface ThemeToggleProps {
  variant?: 'tabs' | 'segmented' | 'dropdown' | 'icons';
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  className?: string;
}

// ============================================================================
// THEME OPTIONS
// ============================================================================

const themeOptions: ThemeOption[] = [
  {
    value: 'light',
    label: 'Light',
    icon: <Sun className="h-4 w-4" />,
    description: 'Bright and clear',
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: <Moon className="h-4 w-4" />,
    description: 'Easy on the eyes',
  },
  {
    value: 'system',
    label: 'System',
    icon: <Monitor className="h-4 w-4" />,
    description: 'Match device settings',
  },
];

// ============================================================================
// TABS VARIANT
// ============================================================================

function ThemeToggleTabs({
  size = 'md',
  showLabels = true,
  className,
}: Omit<ThemeToggleProps, 'variant'>) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={cn(
        'flex items-center gap-1 p-1 rounded-xl bg-card/80 border border-border',
        className
      )}>
        {themeOptions.map((option) => (
          <div
            key={option.value}
            className={cn(
              'flex items-center gap-2 rounded-lg transition-colors',
              size === 'sm' && 'px-2 py-1',
              size === 'md' && 'px-3 py-2',
              size === 'lg' && 'px-4 py-2.5',
            )}
          >
            <div className="h-4 w-4 bg-white/10 rounded animate-pulse" />
            {showLabels && <div className="h-3 w-12 bg-white/10 rounded animate-pulse" />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex items-center gap-1 p-1 rounded-xl bg-card/80 border border-border backdrop-blur-xl',
        className
      )}
    >
      {themeOptions.map((option) => {
        const isActive = theme === option.value;
        
        return (
          <button
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              'relative flex items-center gap-2 rounded-lg transition-colors z-10',
              size === 'sm' && 'px-2 py-1 text-xs',
              size === 'md' && 'px-3 py-2 text-sm',
              size === 'lg' && 'px-4 py-2.5 text-base',
              isActive
                ? 'text-white'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="theme-tab-indicator"
                className="absolute inset-0 bg-card-hover rounded-lg border border-border"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative">{option.icon}</span>
            {showLabels && <span className="relative font-medium">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// SEGMENTED VARIANT
// ============================================================================

function ThemeToggleSegmented({
  size = 'md',
  showLabels = true,
  className,
}: Omit<ThemeToggleProps, 'variant'>) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={cn(
        'inline-flex rounded-full p-1 bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-teal-500/10 border border-border',
        className
      )}>
        <div className="h-8 w-24 bg-white/10 rounded-full animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex rounded-full p-1 bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-teal-500/10 border border-border',
        className
      )}
    >
      {themeOptions.map((option) => {
        const isActive = theme === option.value;
        
        return (
          <button
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              'relative flex items-center justify-center gap-2 rounded-full transition-all duration-300',
              size === 'sm' && 'px-3 py-1 text-xs',
              size === 'md' && 'px-4 py-1.5 text-sm',
              size === 'lg' && 'px-5 py-2 text-base',
              isActive
                ? 'bg-card text-foreground shadow-lg border border-border'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.icon}
            {showLabels && <span className="font-medium">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// ICONS ONLY VARIANT
// ============================================================================

function ThemeToggleIcons({
  size = 'md',
  className,
}: Omit<ThemeToggleProps, 'variant' | 'showLabels'>) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cycleTheme = () => {
    const currentIndex = themeOptions.findIndex((opt) => opt.value === theme);
    const nextIndex = (currentIndex + 1) % themeOptions.length;
    setTheme(themeOptions[nextIndex].value);
  };

  if (!mounted) {
    return (
      <button
        className={cn(
          'p-2 rounded-lg bg-card/80 border border-border backdrop-blur-xl',
          size === 'sm' && 'p-1.5',
          size === 'lg' && 'p-3',
          className
        )}
      >
        <div className="h-4 w-4 bg-white/10 rounded animate-pulse" />
      </button>
    );
  }

  const currentOption = themeOptions.find((opt) => opt.value === theme) || themeOptions[0];
  const displayIcon = theme === 'system'
    ? resolvedTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />
    : currentOption.icon;

  return (
    <motion.button
      onClick={cycleTheme}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        'relative p-2 rounded-lg bg-card/80 border border-border hover:bg-card-hover transition-colors backdrop-blur-xl',
        size === 'sm' && 'p-1.5',
        size === 'lg' && 'p-3',
        className
      )}
      title={`Theme: ${currentOption.label}`}
    >
      <motion.div
        key={theme}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        exit={{ rotate: 90, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="text-foreground"
      >
        {displayIcon}
      </motion.div>
    </motion.button>
  );
}

// ============================================================================
// DROPDOWN VARIANT
// ============================================================================

function ThemeToggleDropdown({
  size = 'md',
  className,
}: Omit<ThemeToggleProps, 'variant' | 'showLabels'>) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg bg-card/80 border border-border backdrop-blur-xl',
          className
        )}
      >
        <div className="h-4 w-4 bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-12 bg-white/10 rounded animate-pulse" />
      </button>
    );
  }

  const currentOption = themeOptions.find((opt) => opt.value === theme) || themeOptions[0];

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg bg-card/80 border border-border hover:bg-card-hover transition-colors backdrop-blur-xl',
          size === 'sm' && 'px-2 py-1 text-xs',
          size === 'md' && 'px-3 py-2 text-sm',
          size === 'lg' && 'px-4 py-2.5 text-base',
        )}
      >
        <Palette className="h-4 w-4 text-muted-foreground" />
        <span className="text-foreground font-medium">{currentOption.label}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="absolute top-full right-0 mt-2 w-48 bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl overflow-hidden z-50"
          >
            <div className="p-1">
              {themeOptions.map((option) => {
                const isActive = theme === option.value;
                
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      setTheme(option.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                      isActive
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-card-hover hover:text-foreground'
                    )}
                  >
                    {option.icon}
                    <div className="flex-1 text-left">
                      <div className="font-medium">{option.label}</div>
                      {option.description && (
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      )}
                    </div>
                    {isActive && (
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ThemeToggle({
  variant = 'tabs',
  size = 'md',
  showLabels = true,
  className,
}: ThemeToggleProps) {
  switch (variant) {
    case 'tabs':
      return <ThemeToggleTabs size={size} showLabels={showLabels} className={className} />;
    case 'segmented':
      return <ThemeToggleSegmented size={size} showLabels={showLabels} className={className} />;
    case 'icons':
      return <ThemeToggleIcons size={size} className={className} />;
    case 'dropdown':
      return <ThemeToggleDropdown size={size} className={className} />;
    default:
      return <ThemeToggleTabs size={size} showLabels={showLabels} className={className} />;
  }
}

// Export individual variants for direct use
export { ThemeToggleTabs, ThemeToggleSegmented, ThemeToggleIcons, ThemeToggleDropdown };
