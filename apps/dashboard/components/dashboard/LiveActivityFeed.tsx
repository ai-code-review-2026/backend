"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, ShieldAlert, Bot, GitPullRequest, Zap, Clock, RefreshCw } from "lucide-react";

interface ActivityItem {
  id: string;
  icon: typeof CheckCircle2;
  iconColor: string;
  message: string;
  time: string;
}

type NotificationType =
  | "vulnerability_detected"
  | "analysis_failed"
  | "blocker_found"
  | "warning_found"
  | "analysis_complete"
  | "review_assigned"
  | "review_completed"
  | "ai_review_complete"
  | "auto_approved"
  | "pr_detected";

interface RawNotification {
  id: string;
  type: NotificationType;
  severity?: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

function iconForType(type: NotificationType): { icon: typeof CheckCircle2; color: string } {
  switch (type) {
    case "vulnerability_detected": return { icon: ShieldAlert, color: "text-destructive" };
    case "analysis_failed":        return { icon: AlertTriangle, color: "text-destructive" };
    case "blocker_found":          return { icon: ShieldAlert, color: "text-orange-400" };
    case "warning_found":          return { icon: AlertTriangle, color: "text-amber-400" };
    case "analysis_complete":      return { icon: CheckCircle2,  color: "text-emerald-400" };
    case "review_assigned":        return { icon: GitPullRequest, color: "text-teal-400" };
    case "review_completed":       return { icon: CheckCircle2,  color: "text-emerald-400" };
    case "ai_review_complete":     return { icon: Bot,           color: "text-violet-400" };
    case "auto_approved":          return { icon: Zap,           color: "text-yellow-400" };
    case "pr_detected":            return { icon: GitPullRequest, color: "text-teal-400" };
    default:                       return { icon: Clock,         color: "text-zinc-400" };
  }
}

function formatTime(timestamp: string): string {
  if (!timestamp) return "récemment";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "récemment";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH   = Math.floor(diffMs / 3_600_000);
  const diffD   = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1)  return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin}m`;
  if (diffH   < 24) return `il y a ${diffH}h`;
  return `il y a ${diffD}j`;
}

function toActivityItem(n: RawNotification): ActivityItem {
  const { icon, color } = iconForType(n.type);
  return {
    id: n.id,
    icon,
    iconColor: color,
    message: n.message || n.title,
    time: formatTime(n.timestamp),
  };
}

export function LiveActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=6&unread_only=false", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (res.ok) {
        const data = await res.json();
        const items: RawNotification[] =
          data.notifications ?? data.items ?? data.data ?? (Array.isArray(data) ? data : []);
        if (items.length > 0) {
          setActivities(items.slice(0, 6).map(toActivityItem));
          setError(null);
          setLoading(false);
          return;
        }
      }

      // Fallback: derive from latest analyses
      const aRes = await fetch("/api/dashboard/analyses?size=6", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (aRes.ok) {
        const aData = await aRes.json();
        const analyses: Array<{
          id: string;
          status: string;
          repo: string;
          prLabel?: string;
          blockerCount?: number;
          warnCount?: number;
          createdAt?: string;
        }> = aData.analyses ?? aData.items ?? aData.data ?? (Array.isArray(aData) ? aData : []);

        const derived = analyses.map((a) => {
          const hasBlocker = (a.blockerCount ?? 0) > 0;
          const hasWarn    = (a.warnCount ?? 0) > 0;
          const repo = (a.repo ?? "").split("/").pop() ?? a.repo;
          let type: NotificationType = "analysis_complete";
          let msg = `Analyse terminée sur ${repo}`;
          if (a.status === "FAILED") { type = "analysis_failed"; msg = `Analyse échouée sur ${repo}`; }
          else if (hasBlocker) { type = "blocker_found"; msg = `${a.blockerCount} bloqueur(s) détecté(s) sur ${repo}`; }
          else if (hasWarn)    { type = "warning_found"; msg = `${a.warnCount} avertissement(s) sur ${repo}`; }
          return {
            id: a.id ?? String(Math.random()),
            type,
            title: msg,
            message: msg,
            timestamp: a.createdAt ?? new Date().toISOString(),
            read: false,
          } as RawNotification;
        });

        setActivities(derived.map(toActivityItem));
        setError(null);
      } else {
        setError("Impossible de charger l'activité");
      }
    } catch (err) {
      console.error("[LiveActivityFeed] fetch error:", err);
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();
    // Poll every 30 seconds for real-time feel without websocket dependency
    const interval = setInterval(fetchActivity, 30_000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
          </span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Activité en direct</span>
        </div>
        {!loading && (
          <button
            onClick={fetchActivity}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Rafraîchir"
          >
            <RefreshCw className="size-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-2.5 py-2 px-2">
              <div className="size-3.5 mt-0.5 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-muted rounded animate-pulse w-4/5" />
                <div className="h-2.5 bg-muted rounded animate-pulse w-1/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <p className="text-xs text-muted-foreground px-2 py-3 text-center">{error}</p>
      )}

      {!loading && !error && activities.length === 0 && (
        <p className="text-xs text-muted-foreground px-2 py-3 text-center">Aucune activité récente</p>
      )}

      <AnimatePresence mode="popLayout">
        {activities.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, x: -20, height: 0 }}
            animate={{ opacity: 1, x: 0, height: "auto" }}
            exit={{ opacity: 0, x: 20, height: 0 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
            className="flex items-start gap-2.5 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <item.icon className={`size-3.5 mt-0.5 shrink-0 ${item.iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground/80 leading-relaxed truncate">{item.message}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.time}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
