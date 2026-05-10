'use client';

import { cn } from '@/components/ui/utils';

function hexPath(
  cx: number,
  cy: number,
  r: number,
  rot: number,
  cr: number,
): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = rot + (i * Math.PI) / 3;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });

  return (
    pts
      .map((p, i) => {
        const prev = pts[(i + 5) % 6];
        const next = pts[(i + 1) % 6];
        const dp: [number, number] = [prev[0] - p[0], prev[1] - p[1]];
        const dn: [number, number] = [next[0] - p[0], next[1] - p[1]];
        const lp = Math.hypot(dp[0], dp[1]);
        const ln = Math.hypot(dn[0], dn[1]);
        const t = Math.min(cr, lp / 2, ln / 2);
        const s = [p[0] + (dp[0] / lp) * t, p[1] + (dp[1] / lp) * t];
        const e = [p[0] + (dn[0] / ln) * t, p[1] + (dn[1] / ln) * t];
        const move =
          i === 0
            ? `M ${s[0].toFixed(2)} ${s[1].toFixed(2)}`
            : `L ${s[0].toFixed(2)} ${s[1].toFixed(2)}`;
        return `${move} Q ${p[0].toFixed(2)} ${p[1].toFixed(2)} ${e[0].toFixed(2)} ${e[1].toFixed(2)}`;
      })
      .join(' ') + ' Z'
  );
}

type NeonHexVisualProps = {
  className?: string;
};

export function NeonHexVisual({ className }: NeonHexVisualProps) {
  const cx = 200;
  const cy = 200;

  // Outer shape: large, nearly upright, faintest
  const outer = hexPath(cx, cy, 168, -Math.PI / 2, 24);
  // Middle shape: slightly smaller, rotated ~16°, most prominent
  const middle = hexPath(cx, cy, 146, -Math.PI / 2 + 0.28, 20);
  // Inner shape: compact, counter-rotated ~8°
  const inner = hexPath(cx, cy, 92, -Math.PI / 2 - 0.15, 14);

  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('overflow-visible', className)}
      aria-hidden="true"
    >
      <path d={outer} stroke="white" strokeWidth="1.1" strokeOpacity="0.30" />
      <path d={middle} stroke="white" strokeWidth="1.1" strokeOpacity="0.55" />
      <path d={inner} stroke="white" strokeWidth="1.1" strokeOpacity="0.72" />
    </svg>
  );
}
