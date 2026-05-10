"use client"

import { motion } from "framer-motion"
import { Zap, Bug, ShieldCheck } from "lucide-react"

const features = [
  {
    icon: Zap,
    title: "Keep velocity high",
    description: "Shorter review cycles, fewer blockers, faster merges.",
    gradient: "from-green-400 to-emerald-500",
    glowColor: "rgba(16, 185, 129, 0.15)",
  },
  {
    icon: Bug,
    title: "Kill bugs fast",
    description: "Logic errors and edge cases caught before they create rework.",
    gradient: "from-[#F97316] to-[#EA580C]",
    glowColor: "rgba(249, 115, 22, 0.15)",
  },
  {
    icon: ShieldCheck,
    title: "Stop vulnerabilities early",
    description: "Security checks from the first line of code to the final merge.",
    gradient: "from-[#E8713A] to-[#17F0C4]",
    glowColor: "rgba(232, 113, 58, 0.15)",
  },
]

export function AIEraSection() {
  return (
    <section className="relative bg-[#0A0A0B] px-6 py-24 sm:py-32 lg:px-8 overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#111113] via-[#0A0A0B] to-[#0A0A0B] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-[#FAFAFA] mb-4">
            Code Review for the <span className="text-[#F97316]">AI Era</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-[#A1A1AA] mb-6">
            Traditional reviews weren&apos;t built for AI-scale code. We are.
          </p>

          {/* Progress Dots - Graphite style */}
          <div className="mt-8 flex items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#27272A]" />
            <div className="h-2 w-2 rounded-full bg-[#F97316] shadow-neon-sm" />
            <div className="h-2 w-2 rounded-full bg-[#27272A]" />
          </div>
        </motion.div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className="group relative h-full overflow-hidden rounded-xl bg-[#18181B] border border-[#27272A] p-6 transition-all duration-300 hover:border-[rgba(249,115,22,0.3)] hover:bg-[#1E1E22]">
                  {/* Gradient top accent */}
                  <div className={`absolute left-0 top-0 h-1 w-full bg-gradient-to-r ${feature.gradient}`} />

                  <div className="flex flex-col items-center text-center">
                    {/* Icon container with gradient */}
                    <div
                      className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} shadow-lg`}
                    >
                      <Icon className="h-7 w-7 text-white" />
                    </div>

                    <h3 className="mb-3 text-xl font-bold text-[#FAFAFA]">{feature.title}</h3>
                    <p className="text-[#A1A1AA] text-sm leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
