import {
  BarChart3,
  Bot,
  BrainCircuit,
  FileCode2,
  GitPullRequestArrow,
  LockKeyhole,
  type LucideIcon,
  Network,
  Orbit,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export type NavLink = {
  href: string;
  label: string;
};

export type HeroStat = {
  label: string;
  value: string;
};

export type FeatureStory = {
  id: string;
  step: string;
  eyebrow: string;
  label: string;
  title: string;
  description: string;
  supporting: string;
  bullets: string[];
  metric: string;
  visual: 'graph' | 'rules' | 'summary' | 'learning' | 'merge' | 'security';
  accent: string;
  icon: LucideIcon;
};

export type PricingTier = {
  name: string;
  price: string;
  description: string;
  highlight?: string;
  featured?: boolean;
  features: string[];
  cta: string;
};

export type DocsCard = {
  title: string;
  description: string;
  meta: string;
  icon: LucideIcon;
};

export const navLinks: NavLink[] = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#docs', label: 'Docs' },
];

export const trustLogos = [
  'GitHub',
  'Vercel',
  'Datadog',
  'Ramp',
  'Semgrep',
  'Shopify',
  'Snowflake',
  'Figma',
  'PostHog',
  'Asana',
  'Brex',
  'Linear',
];

export const heroStats: HeroStat[] = [
  { value: '2.1M+', label: 'PR diffs indexed with repo context' },
  { value: '86%', label: 'accepted comments after team feedback loops' },
  { value: '1.8h', label: 'median time-to-merge on AI-assisted flows' },
];

export const featureStories: FeatureStory[] = [
  {
    id: 'context',
    step: '01',
    eyebrow: 'Full Codebase Context',
    label: 'Your second pair of eyes',
    title: 'Get context-aware comments on your PRs',
    description:
      'Review feedback lands with service-level awareness, dependency traces, and repo history instead of generic lint-like noise.',
    supporting:
      'Codebase AI maps your architecture, tracks call graphs, and understands how a change in auth, billing, or shared utilities propagates across the stack.',
    bullets: [
      'Service graph + file history + ownership signals in one review pass',
      'Flags risky edges like remote API calls, auth paths, and alias resolution',
      'Keeps the visual slot reserved for product screenshots or demo video overlays',
    ],
    metric: '36+ languages and framework-aware repository indexing',
    visual: 'graph',
    accent: 'from-emerald-300/55 via-cyan-300/35 to-sky-300/10',
    icon: Network,
  },
  {
    id: 'rules',
    step: '02',
    eyebrow: 'Custom Context',
    label: 'Your house, your rules',
    title: 'Describe your coding standards in English',
    description:
      'Turn tribal knowledge into reviewer behavior with plain-English rules, scoped patterns, and repo-specific guidance.',
    supporting:
      'Write rules once, target them to directories or repos, and keep a dedicated media placeholder where your team can later drop explainer screenshots or walkthrough clips.',
    bullets: [
      'Natural-language policies for style, architecture, and security boundaries',
      'Scoped by repository, path, or pattern without editing backend logic',
      'Reserved image/video placement kept visible in the layout',
    ],
    metric: 'Rule adoption and feedback usage measured per team policy',
    visual: 'rules',
    accent: 'from-amber-300/45 via-rose-300/30 to-orange-300/10',
    icon: FileCode2,
  },
  {
    id: 'summaries',
    step: '03',
    eyebrow: 'PR Summaries',
    label: 'Understand PRs instantly',
    title: 'AI summaries that brief you before the first scroll',
    description:
      'Condensed intent, file-by-file risk, and confidence signals help reviewers orient in seconds, not minutes.',
    supporting:
      'Use summaries for triage, async handoff, or manager visibility while keeping room for future screenshots, clips, or demo thumbnails in the same visual footprint.',
    bullets: [
      'Change narrative, hotspots, and confidence score in one panel',
      'Structured file table for impacted modules and downstream blast radius',
      'Ready for product demo assets without redesigning the section later',
    ],
    metric: 'Median reviewer ramp-up cut from 14 minutes to under 3',
    visual: 'summary',
    accent: 'from-fuchsia-300/40 via-violet-300/30 to-blue-300/10',
    icon: Sparkles,
  },
  {
    id: 'learning',
    step: '04',
    eyebrow: 'Learning System',
    label: "Learns from your team's feedback",
    title: 'Accepted, rejected, and edited comments become signal',
    description:
      "The reviewer keeps tuning itself to your team's judgment instead of resetting every sprint.",
    supporting:
      'When seniors reword suggestions or reject noisy findings, Codebase AI adapts the next pass so review quality compounds over time.',
    bullets: [
      'Tracks thumbs-up, edits, dismissals, and merged outcomes',
      'Learns which comments your team actually acts on',
      'Preserves the same premium visual slot for clips or social proof later',
    ],
    metric: '95% upvote ratio on comments that survive two learning cycles',
    visual: 'learning',
    accent: 'from-lime-300/40 via-emerald-300/30 to-teal-300/10',
    icon: BrainCircuit,
  },
  {
    id: 'merge',
    step: '05',
    eyebrow: 'Merge Faster',
    label: 'Merge PRs faster with AI',
    title: 'AI review removes the dead air between author and approver',
    description:
      'Summaries, inline fixes, and stack-aware risk surfacing reduce waiting, not just comment count.',
    supporting:
      'Teams move faster because reviewers start with context, authors resolve issues earlier, and managers get performance visibility without extra meetings.',
    bullets: [
      'Inline fixes before review starts',
      'PR-level summaries for async approvals and handoffs',
      'Performance charts ready to swap with real screenshots later',
    ],
    metric: '1.8 hours with AI review vs 20 hours without assistive context',
    visual: 'merge',
    accent: 'from-sky-300/40 via-indigo-300/30 to-violet-300/10',
    icon: GitPullRequestArrow,
  },
  {
    id: 'security',
    step: '06',
    eyebrow: 'Security',
    label: 'Security-first design',
    title: 'Enterprise-ready review flows without compromising repo boundaries',
    description:
      'Encryption, isolated execution, and clear data boundaries make the landing promise credible for security-conscious teams.',
    supporting:
      'Show hosted or air-gapped deployment, policy enforcement, and provider boundaries while reserving the diagram position for future compliance visuals or product video.',
    bullets: [
      'Hosted and self-hosted deployment patterns with isolated review runners',
      'Clear LLM, audit, and repo boundaries for enterprise buyers',
      'Visual placeholder maintained for compliance screenshots or walkthrough clips',
    ],
    metric: 'SOC 2-minded posture with encrypted review context and traceable rules',
    visual: 'security',
    accent: 'from-slate-400/40 via-zinc-400/30 to-neutral-400/10',
    icon: LockKeyhole,
  },
];

