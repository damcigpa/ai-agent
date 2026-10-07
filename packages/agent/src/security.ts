// --- Prompt injection patterns ---
//
// A short list of regex rules that catch the most common ways an attacker tries to
// talk the model into ignoring its instructions. English and Hungarian variants are
// kept side by side so a Hungarian note is not left undefended.
//
// This is a cheap second net. The main defense is content isolation: external text
// (notes, web search results, fetched pages) is wrapped in tags, and the spoke prompt
// tells the model to treat tagged content as data, not instructions.

const INJECTION_PATTERNS = [
  // English
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
  // Hungarian
  /ne (figyelj|kövesd|hallgass)( .*)? (az |a )?(utasítás|rendszer|promt|prompt)/i,
  /felejtsd el (az |a )?(utasítás|minden|korábbi)/i,
  /mostantól (te vagy|olyan vagy)/i,
  /új (szerep|szerepkör|feladat|utasítás|identitás)/i,
  /rendszer[- ]?prompt/i,
  /vedd fel (az |a )?.* szerepét/i,
  /tégy úgy, mintha/i,
  /csinálj úgy, mintha/i,
];

// --- Sanitize user input ---
//
// For the student's own message. A matched pattern blocks the message; the agent
// shows a short refusal (handled by the caller). The classifier is the second check.

export function sanitizeInput(input: string): string | null {
  const isSuspicious = INJECTION_PATTERNS.some((p) => p.test(input));
  if (isSuspicious) {
    console.warn(`⚠️  Suspicious input detected and blocked: "${input.slice(0, 50)}..."`);
    return null;
  }
  return input;
}

// --- Sanitize external text ---
//
// For anything the agent reads from outside the kernel: a web search snippet, a
// fetched page, a note excerpt. A matched phrase is replaced with [removed], so the
// surrounding text (the actual study material) still reaches the model.

export function sanitizeExternalText(text: string): string {
  let sanitized = text;
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[removed]");
  }
  return sanitized;
}

// Kept so the existing webSearch tool still compiles; new code uses sanitizeExternalText.
export const sanitizeSearchResults = sanitizeExternalText;

// --- URL allowlist for fetch_page ---
//
// Only public HTTPS URLs may be fetched. Private, loopback and link-local addresses
// are refused on the string alone (no DNS lookup), so a hostname that happens to
// resolve to an internal address still goes through — this is a cheap check against
// a malicious prompt that smuggles "fetch_page(https://10.0.0.5/admin)" past the model.

const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^0\.0\.0\.0$/,
];

export function isAllowedUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (!host) return false;
  // IPv6 literals are refused outright — the rare legitimate case is not worth the
  // range-check surface here.
  if (host.startsWith("[")) return false;
  // Reject localhost and the ".local" / ".internal" suffixes often used on LANs.
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  // Literal IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return !PRIVATE_IPV4.some((p) => p.test(host));
  }
  return true;
}