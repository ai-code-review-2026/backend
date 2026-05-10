"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Bell,
  Plus,
  TrendingUp,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  GitPullRequest,
  Clock,
  ChevronDown,
  Sparkles,
  FileCode,
  Plus as PlusIcon,
  Minus,
  Copy,
  ExternalLink,
  RotateCcw,
  GitBranch,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { AnimatedCounter } from "./AnimatedCounter";
import { LiveActivityFeed } from "./LiveActivityFeed";
import { CommandPalette } from "./CommandPalette";
import {
  fetchDashboardStatistics,
  createDashboardStatisticsPoller,
  type PRData,
  type WeeklyActivityData,
  type SeverityDistribution,
  type DashboardMetrics,
} from "@/lib/dashboard-statistics";
import { extractApiErrorMessage } from "@/lib/display";

// ============================================================================
// Sub-components
// ============================================================================

function TypewriterText({
  text,
  delay = 0,
  speed = 15,
}: {
  text: string;
  delay?: number;
  speed?: number;
}) {
  const [displayedText, setDisplayedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      let currentIndex = 0;
      const interval = setInterval(() => {
        if (currentIndex < text.length) {
          setDisplayedText(text.slice(0, currentIndex + 1));
          currentIndex++;
        } else {
          clearInterval(interval);
          setTimeout(() => setShowCursor(false), 500);
        }
      }, speed);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [text, delay, speed]);

  return (
    <span>
      {displayedText}
      {showCursor && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="text-violet-400"
        >
          |
        </motion.span>
      )}
    </span>
  );
}

