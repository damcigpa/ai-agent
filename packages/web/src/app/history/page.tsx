import { auth } from "../../../auth";
import { HistoryList } from "../../components/HistoryList";

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
      <h1 className="text-xl font-semibold mb-4">Your Chat History</h1>
      <HistoryList />
    </main>
  );
}
