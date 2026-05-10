import type { Config } from "tailwindcss"

const orangeScale = {
  50: "#fff5ed",
  100: "#ffe7d8",
  200: "#ffd0b3",
  300: "#ffb27d",
  400: "#f78c4f",
  500: "#e8713a",
  600: "#cf612d",
  700: "#a64d23",
  800: "#823c1b",
  900: "#5d2b13",
  950: "#32160a",
}

const tealScale = {
  50: "#edfef9",
  100: "#d4fef3",
  200: "#a7f7e8",
  300: "#6eead6",
  400: "#2fe0c7",
  500: "#17f0c4",
  600: "#13c1a0",
  700: "#0f8f79",
  800: "#0b6152",
  900: "#073d34",
  950: "#041e1a",
}

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./data/**/*.{ts,tsx}",
  ],
  theme: {
    // Custom breakpoints for all screen sizes
    screens: {
      'xs': '375px',      // Small smartphones
      'sm': '640px',      // Large smartphones / small tablets
      'md': '768px',      // Tablets portrait
      'lg': '1024px',     // Tablets landscape / small laptops
      'xl': '1280px',     // Desktops
      '2xl': '1536px',    // Large desktops
      '3xl': '1920px',    // Full HD TVs / large monitors
      '4xl': '2560px',    // 2K/QHD TVs / ultra-wide monitors
    },
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        blue: orangeScale,
        cyan: tealScale,
        indigo: tealScale,
        purple: tealScale,
        violet: orangeScale,
        pink: orangeScale,
        rose: orangeScale,
        orange: orangeScale,
        teal: tealScale,
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        // Graphite Design System - Exact Colors
        gr: {
          page: "#0C0C0D",
          banner: "#1A1A1D",
          card: "#141416",
          "card-inner": "#1A1A1E",
          "card-hover": "#1E1E23",
          elevated: "#222226",
          // Text
          "text-primary": "#F5F5F5",
          "text-secondary": "#A0A0A8",
          "text-muted": "#6B6B75",
          "text-subtle": "#4A4A54",
          "text-banner": "#C8D5A0",
          // Brand
          orange: "#E8713A",
          "orange-light": "#F09456",
          "orange-hover": "#F5984F",
          green: "#22C55E",
          purple: "#7C5CFC",
          "yellow-ramp": "#D4E94C",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Graphite radius system
        "gr-sm": "6px",
        "gr-md": "8px",
        "gr-lg": "12px",
        "gr-xl": "16px",
        "gr-2xl": "20px",
        "gr-3xl": "24px",
      },
      boxShadow: {
        // Graphite shadows
        "gr-card": "0 4px 12px rgba(0,0,0,0.4)",
        "gr-elevated": "0 12px 30px rgba(0,0,0,0.5)",
        "glow-neon": "0 0 40px rgba(255,255,255,0.3), 0 0 80px rgba(255,255,255,0.15)",
        "glow-orange": "0 0 20px rgba(232,113,58,0.3)",
        "glow-orange-strong": "0 0 30px rgba(232,113,58,0.4), 0 0 60px rgba(232,113,58,0.2)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "marquee-reverse": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        neonPulse: {
          "0%, 100%": { 
            boxShadow: "0 0 20px rgba(255,255,255,0.2), 0 0 40px rgba(255,255,255,0.1)",
            opacity: "0.9"
          },
          "50%": { 
            boxShadow: "0 0 40px rgba(255,255,255,0.4), 0 0 80px rgba(255,255,255,0.2)",
            opacity: "1"
          },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        marquee: "marquee 20s linear infinite",
        "marquee-reverse": "marquee-reverse 20s linear infinite",
        "fade-in-up": "fadeInUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        float: "float 6s ease-in-out infinite",
        "neon-pulse": "neonPulse 3s ease-in-out infinite",
        shimmer: "shimmer 2s ease-in-out infinite",
      },
      transitionTimingFunction: {
        "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "smooth": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      fontSize: {
        // Graphite typography
        "hero": ["52px", { lineHeight: "1.08", letterSpacing: "-0.035em", fontWeight: "800" }],
        "section": ["40px", { lineHeight: "1.12", letterSpacing: "-0.025em", fontWeight: "700" }],
        "section-sm": ["34px", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "700" }],
        "feature": ["22px", { lineHeight: "1.25", letterSpacing: "-0.015em", fontWeight: "700" }],
        "card-title": ["18px", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "700" }],
      },
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
      },
      maxWidth: {
        "8xl": "1280px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
