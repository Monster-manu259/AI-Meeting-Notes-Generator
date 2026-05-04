# 🧠 MeetingMind

> **AI-powered meeting intelligence** — upload or record meetings, get instant transcripts, summaries, action items, and semantic search. Built with Node.js, React, PostgreSQL, Groq, ElevenLabs, and Pinecone.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the App](#running-the-app)
- [API Reference](#api-reference)
- [Authentication](#authentication)
- [File Upload & Processing Pipeline](#file-upload--processing-pipeline)
- [Pages & Features](#pages--features)
- [Troubleshooting](#troubleshooting)

---

## Overview

MeetingMind transforms raw meeting recordings into structured, searchable intelligence. Upload an audio or video file, or record directly in the browser — MeetingMind will transcribe it, identify speakers, generate a summary, extract action items and decisions, and index everything for semantic search.

Each user has a private workspace. All meetings, tasks, and transcripts are scoped to the authenticated user.

---

## Features

### 🎙️ Recording & Upload
- **Live recording** — record directly in the browser using the Web Audio API with a real-time animated waveform visualiser, pause/resume, and playback review before submitting
- **File upload** — drag-and-drop or browse for audio (`mp3`, `wav`, `ogg`, `webm`, `m4a`) and video (`mp4`, `mov`, `mkv`, `avi`, `webm`) files up to 500 MB
- **Video support** — audio is automatically extracted from video files using `ffmpeg` before transcription

### 🤖 AI Processing Pipeline
- **Transcription** — ElevenLabs Scribe v1 with speaker diarization; falls back to word-chunk segmentation if utterances are unavailable
- **Analysis** — Groq LLaMA 3.3 70B generates a structured summary, action items (with assignee and due date), decisions, key topics, and sentiment
- **Vector indexing** — transcript chunks and summaries are embedded and stored in Pinecone for semantic search
- **Background processing** — audio pipeline runs asynchronously; status is polled on the meeting detail page

### ✅ Tasks
- Aggregated view of all action items across every meeting
- One-click completion toggle with optimistic UI updates
- Filter by All / Pending / Completed
- Search by task text, assignee, or meeting title
- Overdue detection with visual indicators
- Progress bar per meeting group

### 🔍 Semantic Search
- Natural language queries across all meeting content
- AI-generated answer card using RAG (Retrieval-Augmented Generation)
- Ranked source excerpts with type badges (`transcript`, `summary`, `action_item`)
- Relevance scores and direct links to source meetings

### 🔐 Authentication
- Session-based auth with tokens stored in PostgreSQL (7-day TTL)
- Secure password hashing with bcrypt (12 rounds)
- Password reset via email link (30-minute expiry, single-use token)
- All sessions invalidated on password reset
- Per-user data isolation — users can only see their own meetings

### 📊 Dashboard
- Stats: total meetings, hours recorded, tasks completed, pending items
- Recent meetings with live task completion progress bars
- Green "all tasks done" indicator when a meeting's action items are fully resolved

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20+, TypeScript |
| **Framework** | Express 4.x |
| **Database** | PostgreSQL (via `pg`) |
| **Transcription** | ElevenLabs Scribe v1 |
| **LLM / Analysis** | Groq — `llama-3.3-70b-versatile` |
| **Vector DB** | Pinecone v3 SDK |
| **Email** | Nodemailer (SMTP) |
| **Frontend** | React 18, Vite, TypeScript |
| **Styling** | Tailwind CSS, shadcn/ui |
| **Animation** | Framer Motion |
| **Routing** | react-router-dom v6 |
| **Media** | ffmpeg (video audio extraction) |

---

## Project Structure

```
meetingmind/
├── server/                         # Express backend
│   ├── src/
│   │   ├── index.ts                # App entry point
│   │   ├── types/
│   │   │   └── index.ts            # Shared TypeScript types
│   │   ├── db/
│   │   │   ├── index.ts            # PostgreSQL connection pool
│   │   │   ├── migrate.ts          # Initial schema migrations
│   │   │   └── migrate_auth.ts     # Auth schema migration (run after migrate.ts)
│   │   ├── middleware/
│   │   │   ├── auth.ts             # requireAuth / optionalAuth middleware
│   │   │   ├── logger.ts           # Winston logger
│   │   │   └── errorHandler.ts     # Global error handler
│   │   ├── services/
│   │   │   ├── authService.ts      # Register, login, sessions, password reset
│   │   │   ├── meetingService.ts   # CRUD + action items + transcript (user-scoped)
│   │   │   ├── elevenlabsService.ts# ElevenLabs STT via Node https module
│   │   │   ├── grokService.ts      # Groq LLM analysis + chunking for RAG
│   │   │   └── pineconeService.ts  # Vector upsert + semantic search
│   │   ├── routes/
│   │   │   ├── auth.ts             # /api/auth/* endpoints
│   │   │   ├── meetings.ts         # /api/meetings/* endpoints (auth-gated)
│   │   │   ├── ai.ts               # /api/ai/* endpoints
│   │   │   └── search.ts           # /api/search endpoints
│   │   └── utils/
│   │       └── media.ts            # ffmpeg audio extraction helpers
│   ├── uploads/                    # Temporary uploaded files (auto-cleaned)
│   ├── .env                        # Environment variables (see below)
│   └── package.json
│
└── client/                         # React + Vite frontend
    ├── src/
    │   ├── context/
    │   │   └── AuthContext.tsx      # Auth state, login/logout, token persistence
    │   ├── components/
    │   │   ├── Layout.tsx           # App shell with sidebar + user menu
    │   │   ├── AppSidebar.tsx       # Navigation sidebar
    │   │   ├── ProtectedRoute.tsx   # Route guards (ProtectedRoute + GuestRoute)
    │   │   ├── MeetingCard.tsx      # Meeting list card
    │   │   ├── StatCard.tsx         # Dashboard stat card
    │   │   └── NavLink.tsx          # Active-aware nav link
    │   ├── pages/
    │   │   ├── Index.tsx            # Dashboard
    │   │   ├── Tasks.tsx            # Aggregated action items
    │   │   ├── MeetingDetail.tsx    # Full meeting view + transcript
    │   │   ├── Upload.tsx           # Upload file or live record
    │   │   ├── SearchPage.tsx       # Semantic search
    │   │   ├── Login.tsx            # Login page
    │   │   ├── Register.tsx         # Registration with password strength meter
    │   │   ├── ForgotPassword.tsx   # Request reset email
    │   │   └── ResetPassword.tsx    # Set new password from email link
    │   ├── lib/
    │   │   └── api.ts               # All API types + fetch wrappers (auth-aware)
    │   └── App.tsx                  # Router with protected/guest route wrappers
    ├── .env                         # VITE_API_URL
    └── package.json
```

---

## Prerequisites

- **Node.js** 20 or higher
- **PostgreSQL** 14 or higher
- **ffmpeg** — required for video file support
- API keys for **ElevenLabs**, **Groq**, and **Pinecone**
- An SMTP email account for password reset (Gmail App Password recommended)

### Install ffmpeg

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg

# Windows
winget install ffmpeg
```

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/yourname/meetingmind.git
cd meetingmind

# 2. Install server dependencies
cd server
npm install

# 3. Install client dependencies
cd ../client
npm install
```

---

## Environment Variables

### `server/.env`

```env
# Server
PORT=3001
NODE_ENV=development

# PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/meetingmind

# AI Services
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxx

# Pinecone
PINECONE_API_KEY=xxxxxxxxxxxxxxxxxxxx
PINECONE_INDEX_NAME=meetingmind-embeddings
PINECONE_REGION=us-east-1

# File upload
MAX_FILE_SIZE_MB=500
UPLOAD_DIR=./uploads

# CORS
FRONTEND_URL=http://localhost:5173

# Email (for password reset)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM=MeetingMind <you@gmail.com>
```

> **Gmail App Password**: Google Account → Security → 2-Step Verification → App Passwords → Create

### `client/.env`

```env
VITE_API_URL=http://localhost:3001
```

---

## Database Setup

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE meetingmind;"

# Run initial schema migration
cd server
npx tsx src/db/migrate.ts

# Run auth schema migration (adds users, sessions, password_reset_tokens tables)
npx tsx src/db/migrate_auth.ts

# Optional: seed with sample data
npx tsx src/db/seed.ts
```

### Database Schema

| Table | Purpose |
|---|---|
| `users` | User accounts (id, name, email, password_hash) |
| `sessions` | Active login sessions with expiry |
| `password_reset_tokens` | Single-use reset tokens (30-min TTL) |
| `meetings` | Meeting records, scoped to `user_id` |
| `transcript_entries` | Per-speaker transcript segments |
| `action_items` | Extracted tasks with assignee and completion state |
| `decisions` | Key decisions from meetings |
| `embeddings_log` | Pinecone vector IDs for cleanup tracking |

---

## Running the App

```bash
# Terminal 1 — Start the backend (port 3001)
cd server
npm run dev

# Terminal 2 — Start the frontend (port 8080)
cd client
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) — you'll be redirected to `/login` on first visit.

---

## API Reference

All `/api/meetings/*`, `/api/ai/*`, and `/api/search/*` routes require:
```
Authorization: Bearer <session_token>
```

### Auth — `/api/auth`

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/register` | `{ name, email, password }` | Create account, returns session token |
| `POST` | `/login` | `{ email, password }` | Login, returns session token |
| `POST` | `/logout` | — | Invalidate current session |
| `POST` | `/logout-all` | — | Invalidate all sessions for user |
| `GET` | `/me` | — | Return current user info |
| `POST` | `/forgot-password` | `{ email }` | Send password reset email |
| `POST` | `/reset-password` | `{ token, password }` | Set new password |

### Meetings — `/api/meetings`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | List all meetings (supports `?status=` and `?search=`) |
| `GET` | `/stats` | Dashboard stats (totals, hours, task counts) |
| `GET` | `/:id` | Get meeting with transcript, action items, decisions |
| `POST` | `/` | Create a new meeting record |
| `PATCH` | `/:id` | Update meeting fields |
| `DELETE` | `/:id` | Delete meeting and all related data |
| `POST` | `/:id/upload` | Upload audio/video — triggers async AI pipeline |
| `GET` | `/:id/pipeline-status` | Check transcript/analysis completion |
| `GET` | `/:id/action-items` | List action items |
| `POST` | `/:id/action-items` | Add action item |
| `PATCH` | `/:id/action-items/:itemId/toggle` | Toggle completion |
| `DELETE` | `/:id/action-items/:itemId` | Delete action item |

### AI — `/api/ai`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/analyze/:id` | Re-run Groq analysis on existing transcript |
| `POST` | `/index/:id` | Re-index meeting into Pinecone |

### Search — `/api/search`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/` | Semantic search — body: `{ query, limit? }` |
| `GET` | `/stats` | Pinecone index stats |

---

## Authentication

MeetingMind uses **session-based authentication**:

1. On register or login, a cryptographically random 96-character token is generated and stored in the `sessions` table with a 7-day expiry.
2. The token is returned to the client and stored in `localStorage`.
3. Every API request includes `Authorization: Bearer <token>` in the header.
4. The `requireAuth` middleware validates the token against the database on each request.
5. On password reset, **all existing sessions are invalidated** — requiring re-login on all devices.
6. Expired sessions are automatically removed on access.

### Route Protection (Frontend)

- **`ProtectedRoute`** — wraps authenticated pages; redirects to `/login` if no valid session
- **`GuestRoute`** — wraps login/register/forgot-password; redirects to `/` if already logged in
- **401 auto-logout** — any 401 response clears storage and redirects to `/login`

---

## File Upload & Processing Pipeline

When an audio or video file is uploaded to `POST /api/meetings/:id/upload`:

```
Step 1 — Read file from disk
         ↓ (if video: .mp4, .mov, .webm, .mkv, .avi, .m4v)
Step 2 — Extract audio track via ffmpeg (16kHz mono MP3)
         ↓
Step 3 — Send audio to ElevenLabs Scribe v1
         Diarization enabled → utterances with speaker_id
         Fallback: word chunks (15 words) → sentence split
         ↓
Step 4 — Save transcript segments to DB (speaker, text, timestamp)
         ↓
Step 5 — Send transcript to Groq llama-3.3-70b-versatile
         Returns: summary, action_items, decisions, key_topics, sentiment
         Model fallback chain: llama-3.3-70b-versatile → llama3-70b-8192 → llama3-8b-8192
         ↓
Step 6 — Save analysis to DB, set status = "completed"
         ↓
Step 7 — Chunk content and upsert vectors to Pinecone (non-fatal if fails)
         ↓
Step 8 — Clean up temp files
```

The pipeline runs **asynchronously** — the upload endpoint returns immediately with `202` and the frontend polls `GET /api/meetings/:id/pipeline-status` every 5 seconds until `status === "completed"`.

On any pipeline failure, the meeting status reverts to `"scheduled"` and the full error with stack trace is logged.

---

## Pages & Features

### Dashboard (`/`)
- Live stats from the database
- Recent 4 meetings with task completion progress bars
- Green badge when all tasks are done for a meeting

### Tasks (`/tasks`)
- All action items from all completed meetings in one view
- Grouped by meeting with per-group progress bars
- Instant optimistic toggle (reverts on API error)
- Filter: All / Pending / Completed
- Overdue detection (red badge + red date)

### Upload (`/upload`)
Two modes selectable from a landing screen:

**File Upload mode**
- Drag-and-drop or file picker
- Accepts audio and video files up to 500 MB
- Title and participants input
- Real-time XHR upload progress bar
- Auto-navigates to meeting detail on completion

**Live Record mode**
- Browser MediaRecorder with `echoCancellation`, `noiseSuppression`, 16kHz sample rate
- Animated real-time waveform (32-bar Web Audio API analyser)
- Pause / Resume / Stop controls with elapsed timer
- Audio playback review before submitting
- Discard option to re-record
- Submits as `.webm` file with auto-generated title from timestamp

### Meeting Detail (`/meeting/:id`)
- Full transcript with speaker labels and timestamps
- Summary, key topics, sentiment badge
- Decisions list
- Action items with checkbox toggle, assignee, and due date
- "Run AI Analysis" button for meetings that have transcript but no summary
- 5-second polling while status is `"processing"`

### Search (`/search`)
- Natural language query field
- AI-generated synthesised answer card
- Ranked source excerpts with `transcript` / `summary` / `action_item` type badges
- Relevance score and link to source meeting

### Auth Pages
- **Login** (`/login`) — email/password with show/hide toggle and "Forgot password?" link
- **Register** (`/register`) — with live password strength meter (length, uppercase, number)
- **Forgot Password** (`/forgot-password`) — sends branded reset email; never reveals whether email exists
- **Reset Password** (`/reset-password?token=...`) — validates token, sets new password, invalidates all sessions

---

## Troubleshooting

### "Authentication required." on upload
The XHR in `uploadAudio` must call `xhr.open()` before `xhr.setRequestHeader()`. Verify your `api.ts` sets the Authorization header after opening the request.

### Transcription returns empty / single speaker
ElevenLabs may not return utterances for very short or low-quality audio. The pipeline falls back to 15-word chunks labelled as a single speaker. Use higher quality audio (16kHz+, clear speech) for diarization.

### Groq returns malformed JSON
The model occasionally wraps JSON in markdown code fences. `grokService.ts` strips these with a regex extraction before parsing. If analysis still fails, check the server logs for the raw model response.

### Pinecone upsert fails
Pinecone errors are non-fatal in the pipeline — the meeting will still be saved as `completed`. Check that `PINECONE_INDEX_NAME` matches your actual index name and that the index dimension matches the embedding model output.

### "mixtral-8x7b-32768" model error
This model was deprecated by Groq in early 2025. Ensure `grokService.ts` uses `llama-3.3-70b-versatile` as the primary model.

### Video files fail to process
Ensure `ffmpeg` is installed and accessible on `$PATH`. Test with `ffmpeg -version`.

### Email not sending
For Gmail, use an **App Password** (not your regular password). Enable 2-Step Verification first, then generate an App Password under Google Account → Security.

---

## License

MIT — see [LICENSE](./LICENSE) for details.
