"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"

export function CTASection() {
  return (
    <section className="px-6 py-24 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-graphite-border-primary bg-graphite-bg-secondary px-8 py-20 text-center shadow-2xl shadow-black/50"
        >
          {/* Background gradient effects */}
          <div className="absolute inset-0 bg-gradient-to-br from-graphite-accent-orange/10 via-transparent to-graphite-accent-blue/10" />
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-graphite-accent-orange/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-graphite-accent-blue/20 blur-3xl" />
          
          {/* Grid pattern overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

          <div className="relative z-10">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-graphite-accent-orange/30 bg-graphite-accent-orange/10 px-4 py-1.5"
            >
              <Sparkles className="h-4 w-4 text-graphite-accent-orange" />
              <span className="text-sm font-medium text-graphite-accent-orange">Start Free Today</span>
            </motion.div>

            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Ready to Transform Your{" "}
              <span className="bg-gradient-to-r from-graphite-accent-orange to-amber-400 bg-clip-text text-transparent">
                Code Reviews
              </span>
              ?
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-graphite-text-secondary">
              Join thousands of teams shipping faster with AI-powered code review.
              Get started in minutes, no credit card required.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/sign-up">
                <button className="group relative inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-graphite-accent-orange to-amber-500 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-graphite-accent-orange/25 transition-all duration-300 hover:shadow-xl hover:shadow-graphite-accent-orange/30 hover:-translate-y-0.5">
                  <span>Start Free Trial</span>
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  {/* Glow effect */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-graphite-accent-orange to-amber-500 opacity-0 blur-xl transition-opacity group-hover:opacity-50" />
                </button>
              </Link>
              <Link href="/sign-in">
                <button className="inline-flex items-center gap-2 rounded-full border border-graphite-border-secondary bg-graphite-bg-tertiary/50 px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:border-graphite-text-tertiary hover:bg-graphite-bg-tertiary">
                  Sign In
                </button>
              </Link>
            </div>

            <p className="mt-8 text-sm text-graphite-text-tertiary">
              Free forever for public repositories · No credit card required
            </p>

            {/* Trust indicators */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-8 border-t border-graphite-border-primary pt-8">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="h-8 w-8 rounded-full border-2 border-graphite-bg-secondary bg-gradient-to-br from-graphite-bg-tertiary to-graphite-bg-primary"
                    />
                  ))}
                </div>
                <span className="text-sm text-graphite-text-secondary">
                  <span className="font-semibold text-white">2,000+</span> teams trust us
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="h-5 w-5 text-graphite-accent-orange" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span className="text-sm text-graphite-text-secondary">
                  <span className="font-semibold text-white">4.9/5</span> average rating
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
