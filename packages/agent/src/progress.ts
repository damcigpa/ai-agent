// --- Stream event types ---

export type StreamEvent =
  | { type: "progress"; data: string }
  | { type: "chunk"; data: string }
  | { type: "done"; data: string }
  | { type: "structure"; data: string }
  | { type: "error"; data: string };

// --- Progress event types ---

export type ProgressEvent =
  | "detecting_subject"
  | "planning"
  | "searching"
  | "fetching_page"
  | "verifying"
  | "analyzing"
  | "explaining"
  | "retrying"
  | "escalating"
  | "adapting_plan"
  | "done";

export const PROGRESS_MESSAGES: Record<ProgressEvent, string> = {
  detecting_subject: "🔍 Detecting subject and planning steps...",
  planning:          "📋 Planning...",
  searching:         "🌐 Searching for information...",
  fetching_page:     "📄 Reading full article...",
  verifying:         "✅ Verifying findings...",
  analyzing:         "📖 Analyzing...",
  explaining:        "💡 Generating explanation...",
  retrying:          "🔄 Retrying search...",
  escalating:        "🔺 Escalating to broader search...",
  adapting_plan:     "🔄 Adapting plan...",
  done:              "✅ Done",
};

// --- Pure helpers — no shared/global state, safe under concurrency ---

export function formatProgress(event: ProgressEvent, detail?: string): string {
  const message = PROGRESS_MESSAGES[event];
  return detail ? `${message} ${detail}` : message;
}

export function progressEvent(event: ProgressEvent, detail?: string): StreamEvent {
  return { type: "progress", data: formatProgress(event, detail) };
}
