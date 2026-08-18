"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "chatSessionId";

// sessionStorage (not localStorage) deliberately — persists across a
// refresh WITHIN the same tab, but clears when the tab closes, matching
// "one ongoing session" semantics without needing an explicit expiry.
export function useSessionId() {
  const [sessionId, setSessionIdState] = useState<string | null>(null);

  // Runs once, client-side only — sessionStorage doesn't exist during
  // server rendering, so this MUST live inside useEffect, not directly
  // in the component body (which would break on the server).
  useEffect(() => {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) {
      setSessionIdState(existing);
    } else {
      const fresh = crypto.randomUUID();
      sessionStorage.setItem(STORAGE_KEY, fresh);
      setSessionIdState(fresh);
    }
  }, []);

  // Starts a genuinely NEW session — generates a fresh id, overwrites
  // storage, and returns it so the caller can immediately clear/reset
  // the visible messages in the same action.
  const startNewSession = () => {
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, fresh);
    setSessionIdState(fresh);
    return fresh;
  };

  return { sessionId, startNewSession };
}