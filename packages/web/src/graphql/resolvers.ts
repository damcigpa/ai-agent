import { auth } from "../../auth";
import {
  getChatHistory,
  getChatHistoryBySession,
  deleteChatHistoryItem,
} from "../lib/chatHistory";
import { getUserById } from "../lib/users";

export const resolvers = {
  Query: {
    chatHistory: async (_parent: unknown, args: { limit?: number }) => {
      // Same auth() pattern as every REST route — GraphQL doesn't change
      // WHO is allowed to call this, only HOW the request/response is shaped.
      const session = await auth();
      if (!session?.user?.id) {
        throw new Error("Unauthorized");
      }
      return getChatHistory(session.user.id, args.limit ?? 20);
    },

    chatHistoryBySession: async (
      _parent: unknown,
      args: { sessionId: string }
    ) => {
      const session = await auth();
      if (!session?.user?.id) {
        throw new Error("Unauthorized");
      }

      const items = await getChatHistoryBySession(args.sessionId);

      // The SessionIndex GSI queries by sessionId ALONE — it has no
      // concept of userId. Without this check, ANY authenticated user
      // could read ANY other user's session just by supplying its
      // sessionId (a plain UUID, not a secret). Verify every returned
      // item actually belongs to the CALLER before returning anything —
      // same ownership principle as deleteChatHistoryItem, applied here
      // to a read instead of a write.
      if (items.some((item) => item.userId !== session.user!.id)) {
        throw new Error("Forbidden");
      }

      return items;
    },

    me: async () => {
      const session = await auth();
      if (!session?.user?.id) {
        throw new Error("Unauthorized");
      }
      return getUserById(session.user.id);
    },
  },

  Mutation: {
    deleteChatHistoryItem: async (
      _parent: unknown,
      args: { createdAt: string }
    ) => {
      const session = await auth();
      if (!session?.user?.id) {
        throw new Error("Unauthorized");
      }

      // userId comes ONLY from the session — never from args — this is
      // exactly what prevents deleting another user's item.
      await deleteChatHistoryItem(session.user.id, args.createdAt);
      return true;
    },
  },
};