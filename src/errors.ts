// --- Error codes ---

export type ErrorCode =
  | "SEARCH_FAILED"
  | "PARSE_FAILED"
  | "FILE_READ_FAILED"
  | "FILE_WRITE_FAILED"
  | "HUB_FAILED"
  | "SPOKE_FAILED"
  | "MAX_TURNS_REACHED"
  | "DECOMPOSITION_FAILED"
  | "REPLAN_FAILED"
  | "COVERAGE_FAILED"
  | "AGGREGATION_FAILED"
  | "API_FAILED";

// --- Spoke names ---

export type Spoke = "hub" | "searchSpoke" | "fileSpoke" | "webSearch" | "agent";

// --- Error shape ---

export type AgentError = {
  name: "AgentError";
  code: ErrorCode;
  spoke: Spoke;
  message: string;
  cause?: unknown;
  turn?: number;
};

// --- Factory function ---

export function createError(
  code: ErrorCode,
  spoke: Spoke,
  message: string,
  options?: { cause?: unknown; turn?: number },
): AgentError {
  return {
    name: "AgentError",
    code,
    spoke,
    message,
    cause: options?.cause,
    turn: options?.turn,
  };
}

// --- Type guard ---

export function isAgentError(error: unknown): error is AgentError {
  if (!error || typeof error !== "object") return false;
  return (error as AgentError).name === "AgentError";
}

// --- Format error for logging ---

export function formatError(error: AgentError): string {
  const turn = error.turn !== undefined ? ` (turn ${error.turn})` : "";
  const cause =
    error.cause instanceof Error ? ` — caused by: ${error.cause.message}` : "";
  return `[${error.spoke}] ${error.code}${turn}: ${error.message}${cause}`;
}

// --- Format error for user-facing response ---

export function formatUserError(error: AgentError): string {
  const messages: Record<ErrorCode, string> = {
    SEARCH_FAILED: "I was unable to search for information at this time.",
    PARSE_FAILED: "I received an unexpected response format.",
    FILE_READ_FAILED: "I was unable to read the requested file.",
    FILE_WRITE_FAILED: "I was unable to write the results to a file.",
    HUB_FAILED: "The orchestrator encountered an error.",
    SPOKE_FAILED: "One of the agents encountered an error.",
    MAX_TURNS_REACHED: "The task took too long to complete.",
    DECOMPOSITION_FAILED: "I was unable to plan the task.",
    REPLAN_FAILED: "I was unable to adapt the plan.",
    COVERAGE_FAILED: "I was unable to evaluate the research coverage.",
    AGGREGATION_FAILED: "I was unable to combine the research findings.",
    API_FAILED: "The AI service is currently unavailable.",
  };

  return messages[error.code] ?? "An unexpected error occurred.";
}
