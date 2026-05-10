import { cn } from '@/components/ui/utils';

type BrandMarkProps = {
  className?: string;
  tone?: 'light' | 'dark';
  glow?: boolean;
};

export function BrandMark({
  className,
  tone = 'dark',
  glow = false,
}: BrandMarkProps) {
  const light = tone === 'light';

  return (
    <div
      className={cn(
        'relative flex aspect-square items-center justify-center overflow-hidden rounded-[28%] border shadow-[0_10px_40px_rgba(17,17,17,0.12)]',
        light
          ? 'border-black/10 bg-white text-black'
          : 'border-white/15 bg-[#090b10] text-white',
        className,
      )}
    >
      {glow ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.45),transparent_62%)]" />
      ) : null}
      <div
        className={cn(
          'absolute inset-[18%] rotate-45 rounded-[26%] border',
          light ? 'border-black/65' : 'border-white/80',
        )}
      />
      <div
        className={cn(
          'absolute inset-[31%] -rotate-12 rounded-[24%] border',
          light ? 'border-black/50' : 'border-white/70',
        )}
      />
      <div
        className={cn(
          'absolute size-[18%] rounded-full blur-[1px]',
          light ? 'bg-emerald-500/60' : 'bg-white/65',
        )}
      />
    </div>
  );
}
