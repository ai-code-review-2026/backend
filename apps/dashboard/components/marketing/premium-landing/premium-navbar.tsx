'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Moon, Sparkles, Sun } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUser, UserButton } from '@clerk/nextjs';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';

import { BrandMark } from './brand-mark';
import { navLinks } from './data';

type PremiumNavbarProps = {
  monoClassName?: string;
};

export function PremiumNavbar({ monoClassName }: PremiumNavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { isSignedIn } = useUser();
  const currentTheme = resolvedTheme ?? theme;
  const isDark = currentTheme !== "light";

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed inset-x-0 top-0 z-50 px-4 pt-4"
    >
      <nav
        className={cn(
          'mx-auto max-w-7xl rounded-[16px] border border-graphite-card px-4 py-3 text-primary-color transition-all duration-500 md:px-6',
          isScrolled
            ? 'bg-nav shadow-[0_24px_80px_rgba(0,0,0,0.12)] backdrop-blur-xl'
            : 'bg-nav shadow-[0_18px_60px_rgba(0,0,0,0.08)] backdrop-blur-md',
        )}
      >
        <div className="flex items-center justify-between gap-6">
          <Link href="#top" className="flex items-center gap-3 text-primary-color">
            <BrandMark className="size-9" tone={isDark ? "dark" : "light"} />
            <div>
              <p className="text-[1.6rem] font-semibold leading-none tracking-[-0.03em]">Devora</p>
            </div>
          </Link>

          <div className="hidden items-center gap-7 lg:flex">
            {['Plan', 'Enterprise', 'Customers', 'Pricing', 'Blog', 'Resources'].map((item) => (
              <Link
                key={item}
                href="#"
                className={cn(
                  'text-sm text-secondary-color transition-colors hover:text-primary-color',
                  monoClassName,
                )}
              >
                {item}
              </Link>
            ))}
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            {mounted && (
              <button
                type="button"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                aria-label="Toggle theme"
                className="inline-flex h-9 w-9 items-center justify-center border border-graphite-card bg-card text-primary-color transition-colors hover:bg-card-hover"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}
            {!isSignedIn ? (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className={cn('rounded-none px-3 text-primary-color hover:bg-card-hover hover:text-primary-color', monoClassName)}
                >
                  <Link href="/sign-in">Log in</Link>
                </Button>
                <Button
                  asChild
                  className={cn(
                    'h-10 rounded-none border border-orange-accent bg-orange/10 px-5 text-orange shadow-none hover:bg-orange/20',
                    monoClassName,
                  )}
                >
                  <Link href="/sign-up">
                    Get a free trial
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button
                  asChild
                  className={cn(
                    'h-10 rounded-none border border-orange-accent bg-orange/10 px-5 text-orange shadow-none hover:bg-orange/20',
                    monoClassName,
                  )}
                >
                  <Link href="/dashboard">Open dashboard</Link>
                </Button>
                <UserButton />
              </>
            )}
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            {mounted && (
              <button
                type="button"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                aria-label="Toggle theme"
                className="inline-flex h-9 w-9 items-center justify-center border border-graphite-card bg-card text-primary-color transition-colors hover:bg-card-hover"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen((open) => !open)}
              className="inline-flex rounded-full border border-graphite-card bg-card px-3 py-2 text-primary-color shadow-sm transition hover:bg-card-hover"
              aria-label="Toggle navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isOpen ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden lg:hidden"
            >
              <div className="mt-4 space-y-3 border-t border-graphite-card pt-4">
                {navLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center justify-between rounded-2xl border border-graphite-card bg-card px-4 py-3 text-sm font-medium text-primary-color"
                  >
                    {item.label}
                    <Sparkles className="h-4 w-4 text-muted-color" />
                  </Link>
                ))}
                {!isSignedIn ? (
                  <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    <Button asChild variant="ghost" className="rounded-full border border-graphite-card text-primary-color">
                      <Link href="/sign-in">Log in</Link>
                    </Button>
                    <Button asChild className="rounded-full border border-orange-accent bg-orange/10 text-orange hover:bg-orange/20">
                      <Link href="/sign-up">Get Started</Link>
                    </Button>
                  </div>
                ) : (
                  <Button asChild className="w-full rounded-full border border-orange-accent bg-orange/10 text-orange hover:bg-orange/20">
                    <Link href="/dashboard">Open dashboard</Link>
                  </Button>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </nav>
    </motion.header>
  );
}
