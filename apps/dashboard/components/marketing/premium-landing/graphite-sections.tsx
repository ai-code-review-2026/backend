'use client';

import { ArrowRight, GitBranch, Bell, Zap, Shield, Users, BarChart3, Lock, GitMerge, Bot } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/components/ui/utils';

type Props = {
  monoClassName?: string;
  displayClassName?: string;
};

// ---------- Mock Terminal Visual ----------
function TerminalVisual({ className }: { className?: string }) {
  const lines = [
    { hash: 'a4f82c1', branch: 'feat/ai-review-streaming', label: '(current)', time: '12 seconds ago', accent: true },
    { hash: '9c3d5e0', branch: 'fix/duplicate-comment-dedup', label: '', time: '47 seconds ago', accent: false },
    { hash: 'b7a219d', branch: 'feat/rag-knowledge-graph', label: '', time: '1 minute ago', accent: false },
    { hash: '5f10cc2', branch: 'refactor/analysis-pipeline', label: '', time: '2 minutes ago', accent: false },
    { hash: '2e88fa4', branch: 'main', label: '', time: '1 hour ago', accent: false },
    { hash: '1b44d6c', branch: 'chore/update-semgrep-rules', label: '', time: '2 hours ago', accent: false },
  ];

  return (
    <div className={cn('rounded-lg overflow-hidden border border-white/10 bg-[#111] font-mono text-sm', className)}>
      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1a1a1a] border-b border-white/10">
        <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
        <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        <span className="ml-2 text-white/40 text-xs">monorepo — zsh</span>
      </div>
      <div className="p-4 space-y-0.5">
        <div className="text-white/50 text-xs mb-3">$ git log --stack</div>
        {lines.map((l) => (
          <div key={l.hash} className="flex items-center gap-3">
            <span className="text-white/30 text-xs w-16 shrink-0">{l.hash}</span>
            <span className={cn('text-xs', l.accent ? 'text-[#00F5D4]' : 'text-white/80')}>
              {l.branch}
            </span>
            {l.label && (
              <span className="text-white/40 text-xs">({l.label})</span>
            )}
            <span className="ml-auto text-white/30 text-xs shrink-0">{l.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Mock PR Inbox Visual ----------
function PRInboxVisual({ className }: { className?: string }) {
  const prs = [
    { title: 'feat: add streaming AI review comments', repo: 'acme/monorepo #142', avatars: ['A', 'B'], warning: true },
    { title: 'fix: race condition in analysis worker', repo: 'acme/monorepo #141', avatars: ['C'], warning: false },
    { title: 'feat(rag): allow hybrid vector search', repo: 'acme/monorepo #140', avatars: ['A', 'D'], warning: false },
    { title: 'chore: only return best candidates', repo: 'acme/monorepo #139', avatars: ['B'], warning: false },
  ];

  return (
    <div className={cn('rounded-lg overflow-hidden border border-white/10 bg-[#111]', className)}>
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <span className="text-white/40 text-xs font-mono">12</span>
        <span className="text-sm text-white font-medium flex items-center gap-1.5">
          <span>👀</span> Needs your review
        </span>
      </div>
      <div className="divide-y divide-white/5">
        {prs.map((pr) => (
          <div key={pr.title} className="flex items-center gap-3 px-4 py-3">
            <div className="flex -space-x-1.5 shrink-0">
              {pr.avatars.map((a) => (
                <div key={a} className="w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/60 text-[10px] font-bold">
                  {a}
                </div>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/90 truncate">{pr.title}</p>
              <p className="text-xs text-white/40 truncate">{pr.repo}</p>
            </div>
            {pr.warning && (
              <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Mock Slack Notification ----------
function SlackNotification({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-white/10 bg-[#1a1a1a] p-4 shadow-2xl', className)}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-white">Devora</span>
            <span className="text-xs text-white/40">22m ago</span>
          </div>
          <p className="text-sm text-white/70 leading-snug">
            🔍 <span className="text-white/90">alex</span> requested changes on{' '}
            <span className="text-[#00F5D4]">[#27025] feat: Add team selection page to settings</span>
          </p>
          <div className="mt-2 text-xs text-white/40 border-l-2 border-violet-500/50 pl-2">
            "Missing input validation on team name field — could allow XSS."
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Mock CI Visual ----------
function CIVisual({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-white/10 bg-[#111] overflow-hidden', className)}>
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-sm text-white font-medium">Run status</span>
        <button className="text-white/40 text-lg leading-none">×</button>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-[#27c93f] flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-white/70">core-tests</span>
          <span className="text-white/40 text-xs">(includes required checks)</span>
        </div>
        <div className="rounded-md bg-orange-500/10 border border-orange-500/20 px-3 py-2 flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-orange-400 flex items-center justify-center shrink-0">
            <span className="text-[8px] font-bold text-white">!</span>
          </div>
          <span className="text-sm text-white/80 font-mono">
            analysis-worker/build_analysis{' '}
            <span className="text-orange-400">(optimised to run later)</span>
          </span>
        </div>
        <div className="space-y-1.5 pl-2">
          {[
            { label: 'static-analysis/ruff', required: true },
            { label: 'static-analysis/semgrep', required: true },
            { label: 'rag-pipeline/embedding-sync', required: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-[#27c93f]/60 flex items-center justify-center shrink-0">
                <div className="w-1 h-1 rounded-full bg-[#27c93f]" />
              </div>
              <span className="text-xs text-white/60 font-mono">{item.label}</span>
              {item.required && (
                <span className="text-[10px] text-white/30">(required)</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Mock AI Chat Visual ----------
function AIChatVisual({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-white/10 bg-[#111] overflow-hidden', className)}>
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <Bot className="w-4 h-4 text-violet-400" />
        <span className="text-sm text-white font-medium">Ask Devora</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="text-xs text-white/40 font-mono">Ask Devora to:</div>
        <ul className="space-y-1">
          {['Explain code changes', 'Fix issues and CI failures', 'Address comments', 'Search the knowledge base'].map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs text-white/70">
              <span className="text-violet-400">•</span> {item}
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-white/40 mb-1">Memory leak fix — 3h ago</div>
          <p className="text-xs text-white/80 leading-relaxed">
            This animation loop would continue running after component unmount, causing CPU usage and memory
            consumption. Over time, this could lead to degraded performance, especially in SPAs where
            components mount and unmount frequently.
          </p>
          <div className="mt-2 bg-[#1a1a2e] rounded p-2 font-mono text-[11px]">
            <div className="text-white/40">88 +    {'}'}</div>
            <div className="text-white/40">89 +</div>
            <div className="text-[#ff5f56]">90 -    animate()</div>
            <div className="text-[#27c93f]">90 +    const id = requestAnimationFrame(animate)</div>
            <div className="text-white/40">91 +    {'}'}, [isPlaying])</div>
          </div>
        </div>
        <div className="flex items-center gap-2 border border-white/10 rounded-md px-3 py-2 bg-white/5">
          <input
            type="text"
            readOnly
            placeholder="Ask Devora about this PR…"
            className="flex-1 bg-transparent text-xs text-white/40 outline-none placeholder:text-white/30"
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Platform Features Pill List ----------
const platformFeatures = [
  { icon: BarChart3, label: 'Insights' },
  { icon: Shield, label: 'Protections' },
  { icon: GitMerge, label: 'Merge Queue' },
  { icon: Users, label: 'Reviewer Assignment' },
  { icon: Zap, label: 'Automations' },
];

// ============================================================
// MAIN EXPORT — six Graphite-inspired sections
// ============================================================
export function GraphiteSections({ monoClassName, displayClassName }: Props) {
  return (
    <>
      {/* ── 1. Never wait on review again ── */}
      <section className="px-6 py-4">
        <div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-[#0d0d0d] overflow-hidden">
          <div className="grid md:grid-cols-2 gap-0">
            <div className="p-10 flex flex-col justify-center">
              <h2 className={cn('text-4xl font-semibold text-white leading-tight', displayClassName)}>
                Never wait on review again
              </h2>
              <p className={cn('mt-4 text-base text-white/55 leading-relaxed', monoClassName)}>
                Keep shipping while other changes are under review with stacking. Our CLI and VS Code
                extension make it effortless to create and manage review stacks, so you stay unblocked.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 rounded-full bg-white text-black text-sm font-medium px-5 py-2.5 hover:bg-white/90 transition-colors"
                >
                  Start stacking
                </Link>
                <Link
                  href="#"
                  className={cn('inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors', monoClassName)}
                >
                  Read more about our CLI <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
            <div className="p-6 flex items-center justify-center bg-white/[0.02] border-l border-white/5">
              <TerminalVisual className="w-full max-w-md" />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Built for teams + Don't miss a beat ── */}
      <section className="px-6 py-4">
        <div className="mx-auto max-w-7xl grid md:grid-cols-2 gap-4">
          {/* Left — team review */}
          <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] overflow-hidden">
            <div className="p-8">
              <h2 className={cn('text-3xl font-semibold text-white leading-tight', displayClassName)}>
                A review experience<br />built for teams
              </h2>
              <p className={cn('mt-3 text-sm text-white/55 leading-relaxed', monoClassName)}>
                One unified inbox and review workflow for your team's PRs.
              </p>
              <Link
                href="#"
                className={cn('mt-5 inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors', monoClassName)}
              >
                Learn more <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="px-6 pb-6">
              <PRInboxVisual />
              {/* floating notification */}
              <SlackNotification className="mt-4 ml-auto max-w-xs" />
            </div>
          </div>

          {/* Right — Don't miss a beat */}
          <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-8 flex flex-col justify-between">
            <div>
              <h2 className={cn('text-3xl font-semibold text-white leading-tight', displayClassName)}>
                Don't miss a beat
              </h2>
              <p className={cn('mt-3 text-sm text-white/55 leading-relaxed', monoClassName)}>
                Actionable Slack notifications that meet you where you are.
              </p>
              <Link
                href="#"
                className={cn('mt-5 inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors', monoClassName)}
              >
                Read the docs <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="mt-8 space-y-3">
              <SlackNotification />
              <div className="rounded-xl border border-white/10 bg-[#1a1a1a] p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#00F5D4]/10 border border-[#00F5D4]/20 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-[#00F5D4]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white mb-0.5">Devora</p>
                    <p className="text-sm text-white/60">
                      ✅ Analysis complete on{' '}
                      <span className="text-[#00F5D4]">[#27024] fix: auth token refresh</span>
                      {' '}- 0 blockers, 2 warnings.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Smarter CI + One Platform ── */}
      <section className="px-6 py-4">
        <div className="mx-auto max-w-7xl grid md:grid-cols-2 gap-4">
          {/* Left — Smarter CI */}
          <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-8 flex flex-col">
            <div>
              <h2 className={cn('text-3xl font-semibold text-white leading-tight', displayClassName)}>
                Smarter CI
              </h2>
              <p className={cn('mt-3 text-sm text-white/55 leading-relaxed', monoClassName)}>
                Stacking-integrated CI that only runs when you need it.
              </p>
              <Link
                href="#"
                className={cn('mt-5 inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors', monoClassName)}
              >
                Read about CI Optimisations <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="mt-8 flex-1">
              <CIVisual />
            </div>
          </div>

          {/* Right — One Platform */}
          <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-8 flex flex-col justify-between">
            <div>
              <h2 className={cn('text-3xl font-semibold text-white leading-tight', displayClassName)}>
                One platform.{' '}
                <span className="block">All of your review</span>
                <span className="block">essentials.</span>
              </h2>
              <p className={cn('mt-3 text-sm text-white/55 leading-relaxed', monoClassName)}>
                Your CLI, PR page, inbox, and merge queue, unified in one seamless workflow.
              </p>
              <Link
                href="#"
                className={cn('mt-5 inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors', monoClassName)}
              >
                Read about merge queues <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="mt-8 flex flex-col gap-3">
              {platformFeatures.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-3 w-fit"
                >
                  <Icon className="w-4 h-4 text-white/60" />
                  <span className={cn('text-sm text-white/80', monoClassName)}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Collaborative AI Reviewer ── */}
      <section className="px-6 py-4">
        <div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-[#0d0d0d] overflow-hidden">
          <div className="grid md:grid-cols-2 gap-0">
            <div className="p-10 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 mb-6 w-fit">
                <Bot className="w-3.5 h-3.5 text-violet-400" />
                <span className={cn('text-xs text-violet-400', monoClassName)}>AI-powered</span>
              </div>
              <h2 className={cn('text-4xl font-semibold text-white leading-tight', displayClassName)}>
                The collaborative AI reviewer built into your PR page
              </h2>
              <p className={cn('mt-4 text-base text-white/55 leading-relaxed', monoClassName)}>
                Resolve CI failures, apply suggested fixes, and commit your changes — all in one conversation.
              </p>
              <div className="mt-8">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 rounded-full border border-violet-500/50 bg-violet-500/10 text-violet-300 text-sm font-medium px-5 py-2.5 hover:bg-violet-500/20 transition-colors"
                >
                  Start chatting <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="mt-10 grid grid-cols-2 gap-4">
                {[
                  { icon: Zap, label: 'Instant analysis', desc: 'Results in seconds, not minutes' },
                  { icon: Lock, label: 'Zero data retention', desc: 'Your code never leaves your infra' },
                  { icon: GitBranch, label: 'Branch-aware', desc: 'Full codebase context per PR' },
                  { icon: Bell, label: 'Smart alerts', desc: 'Notified only when it matters' },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-white/50" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/80">{label}</p>
                      <p className={cn('text-xs text-white/40 mt-0.5', monoClassName)}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 flex items-center justify-center bg-white/[0.02] border-l border-white/5">
              <AIChatVisual className="w-full max-w-md" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
