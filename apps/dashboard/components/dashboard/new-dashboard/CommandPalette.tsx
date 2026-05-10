"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Play,
  GitPullRequest,
  Settings,
  BarChart3,
  FileCode,
  RefreshCw,
  ArrowRight,
  HelpCircle,
  LogOut,
} from "lucide-react";

interface Command {
  id: string;
  icon: React.ElementType;
  label: string;
  desc: string;
  category: "Actions" | "Repositories" | "Navigation";
}

const commands: Command[] = [
  {
    id: "new-analysis",
    icon: Play,
    label: "Nouvelle analyse",
    desc: "Lancer une nouvelle analyse de code",
    category: "Actions",
  },
  {
    id: "import-project",
    icon: FileCode,
    label: "Importer un projet",
    desc: "Importer un dossier local pour analyse",
    category: "Actions",
  },
  {
    id: "refresh",
    icon: RefreshCw,
    label: "Rafraîchir les données",
    desc: "Actualiser le tableau de bord",
    category: "Actions",
  },
  {
    id: "repo-skillstream",
    icon: GitPullRequest,
    label: "skillstream-github-stage",
    desc: "Voir les analyses du repository",
    category: "Repositories",
  },
  {
    id: "repo-transport",
    icon: GitPullRequest,
    label: "TransportManager",
    desc: "Voir les analyses du repository",
    category: "Repositories",
  },
  {
    id: "dashboard",
    icon: BarChart3,
    label: "Tableau de bord",
    desc: "Retourner à l'accueil",
    category: "Navigation",
  },
  {
    id: "settings",
    icon: Settings,
    label: "Paramètres",
    desc: "Configurer les préférences",
    category: "Navigation",
  },
  {
    id: "help",
    icon: HelpCircle,
    label: "Aide & Documentation",
    desc: "Consulter la documentation",
    category: "Navigation",
  },
  {
    id: "logout",
    icon: LogOut,
    label: "Déconnexion",
    desc: "Se déconnecter de l'application",
    category: "Navigation",
  },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onCommand?: (commandId: string) => void;
}

export function CommandPalette({ isOpen, onClose, onCommand }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.desc.toLowerCase().includes(query.toLowerCase())
  );

  const groupedCommands = filteredCommands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) {
        acc[cmd.category] = [];
      }
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<string, Command[]>
  );

  const flatResults = Object.values(groupedCommands).flat();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % flatResults.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length);
          break;
        case "Enter":
          e.preventDefault();
          if (flatResults[selectedIndex]) {
            onCommand?.(flatResults[selectedIndex].id);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isOpen, flatResults, selectedIndex, onCommand, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  let globalIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] sm:w-[480px] md:w-[560px] max-w-[560px] bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-800">
              <Search className="h-4 w-4 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher..."
                autoFocus
                className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
              />
              <kbd className="px-2 py-0.5 text-[10px] font-medium text-zinc-500 bg-zinc-800 rounded">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[320px] overflow-y-auto p-2">
              {Object.entries(groupedCommands).map(([category, cmds]) => (
                <div key={category} className="mb-2">
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                    {category}
                  </div>
                  {cmds.map((cmd, idx) => {
                    const currentGlobalIndex = globalIndex++;
                    const isSelected = currentGlobalIndex === selectedIndex;
                    const Icon = cmd.icon;

                    return (
                      <motion.button
                        key={cmd.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        onClick={() => {
                          onCommand?.(cmd.id);
                          onClose();
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          isSelected
                            ? "bg-violet-500/10"
                            : "hover:bg-zinc-800/50"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            isSelected ? "bg-violet-500/20" : "bg-zinc-800"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 ${
                              isSelected ? "text-violet-400" : "text-zinc-400"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-sm font-medium ${
                              isSelected ? "text-white" : "text-zinc-300"
                            }`}
                          >
                            {cmd.label}
                          </div>
                          <div className="text-xs text-zinc-500 truncate">
                            {cmd.desc}
                          </div>
                        </div>
                        {isSelected && (
                          <motion.div
                            initial={{ x: -4, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                          >
                            <ArrowRight className="h-4 w-4 text-violet-400" />
                          </motion.div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-zinc-800 text-[10px] text-zinc-600">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↓</kbd>
                naviguer
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↵</kbd>
                sélectionner
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">esc</kbd>
                fermer
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