export const pricingTiers: PricingTier[] = [
  {
    name: 'Developer',
    price: '$0',
    description: 'For solo builders validating context-aware PR feedback on small repos.',
    features: [
      '1 active repository',
      'Context-aware review summaries',
      'Basic rules in English',
      'Community docs and examples',
    ],
    cta: 'Start free',
  },
  {
    name: 'Team',
    price: '$39',
    description: 'For product teams that want merged context, learning loops, and repo-aware collaboration.',
    highlight: 'Most popular',
    featured: true,
    features: [
      'Unlimited pull requests',
      'Learning from team feedback',
      'Merge-time analytics',
      'Custom review policies',
      'Priority support',
    ],
    cta: 'Start reviewing',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For organizations with air-gapped, audit-heavy, or self-hosted review requirements.',
    features: [
      'Self-hosted deployment',
      'Advanced security controls',
      'Dedicated onboarding',
      'Custom data retention policies',
    ],
    cta: 'Talk to sales',
  },
];

export const docsCards: DocsCard[] = [
  {
    title: 'Quickstart',
    description: 'Connect GitHub, map repositories, and see the first context-aware review in minutes.',
    meta: 'Install guide',
    icon: Orbit,
  },
  {
    title: 'Rulebook',
    description: 'Translate engineering standards into English policies and scope them by repo or directory.',
    meta: 'Policy docs',
    icon: Bot,
  },
  {
    title: 'Security & Deployment',
    description: 'Hosted, self-hosted, and air-gapped deployment references with boundary diagrams.',
    meta: 'Enterprise docs',
    icon: ShieldCheck,
  },
  {
    title: 'Review Analytics',
    description: 'Understand adoption, merge velocity, and comment quality without adding operational drag.',
    meta: 'Metrics docs',
    icon: BarChart3,
  },
];

export const footerColumns = {
  product: ['Features', 'Pricing', 'Docs', 'Security'],
  company: ['Customers', 'Blog', 'Contact', 'Careers'],
  resources: ['Integrations', 'API status', 'Guides', 'Privacy'],
};
