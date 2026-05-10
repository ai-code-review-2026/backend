"use client"

import { motion } from "framer-motion"
import { GitPullRequest, Shield, CheckCircle } from "lucide-react"

export function ReviewEverywhereSection() {
  return (
    <section id="features" className="px-6 py-24 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Review Everywhere You Work
          </h2>
          <div className="mx-auto mt-4 h-1 w-24 rounded-full bg-gradient-to-r from-graphite-accent-orange to-amber-400" />
        </motion.div>

        <div className="mt-16 grid gap-8 lg:grid-cols-2">
          {/* On PRs Card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="group relative overflow-hidden rounded-2xl border border-graphite-border-primary bg-graphite-bg-secondary p-8 transition-all duration-300 hover:border-graphite-accent-orange/50 hover:shadow-[0_0_30px_rgba(249,115,22,0.15)]">
              {/* Top accent border */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-graphite-accent-orange to-amber-400" />
              
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-graphite-accent-orange/10 border border-graphite-accent-orange/20 group-hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all">
                  <GitPullRequest className="h-6 w-6 text-graphite-accent-orange" />
                </div>
                <h3 className="text-2xl font-bold text-white">On PRs</h3>
              </div>

              <p className="mb-6 text-graphite-text-secondary">
                Instant code reviews with clear summaries and fixes.
              </p>

              <ul className="mb-8 space-y-3">
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-graphite-accent-orange" />
                  <span className="text-graphite-text-primary">Catch bugs and potential issues immediately</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-graphite-accent-orange" />
                  <span className="text-graphite-text-primary">Enforce your code standards</span>
                </li>
              </ul>

              {/* Code Preview Mock */}
              <div className="overflow-hidden rounded-xl border border-graphite-border-primary bg-graphite-bg-primary shadow-lg">
                <div className="flex items-center gap-2 border-b border-graphite-border-primary bg-graphite-bg-tertiary px-3 py-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="ml-2 text-xs text-graphite-text-tertiary">src/components/Canvas/index.tsx</span>
                </div>
                <div className="bg-gradient-to-b from-emerald-500/5 to-transparent p-4 font-mono text-xs">
                  <div className="mb-2 flex items-start gap-2">
                    <span className="text-graphite-text-tertiary">1558</span>
                    <span className="text-emerald-400">+</span>
                  </div>
                  <div className="mb-2 flex items-start gap-2">
                    <span className="text-graphite-text-tertiary">1559</span>
                    <span className="text-emerald-400">+</span>
                    <span className="ml-4 text-graphite-text-primary">const handleSelection = () =&gt; &#123;</span>
                  </div>
                  <div className="mb-2 flex items-start gap-2">
                    <span className="text-graphite-text-tertiary">1560</span>
                    <span className="text-emerald-400">+</span>
                    <span className="ml-8 text-graphite-text-primary">
                      const <span className="text-graphite-accent-blue">activeObject</span> = canvas?.
                      <span className="text-purple-400">getActiveObject</span>();
                    </span>
                  </div>
                  <div className="mb-4 flex items-start gap-2">
                    <span className="text-graphite-text-tertiary">1561</span>
                    <span className="text-emerald-400">+</span>
                    <span className="ml-4 text-graphite-text-primary">&#125;;</span>
                  </div>

                  {/* AI Comment */}
                  <div className="mt-4 rounded-lg border border-graphite-accent-orange/30 bg-graphite-accent-orange/10 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-graphite-accent-orange to-amber-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]">
                        <span className="text-xs font-bold text-white">AI</span>
                      </div>
                      <span className="text-xs font-semibold text-graphite-text-primary">sourcery-ai</span>
                      <span className="text-xs text-graphite-text-tertiary">bot 2 days ago</span>
                    </div>
                    <p className="mb-2 text-xs font-medium text-graphite-text-primary">
                      suggestion (code_refinement): Refactor &apos;handleDrop&apos; to avoid redundant code and improve maintainability.
                    </p>
                    <p className="text-xs text-graphite-text-secondary">
                      The &apos;handleDrop&apos; function contains multiple responsibilities and repeated code blocks...
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Across Repos Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <div className="group relative overflow-hidden rounded-2xl border border-graphite-border-primary bg-graphite-bg-secondary p-8 transition-all duration-300 hover:border-graphite-accent-blue/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]">
              {/* Top accent border */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-graphite-accent-blue to-indigo-400" />
              
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-graphite-accent-blue/10 border border-graphite-accent-blue/20 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all">
                  <Shield className="h-6 w-6 text-graphite-accent-blue" />
                </div>
                <h3 className="text-2xl font-bold text-white">Across Repos</h3>
              </div>

              <p className="mb-6 text-graphite-text-secondary">
                Continuous security scans with detailed explanations and fixes.
              </p>

              <ul className="mb-8 space-y-3">
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-graphite-accent-blue" />
                  <span className="text-graphite-text-primary">High signal, low noise security scans</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-graphite-accent-blue" />
                  <span className="text-graphite-text-primary">Find and fix issues across all your repos</span>
                </li>
              </ul>

              {/* Security Alert Mock */}
              <div className="overflow-hidden rounded-xl border border-graphite-border-primary bg-graphite-bg-primary shadow-lg">
                <div className="flex items-center gap-2 border-b border-graphite-border-primary bg-graphite-bg-tertiary px-3 py-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                </div>
                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">
                      Remote code execution (RCE) from untrusted input evaluated by eval
                    </h4>
                  </div>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-red-500/20 border border-red-500/30 px-2 py-0.5 text-xs font-semibold text-red-400">
                      Critical
                    </span>
                    <span className="rounded-full bg-graphite-bg-tertiary border border-graphite-border-primary px-2 py-0.5 text-xs text-graphite-text-secondary">
                      core
                    </span>
                    <span className="text-xs text-graphite-text-tertiary">Last updated 8 hours ago</span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <h5 className="mb-1 font-semibold text-graphite-text-primary">Risk:</h5>
                      <p className="text-graphite-text-secondary">
                        RCE lets attackers execute arbitrary code, access sensitive data, pivot the environment, or fully compromise the process when untrusted input reaches eval.
                      </p>
                    </div>
                    <div>
                      <h5 className="mb-1 font-semibold text-graphite-text-primary">Fix:</h5>
                      <p className="text-graphite-text-secondary">
                        Remove eval usage. If parsing literals, use ast.literal_eval(). For calculations or logic, implement explicit handlers or a sandboxed like RestrictedPython with minimal, immutable globals.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
