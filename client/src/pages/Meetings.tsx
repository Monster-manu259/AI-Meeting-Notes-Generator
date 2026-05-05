// src/pages/Meetings.tsx
import { useEffect, useState, useCallback } from "react";
import { Search, RefreshCw, Mic } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MeetingCard } from "@/components/MeetingCard";
import { meetingsApi, type Meeting } from "@/lib/api";
import { motion } from "framer-motion";

const Meetings = () => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (searchTerm?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await meetingsApi.getAll(
        searchTerm ? { search: searchTerm } : undefined
      );
      setMeetings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meetings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search || undefined), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-semibold text-foreground">All Meetings</h1>
          <p className="text-muted-foreground mt-1">Browse and search your meeting history</p>
        </div>
        <button onClick={() => load(search || undefined)} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </motion.div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search meetings by title or tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="glass rounded-xl p-5 animate-pulse h-24" />
          ))
        ) : meetings.length > 0 ? (
          meetings.map((meeting, i) => (
            <MeetingCard key={meeting.id} meeting={meeting} index={i} />
          ))
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Mic className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{search ? "No meetings match your search." : "No meetings yet."}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Meetings;