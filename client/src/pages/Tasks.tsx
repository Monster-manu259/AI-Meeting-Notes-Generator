// src/pages/Tasks.tsx
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Circle, RefreshCw, ListChecks,
  Calendar, ExternalLink, ChevronDown, Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { meetingsApi, actionItemsApi, type Meeting, type ActionItem } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TaskWithMeeting extends ActionItem {
  meetingTitle: string;
  meetingDate: string;
}

type Filter = "all" | "pending" | "completed";
type GroupBy = "meeting" | "status" | "due";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isPastDue(due_date: string | null) {
  if (!due_date) return false;
  return new Date(due_date) < new Date();
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMeetingDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Task Row ─────────────────────────────────────────────────────────────────
function TaskRow({
  task,
  onToggle,
  index,
}: {
  task: TaskWithMeeting;
  onToggle: (task: TaskWithMeeting) => void;
  index: number;
}) {
  const pastDue = !task.completed && isPastDue(task.due_date);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      className="flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors group"
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task)}
        className="mt-0.5 shrink-0 transition-transform active:scale-90"
      >
        {task.completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${task.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {task.text}
        </p>
        <div className="flex items-center flex-wrap gap-2 mt-1.5">
          {/* Assignee */}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-4 w-4 rounded-full bg-primary/15 flex items-center justify-center text-[9px] font-bold text-primary">
              {task.assignee.charAt(0).toUpperCase()}
            </div>
            {task.assignee}
          </span>

          {/* Due date */}
          {task.due_date && (
            <span className={`text-xs flex items-center gap-1 ${pastDue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              <Calendar className="h-3 w-3" />
              {pastDue && !task.completed ? "Overdue · " : ""}
              {formatDate(task.due_date)}
            </span>
          )}

          {/* Meeting link */}
          <Link
            to={`/meeting/${task.meeting_id}`}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            {task.meetingTitle}
          </Link>
        </div>
      </div>

      {/* Status badge */}
      <div className="shrink-0 mt-0.5">
        {task.completed ? (
          <Badge variant="outline" className="text-[10px] py-0 text-green-600 border-green-500/30 bg-green-500/10">
            Done
          </Badge>
        ) : pastDue ? (
          <Badge variant="outline" className="text-[10px] py-0 text-destructive border-destructive/30 bg-destructive/10">
            Overdue
          </Badge>
        ) : null}
      </div>
    </motion.div>
  );
}

// ─── Group Header ─────────────────────────────────────────────────────────────
function GroupHeader({ label, count, completed }: { label: string; count: number; completed: number }) {
  return (
    <div className="flex items-center gap-3 px-1 py-2 mb-1">
      <span className="text-sm font-semibold text-foreground truncate">{label}</span>
      <div className="flex items-center gap-1.5 ml-auto shrink-0">
        <span className="text-xs text-muted-foreground">{completed}/{count}</span>
        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: count > 0 ? `${(completed / count) * 100}%` : "0%" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const Tasks = () => {
  const [tasks, setTasks] = useState<TaskWithMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all completed meetings (these have action items)
      const meetings = await meetingsApi.getAll();
      const withItems = meetings.filter((m) => m.status === "completed");

      // Fetch action items for each meeting in parallel
      const results = await Promise.allSettled(
        withItems.map(async (m) => {
          const items = await actionItemsApi.getAll(m.id);
          return items.map((item): TaskWithMeeting => ({
            ...item,
            meetingTitle: m.title,
            meetingDate: m.date,
          }));
        })
      );

      const allTasks = results
        .filter((r): r is PromiseFulfilledResult<TaskWithMeeting[]> => r.status === "fulfilled")
        .flatMap((r) => r.value);

      // Sort: pending first, then by due date, then by meeting date
      allTasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime();
      });

      setTasks(allTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (task: TaskWithMeeting) => {
    if (toggling.has(task.id)) return;
    setToggling((s) => new Set(s).add(task.id));

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => t.id === task.id ? { ...t, completed: !t.completed } : t)
    );

    try {
      await actionItemsApi.toggle(task.meeting_id, task.id);
    } catch {
      // Revert on error
      setTasks((prev) =>
        prev.map((t) => t.id === task.id ? { ...t, completed: task.completed } : t)
      );
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(task.id); return n; });
    }
  };

  // Filter + search
  const filtered = tasks.filter((t) => {
    if (filter === "pending" && t.completed) return false;
    if (filter === "completed" && !t.completed) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.text.toLowerCase().includes(q) ||
        t.assignee.toLowerCase().includes(q) ||
        t.meetingTitle.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by meeting
  const grouped = filtered.reduce<Record<string, { meeting: string; date: string; items: TaskWithMeeting[] }>>(
    (acc, task) => {
      if (!acc[task.meeting_id]) {
        acc[task.meeting_id] = {
          meeting: task.meetingTitle,
          date: task.meetingDate,
          items: [],
        };
      }
      acc[task.meeting_id].items.push(task);
      return acc;
    },
    {}
  );

  // Stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const overdueTasks = tasks.filter((t) => !t.completed && isPastDue(t.due_date)).length;
  const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Tasks</h1>
          <p className="text-muted-foreground mt-1">Action items from all your meetings</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2 shrink-0">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </motion.div>

      {/* Stats bar */}
      {!loading && totalTasks > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-4 flex flex-wrap items-center gap-6"
        >
          <div>
            <p className="text-2xl font-semibold text-foreground">{completionPct}%</p>
            <p className="text-xs text-muted-foreground">Complete</p>
          </div>
          <div className="flex-1 min-w-[120px]">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${completionPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{completedTasks} of {totalTasks} tasks</p>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-lg font-semibold text-foreground">{totalTasks - completedTasks}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            {overdueTasks > 0 && (
              <div>
                <p className="text-lg font-semibold text-destructive">{overdueTasks}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks, assignees, meetings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          {(["all", "pending", "completed"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm capitalize transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Task list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-center py-20 space-y-3"
        >
          <ListChecks className="h-12 w-12 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            {search
              ? "No tasks match your search."
              : filter === "completed"
              ? "No completed tasks yet."
              : filter === "pending"
              ? "All caught up! No pending tasks."
              : "No tasks yet. Upload a meeting to generate action items."}
          </p>
          {!search && filter === "all" && (
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to="/upload">Upload a Meeting</Link>
            </Button>
          )}
        </motion.div>
      ) : (
        <div className="space-y-6">
          <AnimatePresence>
            {Object.entries(grouped).map(([meetingId, group]) => (
              <motion.div
                key={meetingId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass rounded-xl overflow-hidden"
              >
                {/* Group header */}
                <div className="px-4 pt-4 pb-2 border-b border-border/50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/meeting/${meetingId}`}
                        className="text-sm font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1.5 truncate"
                      >
                        {group.meeting}
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatMeetingDate(group.date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {group.items.filter((i) => i.completed).length}/{group.items.length}
                      </span>
                      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className="h-full bg-primary rounded-full"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${(group.items.filter((i) => i.completed).length / group.items.length) * 100}%`,
                          }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tasks */}
                <div className="divide-y divide-border/30">
                  <AnimatePresence>
                    {group.items.map((task, i) => (
                      <TaskRow key={task.id} task={task} onToggle={handleToggle} index={i} />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default Tasks;