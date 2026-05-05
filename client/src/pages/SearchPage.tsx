// src/pages/SearchPage.tsx
import { useState, useRef } from "react";
import { Search, Sparkles, Loader2, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { searchApi, type SearchResult } from "@/lib/api";

const SUGGESTIONS = [
  "What were the key decisions from last week?",
  "Action items assigned to Sarah",
  "Q1 product strategy highlights",
  "Client onboarding status updates",
];

const typeColors: Record<string, string> = {
  summary: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  transcript: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  action_item: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  decision: "bg-green-500/10 text-green-600 border-green-500/20",
};

const SearchPage = () => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async (q = query) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setResults([]);
    try {
      const data = await searchApi.query(q.trim());
      setAnswer(data.answer);
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestion = (s: string) => {
    setQuery(s);
    handleSearch(s);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Search Meetings</h1>
        <p className="text-muted-foreground mt-1">Ask anything across all your meeting notes</p>
      </motion.div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Ask anything about your meetings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-10 pr-24"
          disabled={loading}
        />
        <Button
          size="sm"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 gap-1"
          disabled={!query || loading}
          onClick={() => handleSearch()}
        >
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>

      {/* Suggestions — only show when no query/results */}
      {!query && !answer && (
        <div>
          <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <Card
                key={s}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => handleSuggestion(s)}
              >
                <CardContent className="p-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground">{s}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          <div className="h-24 rounded-xl bg-muted animate-pulse" />
          <div className="h-16 rounded-xl bg-muted animate-pulse" />
          <div className="h-16 rounded-xl bg-muted animate-pulse" />
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {answer && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* AI Answer */}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-primary text-sm font-medium">
                  <Sparkles className="h-4 w-4" /> AI Answer
                </div>
                <p className="text-sm text-foreground leading-relaxed">{answer}</p>
              </CardContent>
            </Card>

            {/* Source results */}
            {results.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Sources ({results.length})
                </p>
                {results.map((r, i) => (
                  <motion.div
                    key={r.meeting_id + i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="hover:border-primary/30 transition-colors">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`text-xs ${typeColors[r.type] ?? ""}`}
                            >
                              {r.type.replace("_", " ")}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(r.meeting_date).toLocaleDateString("en-US", {
                                month: "short", day: "numeric", year: "numeric",
                              })}
                            </span>
                          </div>
                          <Link
                            to={`/meeting/${r.meeting_id}`}
                            className="text-xs text-primary flex items-center gap-1 shrink-0 hover:underline"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                        <p className="text-sm font-medium text-foreground">{r.meeting_title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{r.excerpt}</p>
                        <div className="text-xs text-muted-foreground">
                          Relevance: {(r.score * 100).toFixed(0)}%
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}

            {results.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No matching excerpts found. Try uploading more meetings.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchPage;