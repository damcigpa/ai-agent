export const typeDefs = /* GraphQL */ `
  type ChatHistoryItem {
    question: String!
    answer: String!
    createdAt: String!
    sessionId: String!
  }

  type User {
    userId: String!
    email: String!
    name: String!
  }

  type Query { 
    chatHistory(limit: Int): [ChatHistoryItem!]!
    chatHistoryBySession(sessionId: String!): [ChatHistoryItem!]!
    me: User
  }

  type Mutation {
    deleteChatHistoryItem(createdAt: String!): Boolean!
  }
`;