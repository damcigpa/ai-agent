export type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export type ChatSession = {
  id: string;
  title: string;
  date: string;
};

export type StoredSession = ChatSession & {
  messages: Message[];
};