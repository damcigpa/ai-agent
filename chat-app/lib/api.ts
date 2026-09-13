import EventSource from "react-native-sse";

const API_URL = "http://localhost:3001";

export type StreamEvent = { type: string; data: string };

export function streamMessage(
  message: string,
  onEvent: (event: StreamEvent) => void,
  onDone: () => void,
  onError: (err: string) => void
) {
  const es = new EventSource(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  es.addEventListener("message", (event) => {
    if (!event.data) return;
    const parsed = JSON.parse(event.data) as StreamEvent;
    onEvent(parsed);
    if (parsed.type === "done" || parsed.type === "error") {
      es.close();
      onDone();
    }
  });

  es.addEventListener("error", () => {
    onError("Connection error");
    es.close();
  });

  return () => es.close();
}