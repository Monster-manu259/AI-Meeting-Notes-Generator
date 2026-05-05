import { useEffect, useState, useCallback } from "react";
import { Mic, Clock, CheckCircle2, AlertCircle, RefreshCw, ChevronRight, Users, Calendar } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { meetingsApi, actionItemsApi, statsApi, type Meeting, type ActionItem, type DashboardStats } from "@/lib/api";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface MeetingWithTasks extends Meeting {
  taskTotal: number;
  taskDone: number;
}

function RecentMeetingCard({ meeting, index }: { meeting: MeetingWithTasks; index: number }) {
  const { taskTotal, taskDone } = meeting;
  const allDone = taskTotal > 0 && taskDone === taskTotal;
  const hasTasks = taskTotal > 0;
  const pct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

  const statusLabel = allDone
    ? "all tasks done"
    : hasTasks
    ? `${taskDone}/${taskTotal} tasks done`
    : meeting.status;

  const statusStyle = allDone
    ? "bg-green-500/15 text-green-600 border-green-500/20"
    : hasTasks
    ? "bg-yellow-500/15 text-yellow-600 border-yellow-500/20"
    : meeting.status === "completed"
    ? "bg-blue-500/15 text-blue-600 border-blue-500/20"
    : meeting.status === "processing"
    ? "bg-yellow-500/15 text-yellow-600 border-yellow-500/20"
    : "bg-muted text-muted-foreground border-border";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
    >
      <Link
        to={`/meeting/${meeting.id}`}
        className="group block glass rounded-xl p-5 hover:border-primary/30 transition-all duration-200"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* Status badge */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="outline" className={statusStyle}>
                {allDone && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {statusLabel}
              </Badge>
              {meeting.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>

            {/* Title */}
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
              {meeting.title}
            </h3>

            {/* Meta */}
            <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
              {meeting.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {meeting.duration}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {meeting.participants.length}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(meeting.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>

            {/* Task progress bar */}
            {hasTasks && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Task progress</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${allDone ? "bg-green-500" : "bg-primary"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.06 + 0.2 }}
                  />
                </div>
              </div>
            )}

            {!hasTasks && meeting.summary && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{meeting.summary}</p>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
        </div>
      </Link>
    </motion.div>
  );
}

const Index = () => {
  const [meetings, setMeetings] = useState<MeetingWithTasks[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalMeetings: 0,
    totalHours: 0,
    actionItemsCompleted: 0,
    actionItemsPending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allMeetings, statsData] = await Promise.all([
        meetingsApi.getAll(),
        statsApi.get(),
      ]);

      const recent = allMeetings.slice(0, 4);

      const withTasks = await Promise.all(
        recent.map(async (m): Promise<MeetingWithTasks> => {
          if (m.status !== "completed") {
            return { ...m, taskTotal: 0, taskDone: 0 };
          }
          try {
            const items = await actionItemsApi.getAll(m.id);
            return {
              ...m,
              taskTotal: items.length,
              taskDone: items.filter((i) => i.completed).length,
            };
          } catch {
            return { ...m, taskTotal: 0, taskDone: 0 };
          }
        })
      );

      setMeetings(withTasks);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Your meeting intelligence at a glance</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Refresh">
          <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </motion.div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error} — is the backend running on{" "}
          <code className="font-mono text-xs">{import.meta.env.VITE_API_URL ?? "http://localhost:3001"}</code>?
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Total Meetings" value={loading ? "…" : stats.totalMeetings} icon={Mic} description="This month" index={0} />
        {/* <StatCard title="Hours Recorded" value={loading ? "…" : stats.totalHours.toFixed(1)} icon={Clock} description="Total recorded" index={1} /> */}
        <StatCard title="Actions Done" value={loading ? "…" : stats.actionItemsCompleted} icon={CheckCircle2} description="This week" index={2} />
        <StatCard title="Pending Items" value={loading ? "…" : stats.actionItemsPending} icon={AlertCircle} description="Needs attention" index={3} />
      </div>

      {/* Recent Meetings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Recent Meetings</h2>
          <Link to="/tasks" className="text-sm text-primary hover:underline">
            View all tasks →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass rounded-xl p-5 animate-pulse h-28" />
            ))}
          </div>
        ) : meetings.length > 0 ? (
          <div className="space-y-3">
            {meetings.map((meeting, i) => (
              <RecentMeetingCard key={meeting.id} meeting={meeting} index={i} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Mic className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No meetings yet. Upload your first recording.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;