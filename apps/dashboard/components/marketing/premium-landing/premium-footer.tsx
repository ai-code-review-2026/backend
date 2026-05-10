'use client';

import Link from 'next/link';

import { BrandMark } from './brand-mark';
import { footerColumns } from './data';
import { cn } from '@/components/ui/utils';

type PremiumFooterProps = {
  displayClassName?: string;
  monoClassName?: string;
};

const footerSections = [
  { title: 'Product', items: footerColumns.product },
  { title: 'Company', items: footerColumns.company },
  { title: 'Resources', items: footerColumns.resources },
];

export function PremiumFooter({ displayClassName, monoClassName }: PremiumFooterProps) {
  return (
    <section className="px-6 pb-20 pt-10">
      <div className="mx-auto max-w-7xl rounded-[28px] border border-neutral-800 bg-[#050505] px-6 py-10 md:px-10 md:py-12">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark className="size-12 shrink-0" glow />
              <div>
                <p className={cn('text-xl font-semibold text-white', displayClassName)}>Graphite</p>
                <p className={cn('text-sm text-white/50', monoClassName)}>AI code review for modern teams</p>
              </div>
            </div>
            <p className={cn('mt-5 max-w-md text-sm leading-6 text-white/55', monoClassName)}>
              Context-aware reviews, policy enforcement, and merge intelligence bundled into one workflow.
            </p>
          </div>

          {footerSections.map((section) => (
            <div key={section.title}>
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-white/40">{section.title}</p>
              <ul className={cn('mt-4 space-y-3 text-sm text-white/65', monoClassName)}>
                {section.items.map((item) => (
                  <li key={item}>
                    <Link href="#" className="transition-colors hover:text-white">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-sm text-white/45">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className={monoClassName}>© Graphite 2026</p>
            <p className={monoClassName}>Built for teams that want fewer surprises in review.</p>
          </div>
        </div>
      </div>

      <div className="relative mx-auto mt-24 flex max-w-7xl justify-center overflow-hidden py-12">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-40 -translate-y-1/2 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.24),transparent_70%)] blur-3xl" />
        <p
          className={cn(
            'relative text-center text-[clamp(4rem,11vw,9rem)] font-semibold tracking-[-0.09em] text-white',
            displayClassName,
          )}
          style={{
            textShadow:
              '0 0 16px rgba(255,255,255,0.95), 0 0 42px rgba(255,255,255,0.45), 0 0 88px rgba(255,255,255,0.24)',
          }}
        >
          Graphite
        </p>
      </div>
    </section>
  );
}
