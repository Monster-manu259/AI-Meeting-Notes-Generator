// src/pages/Upload.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload as UploadIcon, FileAudio, X, Mic, CheckCircle2,
  Loader2, Square, Pause, Play, Trash2, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { meetingsApi } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode = "choose" | "upload" | "record";
type UploadStep = "idle" | "creating" | "uploading" | "done" | "error";
type RecordStep = "idle" | "requesting" | "recording" | "paused" | "stopped" | "creating" | "uploading" | "done" | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getBestMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

// ─── Waveform Visualiser ──────────────────────────────────────────────────────
function WaveformBar({ active, height }: { active: boolean; height: number }) {
  return (
    <motion.div
      className="w-1 rounded-full bg-primary"
      animate={{ height: active ? `${height}%` : "15%" }}
      transition={{ duration: 0.1, ease: "easeOut" }}
      style={{ minHeight: 4 }}
    />
  );
}

function Waveform({ stream, active }: { stream: MediaStream | null; active: boolean }) {
  const [bars, setBars] = useState<number[]>(Array(32).fill(15));
  const animRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode>();
  const ctxRef = useRef<AudioContext>();

  useEffect(() => {
    if (!stream || !active) {
      cancelAnimationFrame(animRef.current!);
      setBars(Array(32).fill(15));
      return;
    }

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    ctx.createMediaStreamSource(stream).connect(analyser);
    ctxRef.current = ctx;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setBars(Array.from({ length: 32 }, (_, i) => {
        const val = data[Math.floor(i * data.length / 32)] ?? 0;
        return Math.max(8, (val / 255) * 100);
      }));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animRef.current!);
      ctx.close();
    };
  }, [stream, active]);

  return (
    <div className="flex items-center justify-center gap-0.5 h-16">
      {bars.map((h, i) => (
        <WaveformBar key={i} active={active} height={h} />
      ))}
    </div>
  );
}

