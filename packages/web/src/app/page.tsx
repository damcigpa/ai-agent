import { AppHeader } from "../components/AppHeader";
import { ChatApp } from "../components/Chat";

export default function Home() {
  return (
    <main className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      <AppHeader />
      <ChatApp />
    </main>
  );
}
