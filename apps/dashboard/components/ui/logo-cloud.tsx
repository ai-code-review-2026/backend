'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { InfiniteSlider } from './infinite-slider';
import { ProgressiveBlur } from './progressive-blur';
import { 
  Chrome, 
  Trello,
  Figma,
} from 'lucide-react';
import { Github, Linkedin, Twitter, Slack, Facebook } from '@/components/ui/social-icons';

// ============================================================================
// TYPES
// ============================================================================

interface Logo {
  name: string;
  icon?: React.ReactNode;
  src?: string;
  href?: string;
}

interface LogoCloudProps {
  logos?: Logo[];
  title?: string;
  subtitle?: string;
  variant?: 'default' | 'minimal' | 'cards' | 'gradient';
  speed?: number;
  gap?: number;
  pauseOnHover?: boolean;
  reverse?: boolean;
  className?: string;
  showBlur?: boolean;
}

// ============================================================================
// DEFAULT LOGOS
// ============================================================================

const defaultLogos: Logo[] = [
  { name: 'GitHub', icon: <Github className="h-6 w-6" /> },
  { name: 'Chrome', icon: <Chrome className="h-6 w-6" /> },
  { name: 'Slack', icon: <Slack className="h-6 w-6" /> },
  { name: 'Facebook', icon: <Facebook className="h-6 w-6" /> },
  { name: 'Twitter', icon: <Twitter className="h-6 w-6" /> },
  { name: 'LinkedIn', icon: <Linkedin className="h-6 w-6" /> },
  { name: 'Trello', icon: <Trello className="h-6 w-6" /> },
  { name: 'Figma', icon: <Figma className="h-6 w-6" /> },
];

// ============================================================================
// LOGO ITEM COMPONENTS
// ============================================================================

