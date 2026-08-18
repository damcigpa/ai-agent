"use client";

import { useState, useRef, useEffect } from "react";
import { useChat as useChatHook } from "../hooks/useChat";
import { Message, MessageStructure } from "../types/chat";
import { QuizPanel } from "./QuizPanel";

// --- Parts ---

function ChatStructure({ structure }: { structure?: MessageStructure }) {
  if (!structure) return null;

  return (
    <div className="mt-3 space-y-2 text-sm border-t pt-3">
      {(structure.keyPoints?.length ?? 0) > 0 && (
        <div>
          <p className="font-medium text-gray-700 mb-1">Key Points</p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            {structure.keyPoints.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      )}
      {structure.significance && (
        <div className="bg-blue-50 rounded-lg p-2 text-blue-700">
          <p className="font-medium mb-1">Significance</p>
          <p>{structure.significance}</p>
        </div>
      )}
      {(structure.furtherReading?.length ?? 0) > 0 && (
        <div>
          <p className="font-medium text-gray-700 mb-1">Further Reading</p>
          <ul className="list-disc list-inside space-y-1 text-gray-500">
            {structure.furtherReading.map((topic, i) => (
              <li key={i}>{topic}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChatMessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.isStreaming && (
          <span className="inline-block w-1 h-4 bg-gray-400 animate-pulse ml-1" />
        )}
        {!isUser && <ChatStructure structure={message.structure} />}
      </div>
    </div>
  );
}

function Messages({
  messages,
  progress,
}: {
  messages: Message[];
  progress: string;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, progress]);

  return (
    <div className="flex-1 overflow-y-auto space-y-4 mb-4">
      {messages.length === 0 && (
        <div className="text-center text-gray-400 mt-20">
          Ask a question about history or literature
        </div>
      )}

      {messages.map((msg, i) => (
        <ChatMessageBubble key={i} message={msg} />
      ))}

      {progress && (
        <div className="flex justify-start">
          <div className="bg-gray-50 border rounded-2xl px-4 py-2 text-sm text-gray-500">
            {progress}
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

function Input({
  isLoading,
  sendMessage,
  cancel,
}: {
  isLoading: boolean;
  sendMessage: (input: string) => void;
  cancel: () => void;
}) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        placeholder="Ask about history or literature..."
        disabled={isLoading}
        className="flex-1 border rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50"
      />
      {isLoading ? (
        <button
          onClick={cancel}
          className="bg-red-500 text-white px-4 py-2 rounded-xl hover:bg-red-600"
        >
          Stop ■
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600 disabled:opacity-50"
        >
          Send →
        </button>
      )}
    </div>
  );
}

// --- Public export ---
// ChatApp is now the messages+input body ONLY. It does NOT render <AppHeader />.
// page.tsx renders <AppHeader /> and <ChatApp /> as siblings, both standalone.
//
// NOTE: this assumes useChatHook() returns a `sessionId` field. If it
// doesn't yet, useChat.ts needs that added — sessionId is generated
// client-side (via useEffect, since sessionStorage isn't available during
// SSR), so it's undefined/null for a brief moment on first mount. The
// `sessionId &&` guard below prevents QuizPanel from calling
// /api/quiz/start with an undefined session in that window.

export function ChatApp() {
  const { messages, isLoading, progress, sendMessage, cancel, sessionId } =
    useChatHook();

  return (
    <>
      <Messages messages={messages} progress={progress} />
      <Input isLoading={isLoading} sendMessage={sendMessage} cancel={cancel} />
      {sessionId && <QuizPanel sessionId={sessionId} />}
    </>
  );
}