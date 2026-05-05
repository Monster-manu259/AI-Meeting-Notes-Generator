

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";


// async function request<T>(
//   path: string,
//   options: RequestInit = {}
// ): Promise<T> {
//   const res = await fetch(`${BASE_URL}${path}`, {
//     ...options,
//     headers: {
//       "Content-Type": "application/json",
//       ...options.headers,
//     },
//   });

//   const data = await res.json();

//   if (!res.ok || !data.success) {
//     throw new Error(data.error ?? `Request failed: ${res.status}`);
//   }

//   return data.data as T;
// }

function getToken(): string | null {
  return localStorage.getItem("meetingmind_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await res.json();

  if (res.status === 401) {
    localStorage.removeItem("meetingmind_token");
    localStorage.removeItem("meetingmind_user");
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!res.ok || !data.success) {
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }

  return data.data as T;
}

export const meetingsApi = {
  getAll: (params?: { status?: string; search?: string }) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return request<Meeting[]>(`/api/meetings${qs}`);
  },

  getById: (id: string) => request<MeetingWithDetails>(`/api/meetings/${id}`),

  create: (body: CreateMeetingBody) =>
    request<Meeting>("/api/meetings", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: UpdateMeetingBody) =>
    request<Meeting>(`/api/meetings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  delete: (id: string) =>
    request<void>(`/api/meetings/${id}`, { method: "DELETE" }),


uploadAudio: (id: string, file: File, onProgress?: (pct: number) => void) => {
  return new Promise<{ filePath: string; meetingId: string }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append("audio", file);

      const token = localStorage.getItem("meetingmind_token");
      if (token) {
        xhr.open("POST", `${BASE_URL}/api/meetings/${id}/upload`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      } else {
        xhr.open("POST", `${BASE_URL}/api/meetings/${id}/upload`);
      }

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }

      xhr.onload = () => {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status === 401) {
          localStorage.removeItem("meetingmind_token");
          localStorage.removeItem("meetingmind_user");
          window.location.href = "/login";
          reject(new Error("Session expired"));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          resolve(data.data);
        } else {
          reject(new Error(data.error ?? "Upload failed"));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));

      xhr.send(formData);
    }
  );
},
};

export interface LoginResponse {
  user: { id: string; name: string; email: string };
  token: string;
}

export const authApi = {
  register: (body: { name: string; email: string; password: string }) =>
    request<LoginResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  logout: () =>
    request<void>("/api/auth/logout", { method: "POST" }),

  me: () =>
    request<{ id: string; name: string; email: string }>("/api/auth/me"),

  forgotPassword: (email: string) =>
    request<void>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<void>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
};

export const actionItemsApi = {
  getAll: (meetingId: string) =>
    request<ActionItem[]>(`/api/meetings/${meetingId}/action-items`),

  create: (meetingId: string, body: { text: string; assignee: string; due_date?: string }) =>
    request<ActionItem>(`/api/meetings/${meetingId}/action-items`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  toggle: (meetingId: string, itemId: string) =>
    request<ActionItem>(`/api/meetings/${meetingId}/action-items/${itemId}/toggle`, {
      method: "PATCH",
    }),

  delete: (meetingId: string, itemId: string) =>
    request<void>(`/api/meetings/${meetingId}/action-items/${itemId}`, {
      method: "DELETE",
    }),
};


export const searchApi = {
  query: (query: string, limit = 5) =>
    request<{ answer: string; results: SearchResult[] }>("/api/search", {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    }),

  stats: () =>
    request<{ totalVectors: number; dimension: number }>("/api/search/stats"),
};


export const aiApi = {
  analyzeMeeting: (meetingId: string) =>
    request<AIAnalysis>(`/api/ai/analyze/${meetingId}`, { method: "POST" }),

  indexMeeting: (meetingId: string) =>
    request<{ vectorCount: number }>(`/api/ai/index/${meetingId}`, { method: "POST" }),
};

export const statsApi = {
 get: () => request<DashboardStats>("/api/meetings/stats"),
};

export type MeetingStatus = "completed" | "processing" | "scheduled";

export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: string | null;
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

export interface SearchResult {
  meeting_id: string;
  meeting_title: string;
  meeting_date: string;
  excerpt: string;
  score: number;
  type: "transcript" | "summary" | "action_item";
}

export interface AIAnalysis {
  summary: string;
  action_items: Array<{ text: string; assignee: string; due_date?: string }>;
  decisions: string[];
  key_topics: string[];
  sentiment: "positive" | "neutral" | "negative";
}

export type CreateMeetingBody = {
  title: string;
  date: string;
  participants: string[];
  tags?: string[];
  status?: MeetingStatus;
  duration?: string;
};

export interface DashboardStats {
  totalMeetings: number;
  totalHours: number;
  actionItemsCompleted: number;
  actionItemsPending: number;
}

export type UpdateMeetingBody = Partial<CreateMeetingBody & { summary: string }>;