function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getColor = () => {
    if (score >= 80) return "#22c55e";
    if (score >= 50) return "#eab308";
    if (score > 0) return "#ef4444";
    return "#3f3f46";
  };

  const color = getColor();

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth={4}
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, delay: 0.3, ease: "easeOut" }}
          style={{
            filter: `drop-shadow(0 0 6px ${color}50)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="text-sm font-bold"
          style={{ color: score > 0 ? color : "#71717a" }}
        >
          {score > 0 ? score : "—"}
        </span>
      </div>
    </div>
  );
}

function PRRow({
  pr,
  index,
  expandedId,
  onToggle,
}: {
  pr: PRData;
  index: number;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  const isExpanded = expandedId === pr.id;
  const [showInsights, setShowInsights] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      const timeout = setTimeout(() => setShowInsights(true), 300);
      return () => clearTimeout(timeout);
    } else {
      setShowInsights(false);
    }
  }, [isExpanded]);

  const getStatusColor = () => {
    switch (pr.status) {
      case "completed":
        return "bg-emerald-400";
      case "running":
        return "bg-blue-400 animate-pulse";
      case "failed":
        return "bg-red-400";
      default:
        return "bg-zinc-400";
    }
  };

  const getStatusBadgeStyle = () => {
    switch (pr.status) {
      case "completed":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "running":
        return "bg-blue-500/10 text-teal-400 border-blue-500/20";
      case "failed":
        return "bg-red-500/10 text-destructive border-red-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
  };

  const getAvatarColor = () => {
    switch (pr.status) {
      case "completed":
        return "from-emerald-500 to-emerald-600";
      case "running":
        return "from-blue-500 to-blue-600";
      case "failed":
        return "from-red-500 to-red-600";
      default:
        return "from-zinc-500 to-zinc-600";
    }
  };

  const additionRatio =
    pr.additions + pr.deletions > 0
      ? (pr.additions / (pr.additions + pr.deletions)) * 100
      : 50;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      {/* Row Header */}
      <motion.div
        onClick={() => onToggle(pr.id)}
        whileHover={{ backgroundColor: "rgba(39, 39, 42, 0.3)" }}
        className="grid grid-cols-[1fr_90px_70px_70px_80px_48px_32px] items-center gap-4 px-4 py-3 cursor-pointer rounded-lg"
      >
        {/* Repository & Branch */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          <div
            className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor()} flex items-center justify-center text-[10px] font-semibold text-white`}
          >
            {pr.authorInitials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-white text-sm">{pr.repo}</span>
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/10 text-violet-300 rounded">
                {pr.prNumber}
              </span>
              <span
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${getStatusBadgeStyle()}`}
              >
                {pr.status === "completed"
                  ? "Complété"
                  : pr.status === "running"
                    ? "En cours"
                    : "Échoué"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
              <GitBranch className="h-3 w-3" />
              <span className="truncate">{pr.branch}</span>
              <span className="text-zinc-600">·</span>
              <span className="font-mono">{pr.commit}</span>
            </div>
          </div>
        </div>

        {/* Author */}
        <div className="text-sm text-zinc-400 truncate">{pr.author}</div>

        {/* Errors */}
        <div className="flex items-center justify-center">
          {pr.errors > 0 ? (
            <motion.span
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-destructive text-xs font-medium"
            >
              <ShieldAlert className="h-3 w-3" />
              {pr.errors}
            </motion.span>
          ) : (
            <span className="text-zinc-600">—</span>
          )}
        </div>

        {/* Warnings */}
        <div className="flex items-center justify-center">
          {pr.warnings > 0 ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
              <AlertTriangle className="h-3 w-3" />
              {pr.warnings}
            </span>
          ) : (
            <span className="text-zinc-600">—</span>
          )}
        </div>

        {/* Duration */}
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <Clock className="h-3 w-3" />
          {pr.duration}
        </div>

        {/* Score */}
        <ScoreRing score={pr.score} />

        {/* Chevron */}
        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }}>
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        </motion.div>
      </motion.div>

      {/* Expanded Panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-12 gap-4 px-4 pb-4">
              {/* AI Analysis Panel - Col 7 */}
              <div className="col-span-7">
                <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/40 p-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-violet-400" />
                      </div>
                      <span className="text-sm font-semibold text-white">
                        Analyse IA
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                      />
                      GPT-4
                    </div>
                  </div>

                  {/* AI Summary */}
                  <p className="text-sm text-zinc-300 mb-4">{pr.aiSummary}</p>

                  {/* AI Insights */}
                  <div className="space-y-2">
                    {showInsights &&
                      pr.aiInsights.map((insight, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.15 }}
                          className="text-sm text-zinc-400"
                        >
                          <TypewriterText text={insight} delay={i * 400} />
                        </motion.div>
                      ))}
                  </div>

                  {/* Tags */}
                  {pr.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-zinc-800/40">
                      {pr.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 text-[10px] font-medium text-zinc-400 border border-zinc-700 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Panel - Col 5 */}
              <div className="col-span-5 space-y-4">
                {/* Changes Card */}
                <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/40 p-4">
                  <div className="flex items-center gap-2 mb-4 text-xs text-zinc-500 uppercase tracking-wider">
                    <span>&lt;/&gt;</span>
                    Changements
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {/* Files */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="text-center"
                    >
                      <FileCode className="h-5 w-5 text-zinc-500 mx-auto mb-1" />
                      <div className="text-xl font-bold text-white">
                        {pr.files}
                      </div>
                      <div className="text-[10px] text-zinc-500 uppercase">
                        Fichiers
                      </div>
                    </motion.div>

                    {/* Additions */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="text-center"
                    >
                      <PlusIcon className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
                      <div className="text-xl font-bold text-emerald-400">
                        +{pr.additions}
                      </div>
                      <div className="text-[10px] text-zinc-500 uppercase">
                        Ajoutées
                      </div>
                    </motion.div>

                    {/* Deletions */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="text-center"
                    >
                      <Minus className="h-5 w-5 text-destructive mx-auto mb-1" />
                      <div className="text-xl font-bold text-destructive">
                        -{pr.deletions}
                      </div>
                      <div className="text-[10px] text-zinc-500 uppercase">
                        Supprimées
                      </div>
                    </motion.div>
                  </div>

                  {/* Ratio Bar */}
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${additionRatio}%` }}
                      transition={{ delay: 0.5, duration: 0.6 }}
                      className="bg-emerald-400 rounded-l-full"
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${100 - additionRatio}%` }}
                      transition={{ delay: 0.6, duration: 0.6 }}
                      className="bg-red-400 rounded-r-full"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 rounded-lg transition-colors">
                    <Copy className="h-3.5 w-3.5" />
                    Copier rapport
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 rounded-lg transition-colors">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Voir la PR
                  </button>
                  <button className="flex items-center justify-center px-3 py-2 text-zinc-400 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 rounded-lg transition-colors">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================================
// Custom Tooltip
// ============================================================================

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl">
        <p className="text-xs text-zinc-400 mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.stroke }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

// ============================================================================
// Main Component
// ============================================================================

// Default empty data for initial render
const defaultWeeklyActivity: WeeklyActivityData[] = [
  { day: "Lun", issues: 0, resolved: 0 },
  { day: "Mar", issues: 0, resolved: 0 },
  { day: "Mer", issues: 0, resolved: 0 },
  { day: "Jeu", issues: 0, resolved: 0 },
  { day: "Ven", issues: 0, resolved: 0 },
  { day: "Sam", issues: 0, resolved: 0 },
  { day: "Dim", issues: 0, resolved: 0 },
];

const defaultSeverityDistribution: SeverityDistribution[] = [
  { name: "Critique", value: 0, color: "#ef4444" },
  { name: "Élevé", value: 0, color: "#f97316" },
  { name: "Moyen", value: 0, color: "#eab308" },
  { name: "Faible", value: 0, color: "#22c55e" },
];

const defaultMetrics: DashboardMetrics = {
  averageScore: 0,
  criticalErrors: 0,
  warnings: 0,
  completedAnalyses: 0,
  totalAnalyses: 0,
  trends: {
    scoreTrend: "—",
    scoreTrendUp: true,
    errorsTrend: "—",
    errorsTrendUp: true,
    warningsTrend: "—",
    warningsTrendUp: true,
    completionTrend: "—",
    completionTrendUp: true,
  },
};

export function DashboardContent() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [expandedPrId, setExpandedPrId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  
  // Real data state
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prData, setPrData] = useState<PRData[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>(defaultMetrics);
  const [weeklyActivity, setWeeklyActivity] = useState<WeeklyActivityData[]>(defaultWeeklyActivity);
  const [severityDistribution, setSeverityDistribution] = useState<SeverityDistribution[]>(defaultSeverityDistribution);
  
  const pollerRef = useRef<ReturnType<typeof createDashboardStatisticsPoller> | null>(null);

  // Fetch initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const stats = await fetchDashboardStatistics({ force: true, size: 40 });
        
        setPrData(stats.prData);
        setDashboardMetrics(stats.metrics);
        setWeeklyActivity(stats.weeklyActivity.length > 0 ? stats.weeklyActivity : defaultWeeklyActivity);
        setSeverityDistribution(stats.severityDistribution.some(s => s.value > 0) ? stats.severityDistribution : defaultSeverityDistribution);
        
        if (stats.error) {
          setError(extractApiErrorMessage(stats, "Erreur lors du chargement des données"));
        }
      } catch (err) {
        console.error("[DashboardContent] Error loading data:", err);
        setError("Erreur lors du chargement des données");
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
    
    // Setup polling for real-time updates
    pollerRef.current = createDashboardStatisticsPoller((stats) => {
      setPrData(stats.prData);
      setDashboardMetrics(stats.metrics);
      setWeeklyActivity(stats.weeklyActivity.length > 0 ? stats.weeklyActivity : defaultWeeklyActivity);
      setSeverityDistribution(stats.severityDistribution.some(s => s.value > 0) ? stats.severityDistribution : defaultSeverityDistribution);
    }, { intervalMs: 15000 }); // Poll every 15 seconds
    
    pollerRef.current.start();
    
    return () => {
      pollerRef.current?.stop();
    };
  }, []);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const stats = await fetchDashboardStatistics({ force: true, size: 40 });
      setPrData(stats.prData);
      setDashboardMetrics(stats.metrics);
      setWeeklyActivity(stats.weeklyActivity.length > 0 ? stats.weeklyActivity : defaultWeeklyActivity);
      setSeverityDistribution(stats.severityDistribution.some(s => s.value > 0) ? stats.severityDistribution : defaultSeverityDistribution);
    } catch (err) {
      console.error("[DashboardContent] Error refreshing:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // ⌘K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCommand = useCallback((commandId: string) => {
    console.log("Command:", commandId);
    // Handle command actions here
  }, []);

  const filteredPRs = prData.filter((pr) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "completed") return pr.status === "completed";
    if (activeFilter === "running") return pr.status === "running";
    if (activeFilter === "failed") return pr.status === "failed";
    return true;
  });

  const metrics = [
    {
      icon: TrendingUp,
      label: "Score moyen",
      value: dashboardMetrics.averageScore,
      suffix: "/100",
      trend: dashboardMetrics.trends.scoreTrend,
      trendUp: dashboardMetrics.trends.scoreTrendUp,
      gradient: "from-violet-500/10 to-violet-500/5",
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-400",
      shadow: "shadow-violet-500/5",
    },
    {
      icon: ShieldAlert,
      label: "Erreurs critiques",
      value: dashboardMetrics.criticalErrors,
      suffix: "",
      trend: dashboardMetrics.trends.errorsTrend,
      trendUp: dashboardMetrics.trends.errorsTrendUp,
      gradient: "from-red-500/10 to-red-500/5",
      iconBg: "bg-red-500/10",
      iconColor: "text-destructive",
      shadow: "shadow-red-500/5",
    },
    {
      icon: AlertTriangle,
      label: "Warnings",
      value: dashboardMetrics.warnings,
      suffix: "",
      trend: dashboardMetrics.trends.warningsTrend,
      trendUp: dashboardMetrics.trends.warningsTrendUp,
      gradient: "from-amber-500/10 to-amber-500/5",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-400",
      shadow: "shadow-amber-500/5",
    },
    {
      icon: CheckCircle2,
      label: "Analyses OK",
      value: dashboardMetrics.completedAnalyses,
      suffix: `/${dashboardMetrics.totalAnalyses}`,
      trend: dashboardMetrics.trends.completionTrend,
      trendUp: dashboardMetrics.trends.completionTrendUp,
      gradient: "from-emerald-500/10 to-emerald-500/5",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
      shadow: "shadow-emerald-500/5",
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onCommand={handleCommand}
      />

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Top Bar */}
        <div className="sticky top-0 z-40 -mx-6 -mt-6 px-6 py-3 bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-800/60">
          <div className="flex items-center justify-between">
            {/* Search */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-3 w-80 h-8 px-3 bg-zinc-800/60 border border-zinc-700/40 rounded-lg text-left"
            >
              <Search className="h-4 w-4 text-zinc-500" />
              <span className="text-sm text-zinc-500">Rechercher...</span>
              <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 bg-zinc-700/50 rounded">
                ⌘K
              </kbd>
            </motion.button>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Refresh Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center justify-center p-2 rounded-lg hover:bg-zinc-800/50 transition-colors disabled:opacity-50"
                title="Rafraîchir les données"
              >
                <RefreshCw className={`h-4 w-4 text-zinc-400 ${isRefreshing ? "animate-spin" : ""}`} />
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-2 px-4 h-9 bg-gradient-to-r from-violet-500 to-blue-500 rounded-lg text-sm font-medium shadow-lg shadow-violet-500/20"
              >
                <Plus className="h-4 w-4" />
                Nouvelle analyse
              </motion.button>

              {/* Bell */}
              <button className="relative p-2 rounded-lg hover:bg-zinc-800/50 transition-colors">
                <Bell className="h-5 w-5 text-zinc-400" />
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"
                />
              </button>

              {/* Avatar */}
              <motion.div
                whileHover={{ scale: 1.1 }}
                className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-sm font-semibold cursor-pointer"
              >
                AG
              </motion.div>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-4 gap-4">
          {metrics.map((metric, i) => {
            const Icon = metric.icon;
            return (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
                whileHover={{ y: -2 }}
                className={`relative bg-gradient-to-br ${metric.gradient} border border-zinc-800/60 rounded-2xl p-5 shadow-lg ${metric.shadow}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <motion.div
                    whileHover={{ rotate: 12 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className={`w-10 h-10 rounded-xl ${metric.iconBg} flex items-center justify-center`}
                  >
                    <Icon className={`h-5 w-5 ${metric.iconColor}`} />
                  </motion.div>

                  <span
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      metric.trendUp
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-red-500/10 text-destructive"
                    }`}
                  >
                    {metric.trendUp ? "↗" : "↘"} {metric.trend}
                  </span>
                </div>

                <div className="text-3xl font-bold text-white">
                  <AnimatedCounter value={metric.value} suffix={metric.suffix} />
                </div>
                <div className="text-sm text-zinc-500 mt-1">{metric.label}</div>
              </motion.div>
            );
          })}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-12 gap-4">
          {/* Area Chart */}
          <div className="col-span-5 bg-zinc-950/50 border border-zinc-800/60 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Activité semaine
                </h3>
                <p className="text-xs text-zinc-500">
                  Issues détectés vs résolus
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                  <span className="text-zinc-400">Issues</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-zinc-400">Résolus</span>
                </div>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={weeklyActivity}>
                <defs>
                  <linearGradient id="issuesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e8713a" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#e8713a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="resolvedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#52525b", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#52525b", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="issues"
                  stroke="#e8713a"
                  fill="url(#issuesGradient)"
                  strokeWidth={2}
                  name="Issues"
                />
                <Area
                  type="monotone"
                  dataKey="resolved"
                  stroke="#22c55e"
                  fill="url(#resolvedGradient)"
                  strokeWidth={2}
                  name="Résolus"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="col-span-3 bg-zinc-950/50 border border-zinc-800/60 rounded-2xl p-5">
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-white">Sévérité</h3>
              <p className="text-xs text-zinc-500">Répartition des issues</p>
            </div>

            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={severityDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={55}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {severityDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              {severityDistribution.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-zinc-400">{item.name}</span>
                  <span
                    className="text-xs font-medium ml-auto"
                    style={{ color: item.color }}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="col-span-4">
            <LiveActivityFeed />
          </div>
        </div>

        {/* PR Table */}
        <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <GitPullRequest className="h-4 w-4 text-violet-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">Pull Requests</h3>
              <span className="px-2 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-400 rounded-full">
                {filteredPRs.length}{activeFilter !== "all" ? `/${prData.length}` : ""}
              </span>
              {isRefreshing && (
                <Loader2 className="h-3 w-3 text-violet-400 animate-spin ml-1" />
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-zinc-800/50 rounded-lg">
              {[
                { id: "all", label: "Tous" },
                { id: "completed", label: "✓ Complétés" },
                { id: "running", label: "◌ En cours" },
                { id: "failed", label: "✗ Échoués" },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`px-2.5 h-6 text-[11px] font-medium rounded transition-colors ${
                    activeFilter === filter.id
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-[1fr_90px_70px_70px_80px_48px_32px] items-center gap-4 px-4 py-2 border-b border-zinc-800/40">
            <span className="text-[10px] uppercase tracking-widest text-zinc-600">
              Repository / Branch
            </span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-600">
              Auteur
            </span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-600 text-center">
              Erreurs
            </span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-600 text-center">
              Warnings
            </span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-600">
              Durée
            </span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-600 text-center">
              Score
            </span>
            <span />
          </div>

          {/* PR Rows */}
          <div className="divide-y divide-zinc-800/40">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
                <span className="ml-3 text-sm text-zinc-400">Chargement des analyses...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12">
                <ShieldAlert className="h-8 w-8 text-destructive mb-2" />
                <span className="text-sm text-zinc-400">{error}</span>
                <button
                  onClick={handleRefresh}
                  className="mt-3 px-3 py-1.5 text-xs font-medium text-violet-400 bg-violet-500/10 rounded-lg hover:bg-violet-500/20 transition-colors"
                >
                  Réessayer
                </button>
              </div>
            ) : filteredPRs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <GitPullRequest className="h-8 w-8 text-zinc-600 mb-2" />
                <span className="text-sm text-zinc-400">
                  {activeFilter === "all" 
                    ? "Aucune analyse trouvée" 
                    : `Aucune analyse ${activeFilter === "completed" ? "complétée" : activeFilter === "running" ? "en cours" : "échouée"}`
                  }
                </span>
                <p className="text-xs text-zinc-500 mt-1">
                  Lancez une nouvelle analyse pour commencer
                </p>
              </div>
            ) : (
              filteredPRs.map((pr, index) => (
                <PRRow
                  key={pr.id}
                  pr={pr}
                  index={index}
                  expandedId={expandedPrId}
                  onToggle={(id) =>
                    setExpandedPrId((prev) => (prev === id ? null : id))
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
