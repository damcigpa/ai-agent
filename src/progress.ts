// --- Stream event types ---

export type StreamEvent =
  | { type: "progress"; data: string }
  | { type: "chunk"; data: string }
  | { type: "done"; data: string }
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

// --- Progress emitter ---

type ProgressHandler = (event: ProgressEvent, detail?: string) => void;

let handler: ProgressHandler = defaultHandler;

function defaultHandler(event: ProgressEvent, detail?: string) {
  const messages: Record<ProgressEvent, string> = {
    detecting_subject: "🔍 Detecting subject and planning steps...",
    planning: "📋 Planning...",
    searching: "🌐 Searching for information...",
    fetching_page: "📄 Reading full article...",
    verifying: "✅ Verifying findings...",
    analyzing: "📖 Analyzing...",
    explaining: "💡 Generating explanation...",
    retrying: "🔄 Retrying search...",
    escalating: "🔺 Escalating to broader search...",
    adapting_plan: "🔄 Adapting plan...",
    done: "✅ Done",
  };

  const message = messages[event];
  console.log(detail ? `${message} ${detail}` : message);
}

export function setProgressHandler(h: ProgressHandler) {
  handler = h;
}

export function emit(event: ProgressEvent, detail?: string) {
  handler(event, detail);
}
