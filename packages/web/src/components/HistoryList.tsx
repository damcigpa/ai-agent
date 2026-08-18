"use client";

import { gql } from "@apollo/client";
import { useQuery, useMutation } from "@apollo/client/react";

// The GraphQL query itself — this is what gets sent to /api/graphql.
// Notice you specify EXACTLY which fields you want (question, createdAt) —
// unlike the REST version, which always returned the full object shape.
const GET_CHAT_HISTORY = gql`
  query GetChatHistory {
    chatHistory {
      question
      answer
      createdAt
    }
  }
`;

const DELETE_CHAT_HISTORY_ITEM = gql`
  mutation DeleteChatHistoryItem($createdAt: String!) {
    deleteChatHistoryItem(createdAt: $createdAt)
  }
`;

interface ChatHistoryItem {
  question: string;
  answer: string;
  createdAt: string;
}

interface ChatHistoryData {
  chatHistory: ChatHistoryItem[];
}

export function HistoryList() {
  // useQuery replaces the ENTIRE useEffect + useState + fetch dance from before.
  // Apollo handles loading state, error state, AND caching, all automatically.
  const { data, loading, error } = useQuery<ChatHistoryData>(GET_CHAT_HISTORY);

  const [deleteItem] = useMutation(DELETE_CHAT_HISTORY_ITEM, {
    update: (cache, _result, { variables }) => {
      // read what's CURRENTLY in the cache for this exact query
      const existing = cache.readQuery<ChatHistoryData>({ query: GET_CHAT_HISTORY });
      if (!existing) return;

      // write back the SAME list, minus the deleted item — purely local,
      // no network request involved
      cache.writeQuery({
        query: GET_CHAT_HISTORY,
        data: {
          chatHistory: existing.chatHistory.filter(
            (item) => item.createdAt !== variables?.createdAt
          ),
        },
      });
    },
  });

  const handleDelete = (e: React.MouseEvent<HTMLDivElement>) => {
    // the click can land on the card OR any of its children (p tags) —
    // currentTarget is always the element the LISTENER was attached to,
    // so this reliably reads the card's own data-created-at attribute
    // regardless of which inner element was actually clicked
    const createdAt = e.currentTarget.dataset.createdAt;
    if (!createdAt) return;

    deleteItem({ variables: { createdAt } });
  };

  if (loading) {
    return <p className="text-sm text-gray-400">Loading history...</p>;
  }

  if (error) {
    // GraphQL errors (like our resolver's "Unauthorized" throw) surface here
    return <p className="text-sm text-red-500">{error.message}</p>;
  }

  const history = data?.chatHistory ?? [];

  if (history.length === 0) {
    return <p className="text-sm text-gray-400">No history yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {history.map((item, i) => (
        <div
          key={i}
          data-created-at={item.createdAt}
          onClick={handleDelete}
          title="Click to delete"
          className="border rounded-xl p-3 text-sm cursor-pointer hover:bg-red-50 hover:border-red-200 transition-colors"
        >
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
