import type { Metadata } from 'next';
import { IBM_Plex_Mono, Sora } from 'next/font/google';

import { PremiumLandingPage } from '@/components/marketing/premium-landing';

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
});

export const metadata: Metadata = {
  title: 'Devora | Context-aware code review for modern teams',
  description:
    'Devora reviews pull requests with full codebase context, team-specific rules, AI summaries, and security-first workflows.',
};

export default function HomePage() {
  return (
    <PremiumLandingPage
      displayClassName={sora.className}
      monoClassName={mono.className}
    />
  );
}
