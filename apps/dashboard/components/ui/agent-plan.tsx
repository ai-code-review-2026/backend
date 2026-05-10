"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CircleX,
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

// Type definitions
interface Subtask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  tools?: string[];
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  level: number;
  dependencies: string[];
  subtasks: Subtask[];
}

const initialTasks: Task[] = [
  {
    id: "1",
    title: "Parsing du diff & scan de secrets",
    description: "Analyse du diff PR et détection de secrets exposés",
    status: "completed",
    priority: "high",
    level: 0,
    dependencies: [],
    subtasks: [
      {
        id: "1.1",
        title: "Extraction des fichiers modifiés",
        description: "Identifie les fichiers ajoutés, modifiés et supprimés",
        status: "completed",
        priority: "high",
        tools: ["diff-parser"],
      },
      {
        id: "1.2",
        title: "Scan des secrets (Regex + Entropy)",
        description: "Détection de clés API, tokens et mots de passe",
        status: "completed",
        priority: "high",
        tools: ["secret-scanner", "entropy-analyzer"],
      },
    ],
  },
  {
    id: "2",
    title: "Analyse statique",
    description: "Ruff, Semgrep et CleanCode sur le code modifié",
    status: "in-progress",
    priority: "high",
    level: 0,
    dependencies: [],
    subtasks: [
      {
        id: "2.1",
        title: "Linting Ruff",
        description: "Vérification du style et des erreurs Python",
        status: "completed",
        priority: "medium",
        tools: ["ruff"],
      },
      {
        id: "2.2",
        title: "Analyse Semgrep",
        description: "Détection de patterns de sécurité dangereux",
        status: "in-progress",
        priority: "high",
        tools: ["semgrep"],
      },
      {
        id: "2.3",
        title: "Métriques CleanCode",
        description: "Complexité cyclomatique, duplication, couplage",
        status: "pending",
        priority: "medium",
        tools: ["cleancode-analyzer"],
      },
    ],
  },
  {
    id: "3",
    title: "Classification des changements",
    description: "Bugfix / Feature / Refactor / Config",
    status: "pending",
    priority: "medium",
    level: 1,
    dependencies: ["1", "2"],
    subtasks: [
      {
        id: "3.1",
        title: "Analyse sémantique du diff",
        description: "Comprend le contexte métier des modifications",
        status: "pending",
        priority: "medium",
        tools: ["llm", "diff-classifier"],
      },
    ],
  },
  {
    id: "4",
    title: "Review LLM intelligente",
    description: "Génération des commentaires de review via Ollama/OpenAI",
    status: "pending",
    priority: "high",
    level: 1,
    dependencies: ["2", "3"],
    subtasks: [
      {
        id: "4.1",
        title: "Construction du contexte RAG",
        description: "Récupération des chunks de code pertinents depuis Qdrant",
        status: "pending",
        priority: "high",
        tools: ["qdrant", "rag-agent"],
      },
      {
        id: "4.2",
        title: "Génération des findings",
        description: "Review ligne par ligne avec justifications",
        status: "pending",
        priority: "high",
        tools: ["llm", "review-engine"],
      },
    ],
  },
  {
    id: "5",
    title: "Persistance & notification",
    description: "Sauvegarde des résultats et notification des reviewers",
    status: "pending",
    priority: "medium",
    level: 2,
    dependencies: ["4"],
    subtasks: [
      {
        id: "5.1",
        title: "Enregistrement PostgreSQL",
        description: "Persist les findings, le score qualité et les métriques",
        status: "pending",
        priority: "medium",
        tools: ["postgresql"],
      },
      {
        id: "5.2",
        title: "Mise à jour WebSocket",
        description: "Notification temps réel des clients connectés",
        status: "pending",
        priority: "low",
        tools: ["websocket", "redis"],
      },
    ],
  },
];

interface AgentPlanProps {
  tasks?: Task[];
}