// ─── Upload Mode ──────────────────────────────────────────────────────────────
function UploadMode({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [step, setStep] = useState<UploadStep>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      if (!title) setTitle(dropped.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleSubmit = async () => {
    if (!file || !title) return;
    setError(null);
    const participantList = participants.split(",").map((p) => p.trim()).filter(Boolean);

    setStep("creating");
    let meetingId: string;
    try {
      const meeting = await meetingsApi.create({
        title,
        date: new Date().toISOString(),
        participants: participantList.length > 0 ? participantList : ["Unknown"],
        status: "scheduled",
      });
      meetingId = meeting.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create meeting");
      setStep("error");
      return;
    }

    setStep("uploading");
    try {
      await meetingsApi.uploadAudio(meetingId, file, (pct) => setProgress(pct));
      setStep("done");
      setTimeout(() => navigate(`/meeting/${meetingId}`), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStep("error");
    }
  };

  const busy = step === "creating" || step === "uploading";

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Meeting Title <span className="text-destructive">*</span></Label>
          <Input id="title" placeholder="e.g., Weekly Standup" value={title}
            onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="participants">
            Participants <span className="text-muted-foreground text-xs">(comma-separated)</span>
          </Label>
          <Input id="participants" placeholder="e.g., Alice, Bob, Carol"
            value={participants} onChange={(e) => setParticipants(e.target.value)} disabled={busy} />
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileAudio className="h-8 w-8 text-primary" />
              <div className="text-left">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              {!busy && (
                <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            <div>
              <UploadIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag & drop, or{" "}
                <label className="text-primary cursor-pointer hover:underline">
                  browse
                  <input type="file" accept="audio/*,video/*" className="hidden" onChange={handleFileSelect} />
                </label>
              </p>
              <p className="text-xs text-muted-foreground">MP3, WAV, M4A, MP4, WebM up to 500 MB</p>
            </div>
          )}
        </div>

        {(step === "uploading" || step === "done") && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{step === "done" ? "Upload complete" : "Uploading…"}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div className="h-full bg-primary rounded-full"
                initial={{ width: 0 }} animate={{ width: `${progress}%` }}
                transition={{ ease: "linear" }} />
            </div>
          </div>
        )}

        {step === "creating" && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Creating meeting record…
          </p>
        )}
        {step === "done" && (
          <p className="text-sm text-green-600 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Done! Redirecting…
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onBack} disabled={busy}>Back</Button>
          <Button onClick={handleSubmit} disabled={!file || !title || busy || step === "done"}>
            {busy
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
              : <><UploadIcon className="h-4 w-4 mr-2" />Upload & Process</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Live Record Mode ─────────────────────────────────────────────────────────
function RecordMode({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState("");
  const [step, setStep] = useState<RecordStep>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const startTimeRef = useRef<number>(0);

  const stopTimer = () => clearInterval(timerRef.current);

  const startTimer = () => {
    startTimeRef.current = Date.now() - elapsed;
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 100);
  };

  useEffect(() => () => {
    stopTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, []);

  const startRecording = async () => {
    setError(null);
    setStep("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;

      const mimeType = getBestMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      recorder.start(1000); // collect chunks every second
      setStep("recording");
      setElapsed(0);
      startTimer();
    } catch (err) {
      setError("Microphone access denied. Please allow microphone access and try again.");
      setStep("idle");
    }
  };

  const pauseRecording = () => {
    mediaRecorderRef.current?.pause();
    stopTimer();
    setStep("paused");
  };

  const resumeRecording = () => {
    mediaRecorderRef.current?.resume();
    startTimer();
    setStep("recording");
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    stopTimer();
    setStep("stopped");
  };

  const discardRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioBlob(null);
    setElapsed(0);
    setStep("idle");
    chunksRef.current = [];
  };

  const submitRecording = async () => {
    if (!audioBlob || !title) return;
    setError(null);
    const participantList = participants.split(",").map((p) => p.trim()).filter(Boolean);
    const filename = `recording-${Date.now()}.webm`;
    const file = new File([audioBlob], filename, { type: audioBlob.type });

    setStep("creating");
    let meetingId: string;
    try {
      const meeting = await meetingsApi.create({
        title,
        date: new Date().toISOString(),
        participants: participantList.length > 0 ? participantList : ["Unknown"],
        duration: formatDuration(elapsed),
        status: "scheduled",
      });
      meetingId = meeting.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create meeting");
      setStep("error");
      return;
    }

    setStep("uploading");
    try {
      await meetingsApi.uploadAudio(meetingId, file, (pct) => setProgress(pct));
      setStep("done");
      setTimeout(() => navigate(`/meeting/${meetingId}`), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStep("error");
    }
  };

  const isRecordingActive = step === "recording" || step === "paused";
  const isStopped = step === "stopped";
  const busy = step === "creating" || step === "uploading";

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        {/* Title + Participants — always visible */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Meeting Title <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g., Team Standup" value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isRecordingActive || busy} />
          </div>
          <div className="space-y-2">
            <Label>Participants <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
            <Input placeholder="Alice, Bob, Carol" value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              disabled={isRecordingActive || busy} />
          </div>
        </div>

        {/* Recording UI */}
        <AnimatePresence mode="wait">
          {/* Idle state */}
          {step === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 py-6"
            >
              <div className="relative">
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mic className="h-8 w-8 text-primary" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Ready to record</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your microphone will be used to capture the meeting
                </p>
              </div>
              <Button onClick={startRecording} className="gap-2 px-6" size="lg">
                <Mic className="h-4 w-4" /> Start Recording
              </Button>
            </motion.div>
          )}

          {/* Requesting mic permission */}
          {step === "requesting" && (
            <motion.div key="requesting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 py-8"
            >
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Requesting microphone access…</p>
            </motion.div>
          )}

          {/* Recording / Paused */}
          {(step === "recording" || step === "paused") && (
            <motion.div key="recording" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Status pill */}
              <div className="flex items-center justify-center gap-2">
                <motion.div
                  className={`h-2.5 w-2.5 rounded-full ${step === "recording" ? "bg-red-500" : "bg-yellow-500"}`}
                  animate={step === "recording" ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                />
                <span className="text-sm font-medium text-foreground">
                  {step === "recording" ? "Recording" : "Paused"}
                </span>
                <span className="text-sm font-mono text-muted-foreground ml-2">
                  {formatDuration(elapsed)}
                </span>
              </div>

              {/* Waveform */}
              <div className="bg-muted/40 rounded-xl px-4 py-2">
                <Waveform stream={streamRef.current} active={step === "recording"} />
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-3">
                {step === "recording" ? (
                  <Button variant="outline" onClick={pauseRecording} className="gap-2">
                    <Pause className="h-4 w-4" /> Pause
                  </Button>
                ) : (
                  <Button variant="outline" onClick={resumeRecording} className="gap-2">
                    <Play className="h-4 w-4" /> Resume
                  </Button>
                )}
                <Button variant="destructive" onClick={stopRecording} className="gap-2">
                  <Square className="h-4 w-4" /> Stop
                </Button>
              </div>
            </motion.div>
          )}

          {/* Stopped — review & submit */}
          {(step === "stopped" || busy || step === "done" || step === "error") && (
            <motion.div key="stopped" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Playback */}
              {audioUrl && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Review Recording</Label>
                    <span className="text-xs text-muted-foreground font-mono">{formatDuration(elapsed)}</span>
                  </div>
                  <audio controls src={audioUrl} className="w-full h-10" />
                </div>
              )}

              {/* Upload progress */}
              {(step === "uploading" || step === "done") && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{step === "done" ? "Upload complete" : "Uploading…"}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <motion.div className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }} animate={{ width: `${progress}%` }}
                      transition={{ ease: "linear" }} />
                  </div>
                </div>
              )}

              {step === "creating" && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating meeting…
                </p>
              )}
              {step === "done" && (
                <p className="text-sm text-green-600 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Done! Redirecting…
                </p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}

              {/* Actions */}
              {!busy && step !== "done" && (
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={discardRecording} className="gap-2 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" /> Discard
                  </Button>
                  <Button onClick={submitRecording} disabled={!title} className="gap-2">
                    <UploadIcon className="h-4 w-4" /> Process Recording
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {error && step === "idle" && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        {/* Back button */}
        {!isRecordingActive && !busy && step !== "done" && (
          <div className="pt-1">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
              ← Back
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Upload Page ─────────────────────────────────────────────────────────
const Upload = () => {
  const [mode, setMode] = useState<Mode>("choose");

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">New Meeting</h1>
        <p className="text-muted-foreground mt-1">
          {mode === "choose"
            ? "Choose how to add your meeting"
            : mode === "record"
            ? "Live Recording"
            : "Upload Audio or Video"}
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {mode === "choose" && (
          <motion.div key="choose"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="grid gap-4 sm:grid-cols-2"
          >
            {/* Live Recording card */}
            <Card
              className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 group"
              onClick={() => setMode("record")}
            >
              <CardHeader className="text-center pb-2">
                <div className="mx-auto rounded-xl bg-red-500/10 p-4 w-fit mb-2 group-hover:bg-red-500/20 transition-colors">
                  <Radio className="h-8 w-8 text-red-500" />
                </div>
                <CardTitle className="text-base">Live Recording</CardTitle>
                <CardDescription>Record your meeting in real-time using your microphone</CardDescription>
              </CardHeader>
              <CardContent className="text-center pb-5">
                <span className="inline-flex items-center gap-1.5 text-xs text-red-500 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  Live
                </span>
              </CardContent>
            </Card>

            {/* Upload card */}
            <Card
              className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 group"
              onClick={() => setMode("upload")}
            >
              <CardHeader className="text-center pb-2">
                <div className="mx-auto rounded-xl bg-primary/10 p-4 w-fit mb-2 group-hover:bg-primary/20 transition-colors">
                  <UploadIcon className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-base">Upload File</CardTitle>
                <CardDescription>Upload a pre-recorded audio or video file</CardDescription>
              </CardHeader>
              <CardContent className="text-center pb-5">
                <span className="text-xs text-muted-foreground">MP3, WAV, M4A, MP4, WebM</span>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {mode === "upload" && (
          <motion.div key="upload"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          >
            <UploadMode onBack={() => setMode("choose")} />
          </motion.div>
        )}

        {mode === "record" && (
          <motion.div key="record"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          >
            <RecordMode onBack={() => setMode("choose")} />
          </motion.div>
        )}
      </AnimatePresence>

      {mode === "choose" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="text-center"
        >
          <Button variant="ghost" asChild className="text-muted-foreground">
            <Link to="/">Cancel</Link>
          </Button>
        </motion.div>
      )}
    </div>
  );
};

export default Upload;