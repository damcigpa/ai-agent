export type Model = "claude-haiku-4-5-20251001" | "claude-sonnet-4-6";

export interface MessageStructure {
  keyPoints: string[];
  significance: string;
  furtherReading: string[];
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  structure?: MessageStructure;
}

export interface StreamEvent {
  type: "progress" | "chunk" | "done" | "structure" | "error";
  data: string;
}
