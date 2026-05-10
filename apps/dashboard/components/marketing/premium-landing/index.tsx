'use client';

import { useUser } from '@clerk/nextjs';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';

import { trustLogos } from './data';
import { CodeGraphVisual } from './code-graph-visual';
import { AnimatedReviewShowcase } from './animated-review-showcase';
import { PremiumFooter } from './premium-footer';
import { PremiumNavbar } from './premium-navbar';
import { GraphiteSections } from './graphite-sections';

type PremiumLandingPageProps = {
  displayClassName?: string;
  monoClassName?: string;
};

type LandingVideoProps = {
  src: string;
  className?: string;
};

function LandingVideo({ src, className }: LandingVideoProps) {
  return (
    <div className={cn('overflow-hidden border border-border bg-muted', className)}>
      <video
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="block h-full w-full object-contain"
      />
    </div>
  );
}

const featureCards = [
  {
    tag: '[IN-LINE COMMENTS]',
    title: 'Get context-aware comments on your PRs',
    text: 'In-line comments to identify bugs, antipatterns, security issues, and more.',
  },
  {
    tag: '[CUSTOM CONTEXT]',
    title: 'Describe your coding standards in English',
    text: "Tell Greptile about your team's best practices, Greptile will enforce them across PRs.",
  },
  {
    tag: '[PR SUMMARIES]',
    title: 'Quickly understand PRs with AI-generated summaries',
    text: 'Get mermaid diagrams, file-by-file breakdowns, and confidence scores for every PR.',
  },
  {
    tag: '[LEARNING]',
    title: 'Greptile learns by reading your comments',
    text: "Greptile infers your team's coding standards by reading every engineer's comments on PRs.",
  },
];

const testimonials = [
  {
    quote:
      '"We\'ve tried more code review tools than I can count. Greptile outperforms them all by a mile."',
    name: 'James',
    role: 'CTO • Brex',
  },
  {
    quote:
      '"We\'ve been impressed by Greptile\'s code review quality. It tightened feedback loops and consistency."',
    name: 'Mark',
    role: 'Eng. Manager • WorkOS',
  },
  {
    quote: '"Greptile helps the team do their best work and levels everybody up."',
    name: 'Anirudh',
    role: 'Tech Lead • Browserbase',
  },
  {
    quote: '"One of the most impressive AI code review tools I\'ve used."',
    name: 'Martin',
    role: 'CTO • PurpleFish',
  },
  {
    quote: '"I\'m thankful for the things Greptile catches in my pull requests."',
    name: 'Hahnbee',
    role: 'CTO • Mintlify',
  },
  {
    quote:
      '"It catches issues that human reviewers miss and gives senior-level suggestions."',
    name: 'Chase',
    role: 'CTO • RollCredits',
  },
  {
    quote: '"Team is responsive and reviews are very good. Highly recommended."',
    name: 'Chris',
    role: 'CTO • Risotto',
  },
  {
    quote: '"Setup took 15 min and it became a game-changer for our release cycle."',
    name: 'Harish',
    role: 'CTO • Flaire',
  },
];

