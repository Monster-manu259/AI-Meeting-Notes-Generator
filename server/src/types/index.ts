// src/types/index.ts

// ─── Domain models (mirror PostgreSQL rows) ───────────────────────────────────

export type MeetingStatus = "completed" | "processing" | "scheduled";

export type SentimentType = "positive" | "neutral" | "negative";

export interface Meeting {
  id: string;
  title: string;
  date: string;           // ISO 8601
  duration: string | null; // e.g. "58 min", "1h 15min"
  participants: string[];
  status: MeetingStatus;
  tags: string[];
  summary: string | null;
  audio_file_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  text: string;
  assignee: string;
  due_date: string | null;
  completed: boolean;
  created_at: string;
}

export interface TranscriptEntry {
  id: string;
  meeting_id: string;
  speaker: string;
  text: string;
  timestamp: string;    
  sequence_order: number;
}

export interface Decision {
  id: string;
  meeting_id: string;
  text: string;
  created_at: string;
}

export interface MeetingWithDetails extends Meeting {
  action_items: ActionItem[];
  transcript: TranscriptEntry[];
  decisions: Decision[];
}

export interface CreateMeetingBody {
  title: string;
  date: string;
  participants: string[];
  tags?: string[];
  status?: MeetingStatus;
}

export interface UpdateMeetingBody {
  title?: string;
  date?: string;
  duration?: string;       
  participants?: string[];
  tags?: string[];
  status?: MeetingStatus;
  summary?: string;
}

export interface CreateActionItemBody {
  text: string;
  assignee: string;
  due_date?: string;
}


export interface SearchQuery {
  query: string;
  limit?: number;
}

export interface SearchResult {
  meeting_id: string;
  meeting_title: string;
  meeting_date: string;
  excerpt: string;
  score: number;
  type: "transcript" | "summary" | "action_item" | "decision";
}

export interface SearchResponse {
  answer: string;
  results: SearchResult[];
}


export interface AIAnalysis {
  summary: string;
  action_items: Array<{
    text: string;
    assignee: string;
    due_date?: string | null;
  }>;
  decisions: string[];
  key_topics: string[];
  sentiment: SentimentType;
}

 
export interface ElevenLabsWord {
  text: string;
  start: number;
  end: number;
  type: "word" | "spacing" | "audio_event";
  speaker_id?: string;
}

export interface ElevenLabsUtterance {
  text: string;
  start: number;
  end: number;
  speaker_id: string;
  words: ElevenLabsWord[];
}

export interface ElevenLabsTranscription {
  text: string;                         
  words: ElevenLabsWord[];
  utterances: ElevenLabsUtterance[];   
  language_code: string;
  language_probability: number;
}

export interface NormalisedSegment {
  speaker: string;   
  text: string;
  timestamp: string;  
  start: number;    
  end: number;
}

 
export interface DashboardStats {
  totalMeetings: number;
  totalHours: number;
  actionItemsCompleted: number;
  actionItemsPending: number;
}

 
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}