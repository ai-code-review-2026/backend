'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useScroll } from './use-scroll';
import { MenuToggleIcon } from './menu-toggle-icon';
import { Button } from './button';
import { 
  Zap, 
  ChevronDown, 
  ExternalLink,
  X 
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

interface NavDropdownItem {
  label: string;
  description?: string;
  href: string;
  icon?: React.ReactNode;
  external?: boolean;
}

interface NavDropdown {
  label: string;
  items: NavDropdownItem[];
}

interface HeaderProps {
  logo?: React.ReactNode;
  navLinks?: (NavLink | NavDropdown)[];
  actions?: React.ReactNode;
  className?: string;
  sticky?: boolean;
  blur?: boolean;
}

// ============================================================================
// DEFAULT DATA
// ============================================================================

const defaultNavLinks: (NavLink | NavDropdown)[] = [
  {
    label: 'Features',
    items: [
      { label: 'Devora', description: 'Automated code analysis', href: '#features' },
      { label: 'Task Assignment', description: 'Intelligent task distribution', href: '#features' },
      { label: 'Analytics', description: 'Performance insights', href: '#insights' },
    ],
  },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Blog', href: '#blog' },
  { label: 'Docs', href: '/docs', external: true },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isDropdown(item: NavLink | NavDropdown): item is NavDropdown {
  return 'items' in item;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function DropdownMenu({ 
  items, 
  isOpen, 
  onClose 
}: { 
  items: NavDropdownItem[]; 
  isOpen: boolean; 
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
          onMouseLeave={onClose}
        >
          <div className="p-2">
            {items.map((item, idx) => (
              <Link
                key={idx}
                href={item.href}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group"
                onClick={onClose}
              >
                {item.icon && (
                  <div className="p-2 rounded-lg bg-white/5 text-gray-400 group-hover:text-white transition-colors">
                    {item.icon}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                      {item.label}
                    </span>
                    {item.external && (
                      <ExternalLink className="h-3 w-3 text-gray-500" />
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {item.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MobileMenu({
  isOpen,
  onClose,
  navLinks,
  actions,
}: {
  isOpen: boolean;
  onClose: () => void;
  navLinks: (NavLink | NavDropdown)[];
  actions?: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          
          {/* Menu panel */}
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-[300px] bg-black/95 backdrop-blur-xl border-l border-white/10 z-50 overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <span className="text-lg font-semibold text-white">Menu</span>
              <button
                onClick={onClose}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            
            {/* Nav links */}
            <nav className="p-4 space-y-2">
              {navLinks.map((item, idx) => {
                if (isDropdown(item)) {
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {item.label}
                      </div>
                      {item.items.map((subItem, subIdx) => (
                        <Link
                          key={subIdx}
                          href={subItem.href}
                          onClick={onClose}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          {subItem.icon}
                          <div>
                            <div className="text-sm text-white">{subItem.label}</div>
                            {subItem.description && (
                              <div className="text-xs text-gray-500">{subItem.description}</div>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  );
                }
                
                return (
                  <Link
                    key={idx}
                    href={item.href}
                    onClick={onClose}
                    className="flex items-center gap-2 px-3 py-3 rounded-lg hover:bg-white/5 transition-colors text-white"
                  >
                    {item.label}
                    {item.external && <ExternalLink className="h-3 w-3 text-gray-500" />}
                  </Link>
                );
              })}
            </nav>
            
            {/* Actions */}
            {actions && (
              <div className="p-4 border-t border-white/10">
                <div className="flex flex-col gap-2">
                  {actions}
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Header({
  logo,
  navLinks = defaultNavLinks,
  actions,
  className,
  sticky = true,
  blur = true,
}: HeaderProps) {
  const scrolled = useScroll(20);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);

  const defaultLogo = (
    <Link href="/" className="flex items-center gap-2 group">
      <div className="relative">
        <Zap className="h-6 w-6 text-blue-400 group-hover:text-blue-300 transition-colors" />
        <div className="absolute inset-0 bg-blue-400 blur-lg opacity-50 group-hover:opacity-70 transition-opacity" />
      </div>
      <span className="font-bold text-lg text-white">Devora</span>
    </Link>
  );

  return (
    <>
      <motion.header
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={cn(
          'z-50 w-full',
          sticky ? 'fixed top-0 left-0 right-0' : 'relative',
          className
        )}
      >
        <div className="mx-auto max-w-7xl px-4 py-4">
          <nav
            className={cn(
              'relative rounded-2xl border px-6 py-3 transition-all duration-300',
              blur && 'backdrop-blur-xl',
              scrolled
                ? 'bg-black/80 border-white/10 shadow-2xl'
                : 'bg-black/40 border-white/5'
            )}
          >
            {/* Animated gradient border effect */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
              <motion.div 
                className="absolute inset-0 opacity-30"
                animate={{ 
                  background: [
                    'linear-gradient(0deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
                    'linear-gradient(90deg, rgba(139,92,246,0.3), rgba(236,72,153,0.3))',
                    'linear-gradient(180deg, rgba(236,72,153,0.3), rgba(59,130,246,0.3))',
                    'linear-gradient(270deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
                    'linear-gradient(360deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
                  ]
                }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              />
            </div>

            <div className="relative flex items-center justify-between">
              {/* Logo */}
              {logo || defaultLogo}

              {/* Desktop Navigation */}
              <div className="hidden lg:flex items-center gap-1">
                {navLinks.map((item, idx) => {
                  if (isDropdown(item)) {
                    return (
                      <div
                        key={idx}
                        className="relative"
                        onMouseEnter={() => setActiveDropdown(idx)}
                        onMouseLeave={() => setActiveDropdown(null)}
                      >
                        <button
                          className={cn(
                            'flex items-center gap-1 px-4 py-2 text-sm rounded-lg transition-colors',
                            activeDropdown === idx
                              ? 'text-white bg-white/5'
                              : 'text-gray-400 hover:text-white hover:bg-white/5'
                          )}
                        >
                          {item.label}
                          <ChevronDown 
                            className={cn(
                              'h-4 w-4 transition-transform duration-200',
                              activeDropdown === idx && 'rotate-180'
                            )} 
                          />
                        </button>
                        <DropdownMenu
                          items={item.items}
                          isOpen={activeDropdown === idx}
                          onClose={() => setActiveDropdown(null)}
                        />
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={idx}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-1 px-4 py-2 text-sm rounded-lg transition-colors',
                        'text-gray-400 hover:text-white hover:bg-white/5'
                      )}
                    >
                      {item.label}
                      {item.external && <ExternalLink className="h-3 w-3" />}
                    </Link>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                {/* Desktop actions */}
                <div className="hidden lg:flex items-center gap-3">
                  {actions}
                </div>

                {/* Mobile menu toggle */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="lg:hidden p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  aria-label="Toggle menu"
                >
                  <MenuToggleIcon 
                    open={mobileMenuOpen} 
                    className="h-5 w-5 text-gray-300"
                  />
                </button>
              </div>
            </div>
          </nav>
        </div>
      </motion.header>

      {/* Mobile Menu */}
      <MobileMenu
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        navLinks={navLinks}
        actions={actions}
      />
      
      {/* Spacer for fixed header */}
      {sticky && <div className="h-20" />}
    </>
  );
}

// ============================================================================
// EXPORT DEFAULT ACTIONS FOR CONVENIENCE
// ============================================================================

export function HeaderActions({ 
  signedIn = false,
  onSignIn,
  onDashboard,
}: { 
  signedIn?: boolean;
  onSignIn?: () => void;
  onDashboard?: () => void;
}) {
  if (signedIn) {
    return (
      <Button
        size="sm"
        onClick={onDashboard}
        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0"
      >
        Dashboard
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={onSignIn}
        className="text-gray-300 hover:text-white hover:bg-white/10"
      >
        Sign In
      </Button>
      <Button
        size="sm"
        onClick={onSignIn}
        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0"
      >
        Get Started
      </Button>
    </>
  );
}