export default function AgentPlan({ tasks: propTasks }: AgentPlanProps) {
  const [tasks, setTasks] = useState<Task[]>(propTasks ?? initialTasks);
  const [expandedTasks, setExpandedTasks] = useState<string[]>(["1", "2"]);
  const [expandedSubtasks, setExpandedSubtasks] = useState<{
    [key: string]: boolean;
  }>({});

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId]
    );
  };

  const toggleSubtaskExpansion = (taskId: string, subtaskId: string) => {
    const key = `${taskId}-${subtaskId}`;
    setExpandedSubtasks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSubtaskStatus = (taskId: string, subtaskId: string) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;
        const updatedSubtasks = task.subtasks.map((subtask) => {
          if (subtask.id !== subtaskId) return subtask;
          return {
            ...subtask,
            status: subtask.status === "completed" ? "pending" : "completed",
          };
        });
        const allDone = updatedSubtasks.every((s) => s.status === "completed");
        return {
          ...task,
          subtasks: updatedSubtasks,
          status: allDone ? "completed" : task.status,
        };
      })
    );
  };

  const taskVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : -5 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: prefersReducedMotion ? "tween" : "spring",
        stiffness: 500,
        damping: 30,
      },
    },
    exit: { opacity: 0, y: prefersReducedMotion ? 0 : -5, transition: { duration: 0.15 } },
  };

  const subtaskListVariants = {
    hidden: { opacity: 0, height: 0, overflow: "hidden" },
    visible: {
      height: "auto",
      opacity: 1,
      overflow: "visible",
      transition: {
        duration: 0.25,
        staggerChildren: prefersReducedMotion ? 0 : 0.05,
        when: "beforeChildren",
        ease: [0.2, 0.65, 0.3, 0.9],
      },
    },
    exit: {
      height: 0,
      opacity: 0,
      overflow: "hidden",
      transition: { duration: 0.2, ease: [0.2, 0.65, 0.3, 0.9] },
    },
  };

  const subtaskVariants = {
    hidden: { opacity: 0, x: prefersReducedMotion ? 0 : -10 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        type: prefersReducedMotion ? "tween" : "spring",
        stiffness: 500,
        damping: 25,
      },
    },
    exit: { opacity: 0, x: prefersReducedMotion ? 0 : -10, transition: { duration: 0.15 } },
  };

  const subtaskDetailsVariants = {
    hidden: { opacity: 0, height: 0, overflow: "hidden" },
    visible: {
      opacity: 1,
      height: "auto",
      overflow: "visible",
      transition: { duration: 0.25, ease: [0.2, 0.65, 0.3, 0.9] },
    },
  };

  const statusBadgeVariants = {
    initial: { scale: 1 },
    animate: {
      scale: prefersReducedMotion ? 1 : [1, 1.08, 1],
      transition: { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] },
    },
  };

  const StatusIcon = ({ status, size = "md" }: { status: string; size?: "sm" | "md" }) => {
    const cls = size === "sm" ? "h-3.5 w-3.5" : "h-4.5 w-4.5";
    if (status === "completed") return <CheckCircle2 className={`${cls} text-emerald-500`} />;
    if (status === "in-progress") return <CircleDotDashed className={`${cls} text-violet-500`} />;
    if (status === "need-help") return <CircleAlert className={`${cls} text-amber-500`} />;
    if (status === "failed") return <CircleX className={`${cls} text-red-500`} />;
    return <Circle className={`${cls} text-muted-foreground/50`} />;
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const variants: Record<string, string> = {
      completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      "in-progress": "bg-violet-500/10 text-violet-400 border-violet-500/20",
      "need-help": "bg-amber-500/10 text-amber-400 border-amber-500/20",
      failed: "bg-red-500/10 text-red-400 border-red-500/20",
      pending: "bg-zinc-800 text-zinc-400 border-zinc-700",
    };
    return (
      <motion.span
        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${variants[status] ?? variants.pending}`}
        variants={statusBadgeVariants}
        initial="initial"
        animate="animate"
        key={status}
      >
        {status}
      </motion.span>
    );
  };

  return (
    <div className="h-full overflow-auto p-3">
      <motion.div
        className="rounded-xl border border-zinc-800 bg-zinc-900/80 shadow-xl backdrop-blur-sm overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.2, 0.65, 0.3, 0.9] } }}
      >
        <div className="border-b border-zinc-800 px-4 py-3 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            Pipeline d&apos;analyse en cours
          </span>
        </div>

        <LayoutGroup>
          <div className="p-3 overflow-hidden">
            <ul className="space-y-1 overflow-hidden">
              {tasks.map((task, index) => {
                const isExpanded = expandedTasks.includes(task.id);
                const isCompleted = task.status === "completed";

                return (
                  <motion.li
                    key={task.id}
                    className={index !== 0 ? "mt-1 pt-2" : ""}
                    initial="hidden"
                    animate="visible"
                    variants={taskVariants}
                  >
                    <motion.div
                      className="group flex items-center px-3 py-1.5 rounded-lg cursor-pointer"
                      whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                      onClick={() => toggleTaskExpansion(task.id)}
                    >
                      <div className="mr-2 flex-shrink-0">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={task.status}
                            initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
                            transition={{ duration: 0.2 }}
                          >
                            <StatusIcon status={task.status} size="md" />
                          </motion.div>
                        </AnimatePresence>
                      </div>

                      <div className="flex min-w-0 flex-grow items-center justify-between">
                        <div className="mr-2 flex-1 truncate">
                          <span
                            className={`text-sm font-medium ${
                              isCompleted ? "text-zinc-500 line-through" : "text-zinc-200"
                            }`}
                          >
                            {task.title}
                          </span>
                        </div>

                        <div className="flex flex-shrink-0 items-center gap-2">
                          {task.dependencies.length > 0 && (
                            <div className="flex gap-1">
                              {task.dependencies.map((dep, idx) => (
                                <motion.span
                                  key={idx}
                                  className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400"
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                                >
                                  #{dep}
                                </motion.span>
                              ))}
                            </div>
                          )}
                          <StatusBadge status={task.status} />
                        </div>
                      </div>
                    </motion.div>

                    <AnimatePresence mode="wait">
                      {isExpanded && task.subtasks.length > 0 && (
                        <motion.div
                          className="relative overflow-hidden"
                          variants={subtaskListVariants}
                          initial="hidden"
                          animate="visible"
                          exit="hidden"
                          layout
                        >
                          <div className="absolute top-0 bottom-0 left-[20px] border-l border-dashed border-zinc-700/50" />
                          <ul className="mt-1 mr-2 mb-1.5 ml-3 space-y-0.5">
                            {task.subtasks.map((subtask) => {
                              const subtaskKey = `${task.id}-${subtask.id}`;
                              const isSubtaskExpanded = expandedSubtasks[subtaskKey];

                              return (
                                <motion.li
                                  key={subtask.id}
                                  className="group flex flex-col py-0.5 pl-6"
                                  onClick={() => toggleSubtaskExpansion(task.id, subtask.id)}
                                  variants={subtaskVariants}
                                  initial="hidden"
                                  animate="visible"
                                  exit="exit"
                                  layout
                                >
                                  <motion.div
                                    className="flex flex-1 items-center rounded-lg p-1.5"
                                    whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                                    layout
                                  >
                                    <motion.div
                                      className="mr-2 flex-shrink-0 cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSubtaskStatus(task.id, subtask.id);
                                      }}
                                      whileTap={{ scale: 0.9 }}
                                      whileHover={{ scale: 1.1 }}
                                      layout
                                    >
                                      <AnimatePresence mode="wait">
                                        <motion.div
                                          key={subtask.status}
                                          initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                          exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
                                          transition={{ duration: 0.2 }}
                                        >
                                          <StatusIcon status={subtask.status} size="sm" />
                                        </motion.div>
                                      </AnimatePresence>
                                    </motion.div>

                                    <span
                                      className={`cursor-pointer text-sm ${
                                        subtask.status === "completed"
                                          ? "text-zinc-600 line-through"
                                          : "text-zinc-300"
                                      }`}
                                    >
                                      {subtask.title}
                                    </span>
                                  </motion.div>

                                  <AnimatePresence mode="wait">
                                    {isSubtaskExpanded && (
                                      <motion.div
                                        className="text-zinc-500 border-zinc-700/50 mt-1 ml-1.5 border-l border-dashed pl-5 text-xs overflow-hidden"
                                        variants={subtaskDetailsVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="hidden"
                                        layout
                                      >
                                        <p className="py-1 text-zinc-400">{subtask.description}</p>
                                        {subtask.tools && subtask.tools.length > 0 && (
                                          <div className="mt-0.5 mb-1 flex flex-wrap items-center gap-1.5">
                                            <span className="text-zinc-500 font-medium">Tools:</span>
                                            <div className="flex flex-wrap gap-1">
                                              {subtask.tools.map((tool, idx) => (
                                                <motion.span
                                                  key={idx}
                                                  className="rounded bg-violet-500/10 border border-violet-500/20 text-violet-400 px-1.5 py-0.5 text-[10px] font-medium"
                                                  initial={{ opacity: 0, y: -5 }}
                                                  animate={{
                                                    opacity: 1,
                                                    y: 0,
                                                    transition: { duration: 0.2, delay: idx * 0.05 },
                                                  }}
                                                >
                                                  {tool}
                                                </motion.span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </motion.li>
                              );
                            })}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </LayoutGroup>
      </motion.div>
    </div>
  );
}
