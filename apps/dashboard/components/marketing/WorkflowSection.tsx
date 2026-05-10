"use client"

import { motion } from "framer-motion"
import { CheckCircle, Circle } from "lucide-react"

const steps = [
  { id: 1, name: "Start", status: "completed" },
  { id: 2, name: "CodeReviewRequest", status: "completed" },
  { id: 3, name: "AssignReviewer", status: "active" },
  { id: 4, name: "ReviewCode", status: "pending" },
  { id: 5, name: "ProvideFeedback", status: "pending" },
  { id: 6, name: "ImplementChanges", status: "pending" },
  { id: 7, name: "FinalApproval", status: "pending" },
  { id: 8, name: "End", status: "pending" },
]

export function WorkflowSection() {
  return (
    <section className="px-6 py-24 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Streamlined Review Workflow
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-graphite-text-secondary">
            From request to merge, every step is optimized for speed and quality.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-16"
        >
          {/* Workflow visualization */}
          <div className="relative overflow-x-auto pb-4">
            <div className="flex items-center justify-between gap-2 min-w-max px-4">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  {/* Step node */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all ${
                        step.status === "completed"
                          ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                          : step.status === "active"
                            ? "border-graphite-accent-orange bg-graphite-accent-orange/10 shadow-[0_0_20px_rgba(249,115,22,0.4)] animate-neon-pulse"
                            : "border-graphite-border-primary bg-graphite-bg-secondary"
                      }`}
                    >
                      {step.status === "completed" ? (
                        <CheckCircle className="h-6 w-6 text-emerald-500" />
                      ) : step.status === "active" ? (
                        <Circle className="h-6 w-6 fill-graphite-accent-orange text-graphite-accent-orange" />
                      ) : (
                        <Circle className="h-6 w-6 text-graphite-text-tertiary" />
                      )}
                    </div>
                    <span
                      className={`mt-2 text-xs font-medium ${
                        step.status === "completed"
                          ? "text-emerald-400"
                          : step.status === "active"
                            ? "text-graphite-accent-orange"
                            : "text-graphite-text-tertiary"
                      }`}
                    >
                      {step.name}
                    </span>
                  </div>

                  {/* Connector line */}
                  {index < steps.length - 1 && (
                    <div
                      className={`mx-2 h-0.5 w-16 ${
                        step.status === "completed" 
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-400" 
                          : "bg-graphite-border-primary"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Code review preview */}
          <div className="mt-16 overflow-hidden rounded-2xl border border-graphite-border-primary bg-graphite-bg-secondary shadow-2xl shadow-black/50">
            <div className="bg-gradient-to-r from-graphite-bg-tertiary to-graphite-bg-secondary p-6 border-b border-graphite-border-primary">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="ml-4 text-sm font-medium text-graphite-text-secondary">payment.service.ts</span>
                <span className="ml-auto rounded-md bg-graphite-accent-blue/20 border border-graphite-accent-blue/30 px-3 py-1 text-xs font-semibold text-graphite-accent-blue">
                  PR #482
                </span>
              </div>
            </div>

            <div className="grid md:grid-cols-2">
              {/* Code section */}
              <div className="border-r border-graphite-border-primary bg-graphite-bg-primary p-6 font-mono text-sm">
                <div className="mb-2 flex gap-2 text-graphite-text-tertiary">
                  <span className="w-4 text-right">1</span>
                  <span className="text-graphite-text-primary">
                    <span className="text-purple-400">async function</span> processPayment(userId:
                    <span className="text-graphite-accent-blue">string</span>) &#123;
                  </span>
                </div>
                <div className="mb-2 flex gap-2 text-graphite-text-tertiary">
                  <span className="w-4 text-right">2</span>
                  <span className="ml-4 text-graphite-text-primary">
                    const user= <span className="text-graphite-accent-blue">await</span> db.
                    <span className="text-purple-400">findUser</span>(userId)
                  </span>
                </div>
                <div className="mb-2 flex gap-2 text-graphite-text-tertiary">
                  <span className="w-4 text-right">3</span>
                  <span className="ml-4 text-graphite-text-tertiary">{/* TODO: validate amount */}</span>
                </div>
                <div className="mb-2 flex gap-2 text-graphite-text-tertiary">
                  <span className="w-4 text-right">4</span>
                  <span className="ml-4 text-graphite-text-primary">
                    const result= <span className="text-graphite-accent-blue">await</span> stripe.
                    <span className="text-purple-400">charge</span>(&#123;
                  </span>
                </div>
                <div className="mb-2 flex gap-2 text-graphite-text-tertiary">
                  <span className="w-4 text-right">5</span>
                  <span className="ml-8 text-graphite-text-primary">amount: amount,</span>
                </div>
                <div className="mb-2 flex gap-2 text-graphite-text-tertiary">
                  <span className="w-4 text-right">6</span>
                  <span className="ml-8 text-graphite-text-primary">currency: &quot;usd&quot;,</span>
                </div>
                <div className="mb-2 flex gap-2 text-graphite-text-tertiary">
                  <span className="w-4 text-right">7</span>
                  <span className="ml-4 text-graphite-text-primary">&#125;)</span>
                </div>
                <div className="flex gap-2 text-graphite-text-tertiary">
                  <span className="w-4 text-right">8</span>
                  <span className="ml-4 text-graphite-text-primary">
                    <span className="text-purple-400">return</span> result
                  </span>
                </div>
              </div>

              {/* Issues section */}
              <div className="bg-graphite-bg-secondary p-6">
                <div className="mb-4 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-graphite-accent-orange" />
                  <h4 className="font-semibold text-white">Review Complete</h4>
                </div>
                <p className="mb-4 text-sm text-graphite-text-secondary">5 issues found · 98s</p>

                <div className="space-y-3">
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 hover:border-red-500/50 transition-colors">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded bg-red-500 px-2 py-0.5 text-xs font-bold text-white">SQL</span>
                      <span className="text-xs font-semibold text-red-400">Missing input validation</span>
                    </div>
                    <p className="text-xs text-red-300/80">amount parameter needs validation</p>
                  </div>

                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 hover:border-amber-500/50 transition-colors">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">Missing</span>
                      <span className="text-xs font-semibold text-amber-400">Hard-coded currency string</span>
                    </div>
                    <p className="text-xs text-amber-300/80">Consider using an enum constant</p>
                  </div>

                  <div className="rounded-lg border border-graphite-accent-blue/30 bg-graphite-accent-blue/10 p-3 hover:border-graphite-accent-blue/50 transition-colors">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded bg-graphite-accent-blue px-2 py-0.5 text-xs font-bold text-white">i</span>
                      <span className="text-xs font-semibold text-graphite-accent-blue">Prompt for AI agents</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
