import { Suspense } from "react";
import { auth } from "../../../auth";
import { getChatHistory } from "../../lib/chatHistory";

// The slow, data-fetching piece — isolated into its OWN async component so
// Suspense has something specific to wrap and stream in independently.
async function HistoryData({ userId }: { userId: string }) {
  const history = await getChatHistory(userId);

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

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border rounded-xl p-3 h-16 bg-gray-100" />
      ))}
    </div>
  );
}

// The page itself stays fast and synchronous where possible — only the
// specific slow piece (HistoryData) is wrapped in Suspense. As this page
// grows other independent sections, each can get its OWN Suspense boundary,
// so one slow section never blocks the others from appearing.
export default async function HistoryPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="max-w-2xl mx-auto p-4">
        <p className="text-sm text-gray-500">Please log in to see your history.</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Your Chat History (server-rendered)</h1>

      <Suspense fallback={<HistorySkeleton />}>
        <HistoryData userId={session.user.id} />
      </Suspense>
    </main>
  );
}
