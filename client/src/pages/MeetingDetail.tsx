// src/pages/MeetingDetail.tsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Clock, Users, Calendar, CheckCircle2, Circle,
  MessageSquare, ListChecks, Lightbulb, RefreshCw, Cpu,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import {
  meetingsApi, actionItemsApi, aiApi,
  type MeetingWithDetails, type ActionItem,
} from "@/lib/api";

const MeetingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await meetingsApi.getById(id);
      setMeeting(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meeting");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (meeting?.status !== "processing") return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [meeting?.status]);

  const handleToggle = async (itemId: string) => {
    if (!id || !meeting) return;
    try {
      const updated = await actionItemsApi.toggle(id, itemId);
      setMeeting((prev) =>
        prev
          ? {
              ...prev,
              action_items: prev.action_items.map((a) =>
                a.id === itemId ? updated : a
              ),
            }
          : prev
      );
    } catch (err) {
      console.error("Toggle failed", err);
    }
  };

  const handleAnalyze = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      await aiApi.analyzeMeeting(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded-xl" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-muted-foreground">{error ?? "Meeting not found"}</p>
        <Button asChild variant="link">
          <Link to="/">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const speakerColors: Record<string, string> = {};
  const colors = ["text-primary", "text-accent", "text-yellow-500", "text-destructive"];
  meeting.participants.forEach((p, i) => {
    speakerColors[p] = colors[i % colors.length];
  });

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{meeting.title}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {new Date(meeting.date).toLocaleDateString("en-US", {
                  weekday: "long", month: "long", day: "numeric", year: "numeric",
                })}
              </span>
              {meeting.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" /> {meeting.duration}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" /> {meeting.participants.length} participants
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {meeting.tags.map((tag) => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
            {meeting.status === "processing" && (
              <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-400/40 bg-yellow-400/10">
                <RefreshCw className="h-3 w-3 animate-spin" /> Processing…
              </Badge>
            )}
            {meeting.status === "completed" && !meeting.summary && (
              <Button size="sm" variant="outline" onClick={handleAnalyze} disabled={analyzing} className="gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                {analyzing ? "Analysing…" : "Run AI Analysis"}
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary" className="gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" /> Summary
          </TabsTrigger>
          <TabsTrigger value="transcript" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Transcript
          </TabsTrigger>
          <TabsTrigger value="actions" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" />
            Actions
            {meeting.action_items.filter((a) => !a.completed).length > 0 && (
              <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 leading-none">
                {meeting.action_items.filter((a) => !a.completed).length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Summary ── */}
        <TabsContent value="summary">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base">Meeting Summary</CardTitle></CardHeader>
              <CardContent>
                {meeting.summary ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">{meeting.summary}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {meeting.status === "processing"
                      ? "AI is generating your summary…"
                      : "No summary yet. Upload audio or run AI Analysis."}
                  </p>
                )}
              </CardContent>
            </Card>

            {meeting.decisions.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Key Decisions</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {meeting.decisions.map((d) => (
                      <li key={d.id} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{d.text}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">Participants</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {meeting.participants.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-sm">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                        {p.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <span className="text-foreground">{p}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Transcript ── */}
        <TabsContent value="transcript">
          <Card>
            <CardContent className="pt-6">
              {meeting.transcript.length > 0 ? (
                <div className="space-y-4">
                  {meeting.transcript.map((entry) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex gap-3"
                    >
                      <span className="text-xs text-muted-foreground font-mono w-14 shrink-0 pt-0.5">
                        {entry.timestamp}
                      </span>
                      <div>
                        <span className={`text-sm font-medium ${speakerColors[entry.speaker] ?? "text-foreground"}`}>
                          {entry.speaker}
                        </span>
                        <p className="text-sm text-muted-foreground mt-0.5">{entry.text}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {meeting.status === "processing"
                    ? "Transcript is being generated…"
                    : "No transcript available. Upload an audio file to generate one."}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Actions ── */}
        <TabsContent value="actions">
          <Card>
            <CardContent className="pt-6">
              {meeting.action_items.length > 0 ? (
                <div className="space-y-3">
                  {meeting.action_items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={() => handleToggle(item.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {item.text}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{item.assignee}</span>
                          {item.due_date && (
                            <>
                              <Circle className="h-1 w-1 fill-current" />
                              <span>Due {new Date(item.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No action items yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MeetingDetail;