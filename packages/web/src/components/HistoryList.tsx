"use client";

import { useEffect, useState } from "react";

interface ChatHistoryItem {
  userId: string;
  createdAt: string;
  question: string;
  answer: string;
}

export function HistoryList() {
  const [history, setHistory] = useState<ChatHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      try {
        const res = await fetch("/api/history");

        if (res.status === 401) {
          setError("Please log in to see your history.");
          return;
        }

        if (!res.ok) {
          setError("Failed to load history.");
          return;
        }

        const data: ChatHistoryItem[] = await res.json();
        if (!cancelled) setHistory(data);
      } catch {
        if (!cancelled) setError("Failed to load history.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchHistory();
    return () => {
      cancelled = true; // avoid setting state after unmount
    };
  }, []);

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading history...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }

  if (history.length === 0) {
    return <p className="text-sm text-gray-400">No history yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {history.map((item, i) => (
        <div key={i} className="border rounded-xl p-3 text-sm">
          <p className="font-medium text-gray-800">{item.question}</p>
          <p className="text-gray-600 mt-1 line-clamp-3">{item.answer}</p>
          <p className="text-xs text-gray-400 mt-2">
            {new Date(item.createdAt).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
