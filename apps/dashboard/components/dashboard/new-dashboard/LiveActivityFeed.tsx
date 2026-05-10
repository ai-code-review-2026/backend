"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
  Bot,
  GitPullRequest,
  Zap,
  Loader2,
} from "lucide-react";
import {
  fetchActivityFeed,
  createActivityFeedPoller,
  type ActivityEvent,
  type ActivityFeedData,
} from "@/lib/notifications";
import { extractApiErrorMessage } from "@/lib/display";

// Map icon types to Lucide icons
const iconMap = {
  success: { icon: CheckCircle2, color: "text-emerald-400" },
  error: { icon: ShieldAlert, color: "text-destructive" },
  warning: { icon: AlertTriangle, color: "text-amber-400" },
  ai: { icon: Bot, color: "text-violet-400" },
  pr: { icon: GitPullRequest, color: "text-teal-400" },
  performance: { icon: Zap, color: "text-yellow-400" },
};

interface DisplayActivity {
  id: number;
  icon: React.ElementType;
  iconColor: string;
  message: string;
  time: string;
}

function transformEventsToDisplay(events: ActivityEvent[]): DisplayActivity[] {
  return events.map((event) => {
    const iconInfo = iconMap[event.iconType] || iconMap.success;
    return {
      id: event.id,
      icon: iconInfo.icon,
      iconColor: iconInfo.color,
      message: event.message,
      time: event.time,
    };
  });
}

export function LiveActivityFeed() {
  const [activities, setActivities] = useState<DisplayActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const data = await fetchActivityFeed({ force: true, limit: 5 });
      if (data.error) {
        setError(extractApiErrorMessage(data, "Erreur de chargement"));
      } else {
        setActivities(transformEventsToDisplay(data.events));
        setError(null);
      }
    } catch (err) {
      console.error("Failed to load activity feed:", err);
      setError("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling for real-time updates
  useEffect(() => {
    const poller = createActivityFeedPoller(
      (data: ActivityFeedData) => {
        if (!data.error && data.events.length > 0) {
          setActivities(transformEventsToDisplay(data.events));
          setError(null);
        }
      },
      { intervalMs: 10_000 } // Poll every 10 seconds
    );

    poller.start();
    return () => poller.stop();
  }, []);

  return (
    <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-2xl p-5 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping absolute" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 relative" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Activite en direct
        </span>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          <span className="ml-2 text-sm text-zinc-500">Chargement...</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="text-center py-8">
          <ShieldAlert className="h-6 w-6 mx-auto mb-2 text-destructive" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && activities.length === 0 && (
        <div className="text-center py-8">
          <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-zinc-600" />
          <p className="text-xs text-zinc-500">Aucune activite recente</p>
        </div>
      )}

      {/* Activity Items */}
      {!loading && !error && activities.length > 0 && (
        <div className="space-y-1">
          <AnimatePresence mode="popLayout">
            {activities.map((activity) => {
              const Icon = activity.icon;
              return (
                <motion.div
                  key={activity.id}
                  layout
                  initial={{ opacity: 0, x: -20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={{
                    type: "spring",
                    bounce: 0.15,
                    duration: 0.5,
                  }}
                  className="flex items-start gap-3 py-2"
                >
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${activity.iconColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white leading-tight truncate">
                      {activity.message}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {activity.time}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
