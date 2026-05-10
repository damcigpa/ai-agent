// --- Shared types across the project ---

export type Subject =
  | "literature"
  | "history"
  | "science"
  | "literary_analysis"
  | "hungarian_history"
  | "hungarian_literature"
  | "general";

export interface ResearchFindings {
  author: string;
  work: string;
  date: string;
  context: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
  subject?: Subject;
  keyFacts?: string[];
  escalate?: boolean;
  escalateReason?: string;
}

export type LiteratureSubject = Extract<Subject, "literature" | "literary_analysis" | "hungarian_literature">;