function LogoItemDefault({ logo }: { logo: Logo }) {
  const content = (
    <div className="flex items-center gap-3 px-6 text-gray-500 hover:text-gray-300 transition-colors">
      {logo.icon || (
        logo.src && (
          <img src={logo.src} alt={logo.name} className="h-6 w-auto object-contain" />
        )
      )}
      <span className="text-lg font-semibold whitespace-nowrap">{logo.name}</span>
    </div>
  );

  if (logo.href) {
    return (
      <a href={logo.href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
}

function LogoItemMinimal({ logo }: { logo: Logo }) {
  const content = (
    <div className="flex items-center justify-center w-12 h-12 text-gray-600 hover:text-gray-400 transition-colors">
      {logo.icon || (
        logo.src && (
          <img src={logo.src} alt={logo.name} className="h-8 w-auto object-contain opacity-60 hover:opacity-100 transition-opacity" />
        )
      )}
    </div>
  );

  if (logo.href) {
    return (
      <a href={logo.href} target="_blank" rel="noopener noreferrer" title={logo.name}>
        {content}
      </a>
    );
  }

  return <div title={logo.name}>{content}</div>;
}

function LogoItemCard({ logo }: { logo: Logo }) {
  const content = (
    <motion.div
      whileHover={{ scale: 1.05, y: -4 }}
      className="flex flex-col items-center justify-center gap-3 p-6 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 rounded-xl transition-colors min-w-[140px]"
    >
      <div className="text-gray-400 group-hover:text-white transition-colors">
        {logo.icon || (
          logo.src && (
            <img src={logo.src} alt={logo.name} className="h-8 w-auto object-contain" />
          )
        )}
      </div>
      <span className="text-sm font-medium text-gray-500">{logo.name}</span>
    </motion.div>
  );

  if (logo.href) {
    return (
      <a href={logo.href} target="_blank" rel="noopener noreferrer" className="group">
        {content}
      </a>
    );
  }

  return <div className="group">{content}</div>;
}

function LogoItemGradient({ logo, index }: { logo: Logo; index: number }) {
  const gradients = [
    'from-blue-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-green-500 to-emerald-500',
    'from-orange-500 to-red-500',
    'from-indigo-500 to-purple-500',
    'from-pink-500 to-rose-500',
    'from-cyan-500 to-blue-500',
    'from-yellow-500 to-orange-500',
  ];
  
  const gradient = gradients[index % gradients.length];

  const content = (
    <motion.div
      whileHover={{ scale: 1.1 }}
      className={cn(
        'flex items-center gap-3 px-5 py-2 rounded-full',
        'bg-gradient-to-r opacity-80 hover:opacity-100 transition-opacity',
        gradient
      )}
    >
      <div className="text-white">
        {logo.icon || (
          logo.src && (
            <img src={logo.src} alt={logo.name} className="h-5 w-auto object-contain brightness-0 invert" />
          )
        )}
      </div>
      <span className="text-sm font-semibold text-white whitespace-nowrap">{logo.name}</span>
    </motion.div>
  );

  if (logo.href) {
    return (
      <a href={logo.href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LogoCloud({
  logos = defaultLogos,
  title = 'Trusted by innovative teams worldwide',
  subtitle,
  variant = 'default',
  speed,
  gap = 32,
  pauseOnHover = true,
  reverse = false,
  className,
  showBlur = true,
}: LogoCloudProps) {
  // Calculate duration based on number of logos (slower for fewer logos)
  const duration = speed ? 1000 / speed : 25 + logos.length * 2;
  const durationOnHover = pauseOnHover ? duration * 2 : undefined;

  const renderLogoItem = (logo: Logo, index: number) => {
    switch (variant) {
      case 'minimal':
        return <LogoItemMinimal key={`${logo.name}-${index}`} logo={logo} />;
      case 'cards':
        return <LogoItemCard key={`${logo.name}-${index}`} logo={logo} />;
      case 'gradient':
        return <LogoItemGradient key={`${logo.name}-${index}`} logo={logo} index={index} />;
      default:
        return <LogoItemDefault key={`${logo.name}-${index}`} logo={logo} />;
    }
  };

  return (
    <section className={cn('relative py-12 overflow-hidden', className)}>
      {/* Title */}
      {(title || subtitle) && (
        <div className="relative max-w-7xl mx-auto px-4 mb-10 text-center">
          {title && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-sm text-gray-500 uppercase tracking-wider font-medium"
            >
              {title}
            </motion.p>
          )}
          {subtitle && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="mt-2 text-lg text-gray-400"
            >
              {subtitle}
            </motion.p>
          )}
        </div>
      )}

      {/* Logo slider */}
      <div className="relative">
        {/* Edge blurs */}
        {showBlur && (
          <>
            <ProgressiveBlur
              className="absolute left-0 top-0 bottom-0 z-10 w-32 pointer-events-none"
              direction="left"
              blurIntensity={1}
            />
            <ProgressiveBlur
              className="absolute right-0 top-0 bottom-0 z-10 w-32 pointer-events-none"
              direction="right"
              blurIntensity={1}
            />
          </>
        )}

        <InfiniteSlider
          duration={duration}
          durationOnHover={durationOnHover}
          gap={gap}
          reverse={reverse}
          className="py-4"
        >
          {logos.map((logo, index) => renderLogoItem(logo, index))}
        </InfiniteSlider>
      </div>
    </section>
  );
}

// ============================================================================
// PRESET VARIANTS
// ============================================================================

export function LogoCloudMinimal(props: Omit<LogoCloudProps, 'variant'>) {
  return <LogoCloud {...props} variant="minimal" />;
}

export function LogoCloudCards(props: Omit<LogoCloudProps, 'variant'>) {
  return <LogoCloud {...props} variant="cards" />;
}

export function LogoCloudGradient(props: Omit<LogoCloudProps, 'variant'>) {
  return <LogoCloud {...props} variant="gradient" />;
}

// ============================================================================
// DOUBLE ROW VARIANT
// ============================================================================

export function LogoCloudDouble({
  logos = defaultLogos,
  title,
  subtitle,
  variant = 'default',
  className,
  ...props
}: LogoCloudProps) {
  const midPoint = Math.ceil(logos.length / 2);
  const firstRow = logos.slice(0, midPoint);
  const secondRow = logos.slice(midPoint);

  return (
    <section className={cn('relative py-12 overflow-hidden', className)}>
      {/* Title */}
      {(title || subtitle) && (
        <div className="relative max-w-7xl mx-auto px-4 mb-10 text-center">
          {title && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-sm text-gray-500 uppercase tracking-wider font-medium"
            >
              {title}
            </motion.p>
          )}
          {subtitle && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="mt-2 text-lg text-gray-400"
            >
              {subtitle}
            </motion.p>
          )}
        </div>
      )}

      {/* First row */}
      <LogoCloud
        logos={firstRow}
        variant={variant}
        title=""
        showBlur={true}
        {...props}
        className="py-2"
      />

      {/* Second row (reversed) */}
      <LogoCloud
        logos={secondRow}
        variant={variant}
        title=""
        showBlur={true}
        reverse
        {...props}
        className="py-2"
      />
    </section>
  );
}
