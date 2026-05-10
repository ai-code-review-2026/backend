"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowRight, GitBranch, Shield, Zap, Sparkles, Code2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export function LandingHero() {
  return (
    <section className="relative overflow-hidden px-6 py-24 sm:py-32 lg:px-8 bg-[#0A0A0B]">
      {/* Hero radial gradient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.12)_0%,transparent_70%)]" />
      </div>

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      
      <div className="relative mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          {/* Announcement Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full bg-[rgba(249,115,22,0.1)] border border-[rgba(249,115,22,0.2)] px-4 py-2 text-sm font-medium text-[#FB923C]"
          >
            <Sparkles className="h-4 w-4" />
            Code Review for the AI Era
          </motion.div>

          {/* Main Heading - Graphite style */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-[-0.03em] leading-[1.1] text-[#FAFAFA] mb-6"
          >
            Ship Faster with
            <br />
            <span className="bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
              AI-Powered Code Review
            </span>
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mx-auto max-w-2xl text-lg leading-relaxed text-[#A1A1AA] mb-10"
          >
            Traditional reviews weren&apos;t built for AI-scale code. Get instant reviews with clear summaries and fixes.
            Catch bugs and security issues before they reach production.
          </motion.p>

          {/* CTA Buttons - Graphite style */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6"
          >
            <Link href="/sign-up">
              <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white rounded-full px-8 py-6 text-base font-semibold hover:brightness-110 shadow-glow-orange transition-all duration-300 gap-2">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="#features">
              <Button size="lg" variant="outline" className="w-full sm:w-auto border-[#27272A] text-[#FAFAFA] rounded-full px-8 py-6 text-base font-semibold hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.2)] transition-all duration-300">
                View Demo
              </Button>
            </Link>
          </motion.div>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="text-sm text-[#71717A] mb-12"
          >
            Free for your first 30 days. No credit card required.
          </motion.p>

          {/* Stats - Graphite cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto"
          >
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#18181B] border border-[#27272A] hover:border-[rgba(249,115,22,0.3)] transition-colors duration-300">
              <div className="w-10 h-10 rounded-lg bg-[rgba(249,115,22,0.1)] flex items-center justify-center flex-shrink-0">
                <GitBranch className="w-5 h-5 text-[#F97316]" />
              </div>
              <div className="text-left">
                <div className="text-lg font-bold text-[#FAFAFA]">10x Faster</div>
                <div className="text-sm text-[#71717A]">Review Speed</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#18181B] border border-[#27272A] hover:border-[rgba(249,115,22,0.3)] transition-colors duration-300">
              <div className="w-10 h-10 rounded-lg bg-[rgba(249,115,22,0.1)] flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-[#F97316]" />
              </div>
              <div className="text-left">
                <div className="text-lg font-bold text-[#FAFAFA]">99% Accuracy</div>
                <div className="text-sm text-[#71717A]">Bug Detection</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#18181B] border border-[#27272A] hover:border-[rgba(249,115,22,0.3)] transition-colors duration-300">
              <div className="w-10 h-10 rounded-lg bg-[rgba(249,115,22,0.1)] flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-[#F97316]" />
              </div>
              <div className="text-left">
                <div className="text-lg font-bold text-[#FAFAFA]">5 Minutes</div>
                <div className="text-sm text-[#71717A]">Setup Time</div>
              </div>
            </div>
          </motion.div>

          {/* Neon Logo Animation */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="mt-16 flex justify-center"
          >
            <div className="relative w-24 h-24 rounded-2xl border-2 border-[#F97316] animate-neon-pulse flex items-center justify-center">
              <Code2 className="w-12 h-12 text-[#F97316]" style={{ filter: "drop-shadow(0 0 10px #F97316)" }} />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
