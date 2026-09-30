import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveSession, loadSessions } from './storage';
import { StoredSession } from '../types/chat';

describe('storage', () => {
  const mockSession: StoredSession = {
    id: '1',
    title: 'Test session',
    date: '2026-09-19',
    messages: [{ id: 'm1', role: 'user', text: 'Hello' }],
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('saves a session and can load it back', async () => {
    await saveSession(mockSession);

    const sessions = await loadSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('1');
    expect(sessions[0].title).toBe('Test session');
  });

  it('returns an empty array when nothing has been saved yet', async () => {
    const sessions = await loadSessions();
    expect(sessions).toEqual([]);
  });

  it('replaces an existing session with the same id instead of duplicating it', async () => {
    await saveSession(mockSession);
    await saveSession({ ...mockSession, title: 'Updated title' });

    const sessions = await loadSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('Updated title');
  });
});