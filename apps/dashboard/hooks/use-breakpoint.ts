import * as React from "react";

/**
 * Breakpoints matching tailwind.config.ts
 * xs: 375px, sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px, 3xl: 1920px, 4xl: 2560px
 */
export const BREAKPOINTS = {
  xs: 375,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
  "3xl": 1920,
  "4xl": 2560,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

export type DeviceType = "mobile" | "tablet" | "desktop" | "tv";

/**
 * Returns the current breakpoint key based on window width
 */
export function useBreakpoint(): BreakpointKey {
  const [breakpoint, setBreakpoint] = React.useState<BreakpointKey>("xs");

  React.useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;
      
      if (width >= BREAKPOINTS["4xl"]) {
        setBreakpoint("4xl");
      } else if (width >= BREAKPOINTS["3xl"]) {
        setBreakpoint("3xl");
      } else if (width >= BREAKPOINTS["2xl"]) {
        setBreakpoint("2xl");
      } else if (width >= BREAKPOINTS.xl) {
        setBreakpoint("xl");
      } else if (width >= BREAKPOINTS.lg) {
        setBreakpoint("lg");
      } else if (width >= BREAKPOINTS.md) {
        setBreakpoint("md");
      } else if (width >= BREAKPOINTS.sm) {
        setBreakpoint("sm");
      } else {
        setBreakpoint("xs");
      }
    };

    updateBreakpoint();
    window.addEventListener("resize", updateBreakpoint);
    return () => window.removeEventListener("resize", updateBreakpoint);
  }, []);

  return breakpoint;
}

/**
 * Returns the current device type (mobile, tablet, desktop, tv)
 */
export function useDeviceType(): DeviceType {
  const breakpoint = useBreakpoint();
  
  const deviceMap: Record<BreakpointKey, DeviceType> = {
    xs: "mobile",
    sm: "mobile",
    md: "tablet",
    lg: "desktop",
    xl: "desktop",
    "2xl": "desktop",
    "3xl": "tv",
    "4xl": "tv",
  };
  
  return deviceMap[breakpoint];
}

/**
 * Returns true if the current breakpoint is at least the specified size
 */
export function useBreakpointAtLeast(minBreakpoint: BreakpointKey): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(min-width: ${BREAKPOINTS[minBreakpoint]}px)`
    );
    
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setMatches(e.matches);
    };

    // Initial check
    handleChange(mediaQuery);

    // Listen for changes
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [minBreakpoint]);

  return matches;
}

/**
 * Returns true if the current breakpoint is at most the specified size
 */
export function useBreakpointAtMost(maxBreakpoint: BreakpointKey): boolean {
  const [matches, setMatches] = React.useState(true);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(max-width: ${BREAKPOINTS[maxBreakpoint] - 1}px)`
    );
    
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setMatches(e.matches);
    };

    // Initial check
    handleChange(mediaQuery);

    // Listen for changes
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [maxBreakpoint]);

  return matches;
}

/**
 * Returns true if the current breakpoint is between min and max (inclusive)
 */
export function useBreakpointBetween(
  minBreakpoint: BreakpointKey,
  maxBreakpoint: BreakpointKey
): boolean {
  const atLeast = useBreakpointAtLeast(minBreakpoint);
  const atMost = useBreakpointAtMost(maxBreakpoint);
  return atLeast && atMost;
}

/**
 * Convenience hooks for common device checks
 */
export function useIsMobile(): boolean {
  return useBreakpointAtMost("sm");
}

export function useIsTablet(): boolean {
  return useBreakpointBetween("md", "lg");
}

export function useIsDesktop(): boolean {
  return useBreakpointAtLeast("lg");
}

export function useIsTV(): boolean {
  return useBreakpointAtLeast("3xl");
}

/**
 * Returns window dimensions with SSR safety
 */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const updateSize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  return size;
}
