// --- Shared types across the project ---

export type Subject =
  | "literature"
  | "history"
  | "science"
  | "literary_analysis"
  | "hungarian_history"
  | "hungarian_literature"
  | "general";

// One point where the student's material and the web sources disagree (Contradictions are shown, never silently resolved).
export interface Contradiction {
  material: string; // what the student's material says
  file: string; // the material file it is in
  web: string; // what the web sources say
  likelyCorrect: "material" | "web" | "unclear"; // "unclear" unless the web research was highly confident
  reason: string;
}

export interface ResearchFindings {
  author: string;
  work: string;
  date: string;
  context: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
  subject?: Subject;
  keyFacts?: string[];
  // Facts the student's own material states, each with the file it came from.
  materialFacts?: { fact: string; file: string }[];
  // Statements where the material and the web sources disagree (Contradictions are shown, never silently resolved).
  contradictions?: Contradiction[];
  escalate?: boolean;
  escalateReason?: string;
}

export type LiteratureSubject = Extract<Subject, "literature" | "literary_analysis" | "hungarian_literature">;