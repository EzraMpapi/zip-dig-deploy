import React, { useMemo, useCallback, useState, useEffect } from "react";
import { format } from "date-fns";
import { Activity, CheckCircle, Clock, AlertTriangle, User, Building2, Package, DollarSign, FileText, MessageSquare, Users, RefreshCw } from "lucide-react";

/* ────────────────────────────────────────────────────────────────
   ActivityStream — real‑time activity feed with stable rendering

   - Memoized data transformations to prevent re‑computation
   - useCallback for all event handlers
   - React.memo for child components
   - Optimized for large activity lists
   ──────────────────────────────────────────────────────────────── */

// ─── Types ──────────────────────────────────────────────────────
const ACTIVITY_TYPES = {
  user: { icon: User, color: "text-blue-500", bg: "bg-blue-500/10" },
  company: { icon: Building2, color: "text-purple-500", bg: "bg-purple-500/10" },
  inventory: { icon: Package, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  finance: { icon: DollarSign, color: "text-amber-500", bg: "bg-amber-500/10" },
  document: { icon: FileText, color: "text-slate-500", bg: "bg-slate-500/10" },
  message: { icon: MessageSquare, color: "text-cyan-500", bg: "bg-cyan-500/10" },
  team: { icon: Users, color: "text-rose-500", bg: "bg-rose-500/10" },
  system: { icon: RefreshCw, color: "text-slate-400", bg: "bg-slate-400/10" },
};

// ─── Helpers ──────────────────────────────────────────────────
function formatTimestamp(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.round(diff / 3600_000)}h ago`;
  if (diff < 604800_000) return `${Math.round(diff / 86400_000)}d ago`;
  return format(date, "dd MMM, HH:mm");
}

function getActivityIcon(type) {
  return ACTIVITY_TYPES[type] || ACTIVITY_TYPES.system;
}

// ─── Child Components (memoized) ──────────────────────────────
const ActivityItem = React.memo(function ActivityItem({ activity }) {
  const { icon: Icon, color, bg } = getActivityIcon(activity.type);
  const time = formatTimestamp(activity.timestamp);

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100/50 last:border-0 dark:border-slate-800/50">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg}`}>
        <Icon size={14} className={color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">
          {activity.message}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-slate-400">{time}</span>
          {activity.user && (
            <span className="text-xs text-slate-400">· {activity.user}</span>
          )}
        </div>
      </div>
      {activity.status && (
        <StatusBadge status={activity.status} />
      )}
    </div>
  );
});

const StatusBadge = React.memo(function StatusBadge({ status }) {
  const variant = status === "completed" ? "success" : status === "pending" ? "warning" : "default";
  const styles = {
    success: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    default: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  };
  const icons = {
    success: <CheckCircle size={11} />,
    warning: <Clock size={11} />,
    default: <AlertTriangle size={11} />,
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[variant]}`}>
      {icons[variant]} {status}
    </span>
  );
});

// ─── Main Component ────────────────────────────────────────────
export function ActivityStream({ activities = [], currentUser, maxItems = 50, className = "" }) {
  const [showAll, setShowAll] = useState(false);

  // Memoize sorted and limited activities
  const processedActivities = useMemo(() => {
    if (!activities?.length) return [];

    // Sort by timestamp descending (newest first)
    const sorted = [...activities].sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });

    // Remove duplicates by id if present
    const seen = new Set();
    const unique = sorted.filter((item) => {
      const key = item.id || `${item.message}-${item.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return showAll ? unique : unique.slice(0, maxItems);
  }, [activities, maxItems, showAll]);

  const hasMore = useMemo(() => {
    return activities?.length > maxItems;
  }, [activities, maxItems]);

  const toggleShowAll = useCallback(() => {
    setShowAll((prev) => !prev);
  }, []);

  // Stable empty state
  const isEmpty = !processedActivities.length;

  if (isEmpty) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 text-center ${className}`}>
        <Activity size={32} className="text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-sm text-slate-400">No activity yet</p>
        <p className="text-xs text-slate-300 dark:text-slate-500">Actions will appear here</p>
      </div>
    );
  }

  return (
    <div className={`space-y-0 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <Activity size={16} className="text-slate-400" />
          Recent Activity
        </h3>
        {hasMore && (
          <button
            onClick={toggleShowAll}
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
          >
            {showAll ? "Show less" : `See all (${activities.length})`}
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-100/50 dark:divide-slate-800/50">
        {processedActivities.map((activity, index) => (
          <ActivityItem key={activity.id || index} activity={activity} />
        ))}
      </div>
    </div>
  );
}

// ─── Helpers for creating activity entries ────────────────────
export function createActivity({ type = "system", message, user, status, timestamp, id }) {
  return {
    id: id || crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    message,
    user: user || null,
    status: status || null,
    timestamp: timestamp || new Date().toISOString(),
  };
}

// ─── Default export for lazy imports ──────────────────────────
export default ActivityStream;
