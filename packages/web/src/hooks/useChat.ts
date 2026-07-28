"use client";

import { useState, useRef } from "react";
import { Message, StreamEvent } from "../types/chat";
import { useModel } from "./useModel";

const SSE_DATA_PREFIX = "data: ";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const { model } = useModel(); // shared with <ModelSelector /> via ModelProvider
  const abortController = useRef<AbortController | null>(null);

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
        body: JSON.stringify({ message: input, model }),
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

  return {
    messages,
    isLoading,
    progress,
    sendMessage,
    cancel,
  };
}
