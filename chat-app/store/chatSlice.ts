import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Message, StoredSession } from '../types/chat';
import { saveSession as dbSaveSession, loadSessions as dbLoadSessions } from '../lib/storage';


export const fetchSessions = createAsyncThunk('chat/fetchSessions', async () => {
  return await dbLoadSessions();
});

export const restoreLastSession = createAsyncThunk('chat/restoreLastSession', async () => {
  const sessions = await dbLoadSessions();
  return sessions.length > 0 ? sessions[0] : null;
});

export const persistCurrentSession = createAsyncThunk(
  'chat/persistCurrentSession',
  async (session: StoredSession) => {
    await dbSaveSession(session);
    return session;
  }
);

type ChatState = {
  messages: Message[];
  sessions: StoredSession[];
  historyVisible: boolean;
  sessionId: string;
};

const initialState: ChatState = {
  messages: [{ id: '1', role: 'assistant', text: 'Hi! Ask me anything about your exam topics.' }],
  sessions: [],
  historyVisible: false,
  sessionId: Date.now().toString(),
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    messageAdded: (state, action: PayloadAction<Message>) => {
      state.messages.push(action.payload);
    },
    messagesSet: (state, action: PayloadAction<Message[]>) => {
      state.messages = action.payload;
    },
    historyVisibleSet: (state, action: PayloadAction<boolean>) => {
      state.historyVisible = action.payload;
    },
    sessionIdSet: (state, action: PayloadAction<string>) => {
      state.sessionId = action.payload;
    },
    newChatStarted: (state) => {
      state.messages = [{ id: '1', role: 'assistant', text: 'Hi! Ask me anything about your exam topics.' }];
      state.sessionId = Date.now().toString();
  },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSessions.fulfilled, (state, action) => {
        state.sessions = action.payload;
      })
      .addCase(restoreLastSession.fulfilled, (state, action) => {
        if (action.payload) {
          state.messages = action.payload.messages;
          state.sessionId = action.payload.id;
        }
      });
  },
});

export const { messageAdded, messagesSet, historyVisibleSet, sessionIdSet, newChatStarted } = chatSlice.actions;
export default chatSlice.reducer;