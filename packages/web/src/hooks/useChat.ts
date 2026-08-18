"use client";

import { useState, useRef, useEffect } from "react";
import { gql } from "@apollo/client";
import { Message, StreamEvent } from "../types/chat";
import { useModel } from "./useModel";
import { useSessionId } from "./useSessionId";
import { apolloClient } from "../lib/apolloClient";

const SSE_DATA_PREFIX = "data: ";

const GET_CHAT_HISTORY_BY_SESSION = gql`
  query GetChatHistoryBySession($sessionId: String!) {
    chatHistoryBySession(sessionId: $sessionId) {
      question
      answer
    }
  }
`;

interface SessionHistoryItem {
  question: string;
  answer: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const { model } = useModel(); // shared with <ModelSelector /> via ModelProvider
  const { sessionId, startNewSession } = useSessionId();
  const abortController = useRef<AbortController | null>(null);

  // Runs once sessionId becomes available (it starts null — see useSessionId's
  // own comment on why). Restores a CONTINUING session's messages, or does
  // nothing for a genuinely fresh one (the query just returns an empty array).
  // This is what actually fixes "refresh wipes the chat".
  useEffect(() => {
    if (!sessionId) return;

    apolloClient
      .query<{ chatHistoryBySession: SessionHistoryItem[] }>({
        query: GET_CHAT_HISTORY_BY_SESSION,
        variables: { sessionId },
        fetchPolicy: "network-only", // always get the current, real state on
        // load — NOT Apollo's cache, which
        // wouldn't have this data yet anyway
      })
      .then((res) => {
        if (!res.data) return;

        const restored: Message[] = res.data.chatHistoryBySession.flatMap(
          (item) => [
            { role: "user" as const, content: item.question },
            { role: "assistant" as const, content: item.answer },
          ]
        );
        if (restored.length > 0) {
          setMessages(restored);
        }
      })
      .catch((e) => {
        console.error("[useChat] failed to restore session history:", e);
      });
    // deliberately only re-runs when sessionId itself changes (e.g., a
    // future "New Chat" click) — not on every render
  }, [sessionId]);

  async function restoreSessionHistory(
    sessionId: string
  ): Promise<Message[] | null> {
    try {
      const res = await apolloClient.query<{ chatHistoryBySession: SessionHistoryItem[] }>({
        query: GET_CHAT_HISTORY_BY_SESSION,
        variables: { sessionId },
        fetchPolicy: "network-only",
      });

      if (!res.data) return null;

      return res.data.chatHistoryBySession.flatMap((item) => [
        { role: "user" as const, content: item.question },
        { role: "assistant" as const, content: item.answer },
      ]);
    } catch (e) {
      console.error("[useChat] failed to restore session history:", e);
      return null;
    }
  }

  useEffect(() => {
    if (!sessionId) return;

    restoreSessionHistory(sessionId).then((restored) => {
      if (restored && restored.length > 0) setMessages(restored);
    });
  }, [sessionId]);

  const appendToLastMessage = (text: string) => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant") {
        updated[updated.length - 1] = {
          ...last,
          content: last.content + text,
        };
      }
      return updated;
    });
  };

  const finalizeLastMessage = (content: string) => {
    setMessages((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        role: "assistant",
        content,
        isStreaming: false,
      };
      return updated;
    });
  };

  const addStructureToLastMessage = (structure: Message["structure"]) => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant") {
        updated[updated.length - 1] = { ...last, structure };
      }
      return updated;
    });
  };

  const handleEvent = (event: StreamEvent) => {
    switch (event.type) {
      case "progress":
        setProgress(event.data);
        break;
      case "chunk":
        appendToLastMessage(event.data);
        break;
      case "done":
        finalizeLastMessage(event.data);
        setProgress("");
        break;
      case "structure":
        try {
          addStructureToLastMessage(JSON.parse(event.data));
        } catch {
          // ignore malformed structure
        }
        break;
      case "error":
        finalizeLastMessage(`Error: ${event.data}`);
        setProgress("");
        break;
    }
  };

  const sendMessage = async (input: string) => {
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setProgress("");

    setMessages((prev) => [
      ...prev,
      { role: "user", content: input },
      { role: "assistant", content: "", isStreaming: true },
    ]);

    abortController.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, model, sessionId }),
        signal: abortController.current.signal,
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        for (const line of text.split("\n")) {
          if (!line.startsWith(SSE_DATA_PREFIX)) continue;
          try {
            handleEvent(JSON.parse(line.slice(SSE_DATA_PREFIX.length)) as StreamEvent);
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: last.content || "Cancelled.",
              isStreaming: false,
            };
          }
          return updated;
        });
      }
    } finally {
      setIsLoading(false);
      setProgress("");
      abortController.current = null;
    }
  };

  const cancel = () => {
    abortController.current?.abort();
  };

  // Clears the visible conversation and starts a genuinely fresh session —
  // ready for the (still deferred) "New Chat" button UI to call.
  const newChat = () => {
    startNewSession();
    setMessages([]);
  };

  return {
    messages,
    isLoading,
    progress,
    sendMessage,
    cancel,
    newChat,
    sessionId,
  };
}