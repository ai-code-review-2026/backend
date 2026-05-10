'use client';

import { ArrowRight } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '@/components/ui/utils';

type ShowcaseCard = {
  id: string;
  title: string;
  description: string;
  previewLabel: string;
  previewKind: 'chat' | 'review' | 'merge' | 'stack' | 'pr';
  accent: {
    ring: string;
    glow: string;
    badge: string;
    fill: string;
  };
};

const showcaseCards: ShowcaseCard[] = [
  {
    id: 'chat',
    title: 'The AI reviewer you can collaborate with',
    description:
      'With Graphite Chat, get instant context on code changes, fix CI failures, and improve your PRs instantly right from your PR page, so you stay in flow.',
    previewLabel: 'Graphite Chat',
    previewKind: 'chat',
    accent: {
      ring: 'border-cyan-400/20',
      glow: 'shadow-[0_0_0_1px_rgba(34,211,238,0.15),0_0_48px_rgba(34,211,238,0.08)]',
      badge: 'text-cyan-300',
      fill: 'bg-cyan-300/90',
    },
  },
  {
    id: 'review',
    title: 'Review faster, ship sooner',
    description:
      'Get high signal AI reviews on every PR to catch critical bugs and get suggested fixes, pre-merge.',
    previewLabel: 'AI code reviews',
    previewKind: 'review',
    accent: {
      ring: 'border-emerald-400/20',
      glow: 'shadow-[0_0_0_1px_rgba(52,211,153,0.15),0_0_48px_rgba(52,211,153,0.08)]',
      badge: 'text-emerald-300',
      fill: 'bg-emerald-300/90',
    },
  },
  {
    id: 'merge',
    title: 'Merge without conflicts or delays',
    description:
      'Our stack-aware merge queue lands PRs in order and keeps branches green, helping you gain momentum.',
    previewLabel: 'Merge queue',
    previewKind: 'merge',
    accent: {
      ring: 'border-amber-400/20',
      glow: 'shadow-[0_0_0_1px_rgba(251,191,36,0.14),0_0_48px_rgba(251,191,36,0.09)]',
      badge: 'text-amber-300',
      fill: 'bg-amber-300/90',
    },
  },
  {
    id: 'stack',
    title: 'Stay unblocked with stacked PRs',
    description:
      'Break larger PRs into smaller, sequenced changes to accelerate reviews and keep your team moving without waiting on feedback.',
    previewLabel: 'Stacking',
    previewKind: 'stack',
    accent: {
      ring: 'border-sky-400/20',
      glow: 'shadow-[0_0_0_1px_rgba(56,189,248,0.16),0_0_48px_rgba(56,189,248,0.09)]',
      badge: 'text-sky-300',
      fill: 'bg-sky-300/90',
    },
  },
  {
    id: 'pr',
    title: 'Fast, focused reviews in a modern PR page',
    description:
      'A new PR page that highlights your changes, history, and comments, so you can review efficiently, catch what matters, and take action without missing a beat.',
    previewLabel: 'PR page',
    previewKind: 'pr',
    accent: {
      ring: 'border-fuchsia-400/20',
      glow: 'shadow-[0_0_0_1px_rgba(232,121,249,0.15),0_0_48px_rgba(232,121,249,0.08)]',
      badge: 'text-fuchsia-300',
      fill: 'bg-fuchsia-300/90',
    },
  },
];

function PreviewShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[18px] border border-neutral-800 bg-[#0a0a0a] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_60%)] opacity-80" />
      <div className="relative">{children}</div>
    </div>
  );
}

