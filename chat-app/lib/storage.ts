import AsyncStorage from '@react-native-async-storage/async-storage';
import { StoredSession } from '../types/chat';

const SESSIONS_KEY = 'chat_sessions';

export async function saveSession(session: StoredSession): Promise<void> {
  const existing = await loadSessions();
  const withoutThisOne = existing.filter((s) => s.id !== session.id);
  const updated = [session, ...withoutThisOne];
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
}

export async function loadSessions(): Promise<StoredSession[]> {
  const raw = await AsyncStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredSession[];
  } catch {
    return [];
  }
}