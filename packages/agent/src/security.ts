// --- Prompt injection patterns ---

const INJECTION_PATTERNS = [
    /ignore (all |previous )?instructions/i,
    /forget (your |all )?instructions/i,
    /you are now/i,
    /new persona/i,
    /disregard/i,
    /system prompt/i,
    /override/i,
    /jailbreak/i,
    /act as/i,
    /pretend (you are|to be)/i,
    /your new (role|task|job|instructions)/i,
  ];
  
  // --- Sanitize user input ---
  
  export function sanitizeInput(input: string): string | null {
    const isSuspicious = INJECTION_PATTERNS.some((p) => p.test(input));
    if (isSuspicious) {
      console.warn(`⚠️  Suspicious input detected and blocked: "${input.slice(0, 50)}..."`);
      return null;
    }
    return input;
  }
  
  // --- Sanitize search results ---
  
  export function sanitizeSearchResults(results: string): string {
    let sanitized = results;
    for (const pattern of INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, "[removed]");
    }
    return sanitized;
  }