function ChatPreview() {
  return (
    <PreviewShell className="h-[340px] border-cyan-400/20 bg-[#05070b] md:h-[360px]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-white/55">
          <span className="size-2 rounded-full bg-red-400/90" />
          <span className="size-2 rounded-full bg-amber-300/90" />
          <span className="size-2 rounded-full bg-emerald-300/90" />
          <span className="ml-2">Graphite Chat</span>
        </div>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.28em] text-white/50">
          Live
        </span>
      </div>
      <div className="grid gap-3 p-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[12px] leading-5 text-neutral-300">
          Can you explain why this PR is blocked?
        </div>
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-3 text-[12px] leading-5 text-neutral-100 shadow-[0_0_20px_rgba(34,211,238,0.12)]">
          The diff touches the merge queue and the branch stacking workflow, so I&apos;m checking the related jobs and
          the latest CI run.
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#07111f] p-3 font-mono text-[11px] leading-5 text-cyan-100/90">
          <div>&gt; gt create -am &quot;feat(fizzbuzz): handle baz too&quot;</div>
          <div className="mt-3 text-white/70">1 file changed, 34 insertions(+)</div>
          <div className="mt-3 text-cyan-200/80">Branch stack</div>
          <div className="mt-2 space-y-1 text-white/80">
            <div>10-01-feat_fizzbuzz_handle_baz_too (current)</div>
            <div>10-01-feat_create_fizzbuzz_script</div>
            <div>main</div>
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function ReviewPreview() {
  return (
    <PreviewShell className="h-[340px] border-emerald-400/20 bg-[#050709] md:h-[360px]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.28em] text-white/55">src/components/Canvas/index.tsx</div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-emerald-200">
          Reviewed
        </span>
      </div>
      <div className="p-4">
        <div className="overflow-hidden rounded-[16px] border border-white/10 bg-black/55">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[11px] text-neutral-400">
            <span>Comment on lines +325 to +327</span>
            <span className="text-emerald-300/80">Hide resolved</span>
          </div>
          <div className="grid gap-px bg-white/5">
            <div className="bg-emerald-500/14 px-3 py-3 font-mono text-[11px] leading-5 text-emerald-100">
              <div>+ const handleSelectionChanged = () =&gt; &#123;</div>
              <div className="ml-4">+ const activeObject = canvas?.getActiveObject();</div>
              <div>+ &#125;</div>
            </div>
            <div className="bg-white/[0.02] px-3 py-3 text-[12px] leading-5 text-neutral-300">
              <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">sourcey-ai bot</div>
              <div className="rounded-xl border border-white/10 bg-black/50 p-3 text-neutral-300">
                Refactor <span className="text-white/75">&apos;handleDrop&apos;</span> to avoid redundant code and improve
                maintainability.
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-[#061222] p-3 font-mono text-[11px] leading-5 text-emerald-100/90">
                <div>+ const extractImageUrl = (event) =&gt; &#123;</div>
                <div>+   return event.dataTransfer.getData(&apos;text&apos;);</div>
                <div>+ &#125;;</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function MergePreview() {
  return (
    <PreviewShell className="h-[340px] border-amber-400/20 bg-[#070707] md:h-[360px]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.28em] text-white/55">Merge queue</div>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-white/45">
          withgraphite/monologue
        </span>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-white/45">10 day merge breakdown</div>
          <div className="flex items-center gap-3">
            <div className="grid size-24 place-items-center rounded-full border border-white/10 bg-black/60">
              <div className="relative size-14 rounded-full border-[8px] border-emerald-400/80 border-r-amber-300/80 border-t-sky-400/80" />
            </div>
            <div className="flex-1 space-y-2 text-[11px] text-neutral-300">
              <div className="flex items-center justify-between">
                <span>Success</span>
                <span className="text-emerald-300">69</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Timeouts</span>
                <span className="text-white/70">37</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Manual cancels</span>
                <span className="text-white/70">11</span>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-white/45">Today&apos;s merge count</div>
          <div className="flex h-[120px] items-end gap-2">
            {[26, 42, 58, 34, 48, 70, 50, 76, 58, 88].map((height, index) => (
              <div
                key={`${height}-${index}`}
                className="flex-1 rounded-t bg-blue-400/80"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
        <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-white/45">Today&apos;s runtimes</div>
          <div className="h-[72px] rounded-xl border border-amber-400/20 bg-[#101216] p-3 text-[12px] text-neutral-300">
            13 minutes
            <div className="mt-3 h-1 rounded-full bg-white/10">
              <div className="h-1 w-[74%] rounded-full bg-amber-300/80" />
            </div>
          </div>
        </div>
        <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-white/45">Today&apos;s queue times</div>
          <div className="h-[72px] rounded-xl border border-violet-400/20 bg-[#101216] p-3 text-[12px] text-neutral-300">
            13 minutes
            <div className="mt-3 h-1 rounded-full bg-white/10">
              <div className="h-1 w-[64%] rounded-full bg-violet-300/80" />
            </div>
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function StackPreview() {
  return (
    <PreviewShell className="h-[340px] border-sky-400/20 bg-[#04070d] shadow-[0_0_0_1px_rgba(56,189,248,0.16),0_0_60px_rgba(56,189,248,0.08)] md:h-[360px]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.28em] text-white/55">Stacking</div>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-white/45">
          active
        </span>
      </div>
      <div className="p-4">
        <div className="rounded-[18px] border border-sky-400/30 bg-[#08101d] p-4 font-mono text-[11px] leading-5 text-sky-100/90">
          <div>&gt; gt create -am &quot;feat(fizzbuzz): handle baz too&quot;</div>
          <div className="mt-2 text-white/70">1 file changed, 34 insertions(+)</div>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/55 p-3">
            <div className="text-sky-200/90">&gt; gt log</div>
            <div className="mt-3 space-y-2 text-[11px] text-white/80">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-sky-300" />
                <span>10-01-feat_fizzbuzz_handle_baz_too (current)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-sky-500/70" />
                <span>10-01-feat_create_fizzbuzz_script</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-white/40" />
                <span>main</span>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/45 p-3 text-[11px] text-white/70">
            <div>&gt; gt submit</div>
            <div className="mt-2">Validating that this Graphite stack is ready to submit...</div>
            <div className="mt-2 text-sky-200/90">Preparing to submit PRs for the following branches...</div>
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function PRPreview() {
  return (
    <PreviewShell className="h-[340px] border-fuchsia-400/20 bg-[#060606] md:h-[360px]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.28em] text-white/55">monologue #5512</div>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-white/45">
          review changes
        </span>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-[16px] border border-white/10 bg-[#0b0d12] p-3">
          <div className="text-[12px] font-medium text-white/90">enhancement(splash): update careers page art and media</div>
          <div className="mt-2 rounded-xl border border-white/10 bg-[#080a0f] p-2 text-[10px] text-white/55">
            &lt;main&gt;  ...  feature flag rollouts  ...  design assets  ...  comments
          </div>
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/10 p-2 font-mono text-[10px] text-emerald-100">
              + Added CTA copy for the splash campaign
            </div>
            <div className="rounded-lg border border-rose-400/15 bg-rose-400/10 p-2 font-mono text-[10px] text-rose-100">
              - Removed a duplicate preview image call
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 font-mono text-[10px] text-white/75">
              + Kept merge strategy, comments, and checks in sync
            </div>
          </div>
        </div>
        <div className="rounded-[16px] border border-white/10 bg-[#0a0a0a] p-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-white/45">Checks</div>
          <div className="space-y-2 text-[11px] text-neutral-300">
            <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/10 px-3 py-2 text-emerald-100">
              build: passed
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">lint: passed</div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">preview: running</div>
          </div>
          <div className="mt-3 rounded-[14px] border border-white/10 bg-[#111114] p-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Actions</div>
            <div className="mt-3 space-y-2">
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 w-[82%] rounded-full bg-fuchsia-300/80" />
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 w-[58%] rounded-full bg-sky-300/80" />
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 w-[34%] rounded-full bg-amber-300/80" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function PreviewByKind({ kind }: { kind: ShowcaseCard['previewKind'] }) {
  switch (kind) {
    case 'chat':
      return <ChatPreview />;
    case 'review':
      return <ReviewPreview />;
    case 'merge':
      return <MergePreview />;
    case 'stack':
      return <StackPreview />;
    case 'pr':
      return <PRPreview />;
    default:
      return <ChatPreview />;
  }
}

function cardProgress(distance: number) {
  if (distance === 0) return 98;
  if (distance === 1) return 72;
  if (distance === 2) return 19;
  return 0.5;
}

export function AnimatedReviewShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % showcaseCards.length);
    }, 4200);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const activeCard = showcaseCards[activeIndex];

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[28px] border border-neutral-800 bg-[#050505] p-4 md:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_58%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:22px_22px] opacity-20" />

          <div className="relative flex flex-col gap-4 lg:h-[720px] lg:flex-row">
            <div className="order-1 flex-1 lg:basis-[58%]">
              <div className="relative h-full min-h-[520px] overflow-hidden rounded-[24px] border border-neutral-800 bg-[#050505] p-6 md:p-8">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04),transparent_62%)]" />
                <div className="pointer-events-none absolute left-4 top-4 text-[20px] text-white/15">+</div>
                <div className="pointer-events-none absolute right-4 top-4 text-[20px] text-white/15">+</div>
                <div className="pointer-events-none absolute bottom-4 left-4 text-[20px] text-white/15">+</div>
                <div className="pointer-events-none absolute bottom-4 right-4 text-[20px] text-white/15">+</div>

                <div className="absolute inset-0 flex items-center justify-center px-4">
                  <div className="relative w-full max-w-[560px]">
                    {showcaseCards.map((card, index) => {
                      const isActive = index === activeIndex;
                      return (
                        <div
                          key={card.id}
                          className={cn(
                            'absolute inset-0 transition-all duration-700 ease-out',
                            isActive ? 'opacity-100 scale-100 blur-0' : 'pointer-events-none opacity-0 scale-[0.98] blur-[1px]',
                          )}
                        >
                          <div className={cn('mx-auto w-full rounded-[20px] border bg-[#0a0a0a] p-0', card.accent.ring, card.accent.glow)}>
                            <PreviewByKind kind={card.previewKind} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="absolute inset-x-0 bottom-16 flex justify-center">
                  <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-sm text-white/70">
                    {activeCard.previewLabel}
                  </div>
                </div>
              </div>
            </div>

            <div className="order-2 flex flex-1 flex-col gap-3 lg:basis-[42%]">
              {showcaseCards.map((card, index) => {
                const isActive = index === activeIndex;
                const distance = Math.abs(index - activeIndex);
                const progress = cardProgress(distance);

                return (
                  <div
                    key={card.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActive}
                    onClick={() => setActiveIndex(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setActiveIndex(index);
                      }
                    }}
                    className={cn(
                      'relative overflow-hidden rounded-[14px] border px-4 py-4 text-left transition-all duration-300 ease-out',
                      isActive
                        ? 'min-h-[244px] border-neutral-700 bg-neutral-900'
                        : 'min-h-[72px] border-neutral-800 bg-neutral-950 hover:border-neutral-700 hover:bg-neutral-900/35',
                    )}
                  >
                    <div
                      className={cn(
                        'absolute left-3 top-4 overflow-hidden rounded-full bg-neutral-800 transition-all duration-300 ease-out',
                        isActive ? 'h-[84%] w-[4px] bg-neutral-700 top-1/2 -translate-y-1/2' : 'h-[50%] w-[4px]',
                      )}
                    >
                      <div
                        data-progress-bar="true"
                        className={cn(
                          'origin-top rounded-full transition-all duration-700 ease-out',
                          isActive ? card.accent.fill : 'bg-neutral-400/70',
                        )}
                        style={{ height: `${progress}%` }}
                      />
                    </div>

                    <div className="flex h-full flex-col justify-between pl-6">
                      <div>
                        <h3
                          className={cn(
                            'text-pretty text-[20px] font-medium transition-colors duration-200 lg:text-[22px]',
                            isActive ? 'text-white' : 'text-neutral-700 hover:text-neutral-300',
                          )}
                        >
                          {card.title}
                        </h3>
                        <div
                          className={cn(
                            'grid overflow-hidden transition-all duration-500 ease-out',
                            isActive ? 'mt-3 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0',
                          )}
                        >
                          <div className="overflow-hidden">
                            <p className={cn('text-pretty text-[15px] leading-tight text-neutral-400', isActive && 'lg:text-[17px]')}>
                              {card.description}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div
                        className={cn(
                          'flex items-center gap-2 pt-4 text-sm transition-all duration-300',
                          isActive ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
                        )}
                      >
                        <span className="font-medium text-[#ff8a2a]">Learn more</span>
                        <ArrowRight className="size-4 text-[#ff8a2a]" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