export function PremiumLandingPage({ displayClassName, monoClassName }: PremiumLandingPageProps) {
  const { isSignedIn } = useUser();
  
  return (
    <main
      id="top"
      className={cn(
        'relative min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-[#17f0c4]/30',
        displayClassName,
      )}
    >
      <PremiumNavbar monoClassName={monoClassName} />

      <section className="relative px-6 pb-20 pt-36">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(73,82,127,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(73,82,127,0.14)_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="mx-auto max-w-[1360px]">
          <h1 className="text-center text-6xl font-semibold tracking-[-0.04em] md:text-7xl">
            The leader in AI code reviews
          </h1>

          <div className="mx-auto mt-12 aspect-[16/9] w-full max-w-[1320px] overflow-hidden rounded-[28px] bg-white dark:bg-[#0B0D12] shadow-[0_24px_80px_rgba(0,0,0,0.18)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.55)] md:mt-14">
            <video
              src="/features.webm"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="block h-full w-full rounded-[28px] object-contain"
            />
          </div>

          <div className="mt-12 border border-border bg-card/75 p-4 md:p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex min-h-[220px] flex-col items-center justify-center border border-border bg-muted/30 p-8 text-center">
                <p className="text-2xl">Most installed AI App</p>
                <p className={cn('mt-6 text-4xl text-foreground/80', monoClassName)}>GitHub  GitLab</p>
              </div>
              <div className="flex min-h-[220px] flex-col items-center justify-center border border-border bg-card">
                <p className="text-8xl">3M</p>
                <p className="text-4xl text-[#ff6a00]">Repositories</p>
              </div>
              <div className="flex min-h-[220px] flex-col items-center justify-center border border-border bg-card">
                <p className="text-8xl">75M</p>
                <p className="text-4xl text-[#ff6a00]">Defects found</p>
              </div>
            </div>
            <p className={cn('mt-8 text-center text-3xl text-[#17f0c4] underline', monoClassName)}>Why teams prefer Devora</p>
          </div>

          <p className={cn('mt-16 text-center text-6xl', monoClassName)}>Trusted by <span className="text-[#17f0c4]">15,000+</span> customers</p>
          <div className="mt-10 grid grid-cols-2 gap-10 md:grid-cols-4">
            {trustLogos.map((logo) => (
              <div key={logo} className="text-center text-6xl font-semibold text-foreground/90">
                {logo}
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild className="h-12 rounded-none border border-[#17f0c4] bg-[#17f0c4]/10 px-6 text-[#17f0c4] hover:bg-[#17f0c4]/20">
              <Link href="#">See Greptile in action</Link>
            </Button>
          </div>

          <div className="mt-12 border border-border bg-card/60 px-3 py-2 md:px-5 md:py-4">
            <CodeGraphVisual monoClassName={monoClassName} />
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-7xl gap-px border border-border bg-border md:grid-cols-2">
          {featureCards.map((card) => (
            <article key={card.title} className="bg-card p-8">
              <p className={cn('text-xl text-[#ff6a00]', monoClassName)}>{card.tag}</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] md:text-5xl">{card.title}</h2>
              <p className={cn('mt-4 text-xl text-foreground/70 md:text-2xl', monoClassName)}>{card.text}</p>
            </article>
          ))}
        </div>
      </section>

      <AnimatedReviewShowcase />

      <GraphiteSections monoClassName={monoClassName} displayClassName={displayClassName} />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl border border-border p-8">
          <p className={cn('text-lg text-[#17f0c4]', monoClassName)}>[ 30+ languages supported ]</p>
          <h2 className="mt-4 text-5xl font-semibold tracking-[-0.04em] md:text-6xl">Full Codebase Context</h2>
          <p className={cn('mt-4 max-w-5xl text-xl text-foreground/75 md:text-2xl', monoClassName)}>
            Greptile generates a detailed graph of your codebase and understands how everything fits together.
            Better understanding of your codebase = more bugs caught.
          </p>
          <LandingVideo src="/assets/context-type.mp4" className="mx-auto mt-8 w-full max-w-4xl aspect-[16/9]" />
          <div className="mt-8">
            <Link href="#" className={cn('inline-flex items-center gap-2 text-xl text-[#17f0c4]', monoClassName)}>
              Learn more <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl border border-border p-8">
          <p className={cn('text-lg text-[#ff6a00]', monoClassName)}>[ CUSTOM CONTEXT ]</p>
          <h2 className="mt-4 text-5xl font-semibold tracking-[-0.04em] md:text-6xl">Your house, your rules.</h2>
          <p className={cn('mt-4 text-xl text-foreground/75 md:text-2xl', monoClassName)}>
            Greptile is better when personalized to your team.
          </p>
          <LandingVideo src="/assets/final.mp4" className="mx-auto mt-8 w-full max-w-4xl aspect-[16/9]" />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="border border-border bg-card p-6">
              <p className={cn('text-lg text-foreground/80', monoClassName)}>
                Write a rule in English or point Greptile to a markdown file with your team&apos;s best practices.
              </p>
              <LandingVideo src="/assets/custom-context.mp4" className="mt-4 w-full aspect-[16/9]" />
            </div>
            <div className="border border-border bg-card p-6">
              <p className={cn('text-lg text-foreground/80', monoClassName)}>
                Apply rules and context to specific repositories, file paths, or code patterns.
              </p>
              <LandingVideo src="/assets/context-type.mp4" className="mt-4 w-full aspect-[16/9]" />
            </div>
            <div className="border border-border bg-card p-6">
              <p className={cn('text-lg text-foreground/80', monoClassName)}>
                Analyze whether rules are being used by Greptile and actioned by the team.
              </p>
            </div>
          </div>
          <div className="mt-8">
            <Link href="#" className={cn('inline-flex items-center gap-2 text-xl text-[#17f0c4]', monoClassName)}>
              Explore Custom Context <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl border border-border p-8">
          <p className={cn('text-lg text-[#ff6a00]', monoClassName)}>[ LEARNING ]</p>
          <h2 className="mt-4 text-5xl font-semibold tracking-[-0.04em] md:text-6xl">Introducing Learning.</h2>
          <p className={cn('mt-4 text-xl text-foreground/75 md:text-2xl', monoClassName)}>
            Greptile learns your team&apos;s coding standards by reading every engineer&apos;s PR comments, and learns what
            types of comments your team finds useful by tracking 👍/👎 reactions.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {['Prefer named exports.', 'Never push directly to main.', 'Remove all console.log and debugger statements.'].map((rule) => (
              <span key={rule} className={cn('border border-border bg-card px-4 py-2 text-lg text-foreground/80', monoClassName)}>
                {rule}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl border border-border p-8">
          <p className={cn('text-lg text-[#ff6a00]', monoClassName)}>[ DATA-DRIVEN RESULTS ]</p>
          <h2 className="mt-4 text-5xl font-semibold tracking-[-0.04em] md:text-6xl">Merge PRs faster with Greptile.</h2>
          <Link href="#" className={cn('mt-5 inline-flex items-center gap-2 text-xl text-[#17f0c4]', monoClassName)}>
            View performance data <ArrowRight className="h-5 w-5" />
          </Link>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="border border-border bg-card p-6">
              <p className={cn('text-xl text-foreground/70', monoClassName)}>Median Time to Merge Comparison</p>
              <p className="mt-4 text-4xl font-semibold">Without Greptile: 20 hrs</p>
              <p className="mt-2 text-4xl font-semibold text-[#17f0c4]">With Greptile: 1.8 hrs</p>
            </div>
            <div className="border border-border bg-card p-6">
              <p className={cn('text-xl text-foreground/70', monoClassName)}>Team Size vs Merge Time</p>
              <p className="mt-4 text-3xl">Without Greptile</p>
              <p className="mt-2 text-3xl text-[#17f0c4]">With Greptile</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl border border-border p-8">
          <p className={cn('text-lg text-[#ff6a00]', monoClassName)}>[ SECURITY ]</p>
          <h2 className="mt-4 text-5xl font-semibold tracking-[-0.04em] md:text-6xl">Security-First Design</h2>
          <Link href="#" className={cn('mt-5 inline-flex items-center gap-2 text-xl text-[#17f0c4]', monoClassName)}>
            View our security policy <ArrowRight className="h-5 w-5" />
          </Link>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <article className="border border-border bg-card p-6">
              <h3 className="text-3xl font-semibold">Self-Hosted Deployment</h3>
              <p className={cn('mt-3 text-xl text-foreground/75', monoClassName)}>
                Deploy in your own air-gapped environment with complete control over your infrastructure.
              </p>
            </article>
            <article className="border border-border bg-card p-6">
              <h3 className="text-3xl font-semibold">SOC 2 Compliant</h3>
              <p className={cn('mt-3 text-xl text-foreground/75', monoClassName)}>
                All data is encrypted at rest and in transit. We use industry-standard encryption and security
                practices.
              </p>
            </article>
          </div>
          <div className="mt-6 overflow-hidden border border-border bg-muted">
            <video
              src="/assets/workflow.webm"
              autoPlay
              muted
              loop
              playsInline
              className="w-full"
            />
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 pt-16">
        <div className="mx-auto max-w-7xl">
          <p className={cn('text-lg text-[#ff6a00]', monoClassName)}>[ TESTIMONIALS ]</p>
          <h2 className="mt-4 text-5xl font-semibold tracking-[-0.04em] md:text-6xl">From Developers That Use Greptile</h2>
          <p className={cn('mt-3 text-xl text-foreground/75 md:text-2xl', monoClassName)}>
            See what developers are saying about their experience with Greptile.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {testimonials.map((card) => (
              <article key={`${card.name}-${card.role}`} className="border border-border bg-card p-6">
                <p className={cn('text-lg text-foreground/85', monoClassName)}>{card.quote}</p>
                <p className="mt-8 text-xl font-semibold">{card.name}</p>
                <p className={cn('text-base text-foreground/60', monoClassName)}>{card.role}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <PremiumFooter displayClassName={displayClassName} monoClassName={monoClassName} />

      {!isSignedIn && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button asChild className="h-12 rounded-none border border-[#ff6a00] bg-[#ff6a00]/10 px-5 text-[#ff6a00] hover:bg-[#ff6a00]/20">
            <Link href="/sign-up">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}

      {isSignedIn && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button asChild className="h-12 rounded-none border border-[#ff6a00] bg-[#ff6a00]/10 px-5 text-[#ff6a00] hover:bg-[#ff6a00]/20">
            <Link href="/dashboard">
              Open dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </main>
  );
}
