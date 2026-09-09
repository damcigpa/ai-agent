import { useEffect, useLayoutEffect } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { Screen } from '../components/Screen';
import { MessageList } from '../components/MessageList';
import { InputBar } from '../components/InputBar';
import { HistoryButton } from '../components/HistoryButton';
import { QuizButton } from '../components/QuizButton';
import { HistoryModal } from '../components/HistoryModal';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ChatSession } from '../types/chat';
import { RootState, AppDispatch } from '../store/store';
import { View } from 'react-native';
import { newChatStarted } from '../store/chatSlice';
import { NewChatButton } from '../components/NewChatButton';
import {
  messageAdded, messagesSet, historyVisibleSet, sessionIdSet,
  fetchSessions, restoreLastSession, persistCurrentSession,
} from '../store/chatSlice';
import { sendMessage } from '../lib/api';

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const dispatch = useDispatch<AppDispatch>();

  const messages = useSelector((state: RootState) => state.chat.messages);
  const sessions = useSelector((state: RootState) => state.chat.sessions);
  const historyVisible = useSelector((state: RootState) => state.chat.historyVisible);
  const sessionId = useSelector((state: RootState) => state.chat.sessionId);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <HistoryButton
        onPress={() => {
          dispatch(fetchSessions());
          dispatch(historyVisibleSet(true));
        }}
        />
        <NewChatButton onPress={() => dispatch(newChatStarted())} />
        </View>
      ),
      headerRight: () => (
        <QuizButton onPress={() => navigation.navigate('Quiz', { topic: 'Roman History' })} />
      ),
    });
  }, [navigation]);

  useEffect(() => {
    dispatch(restoreLastSession());
  }, []);

  useEffect(() => {
    if (messages.length <= 1) return;
    dispatch(persistCurrentSession({
      id: sessionId,
      title: messages[1]?.text.slice(0, 30) ?? 'New chat',
      date: new Date().toLocaleDateString(),
      messages,
    }));
  }, [messages]);

  async function handleSend(text: string) {
    dispatch(messageAdded({ id: Date.now().toString(), role: 'user', text }));

    try {
      const reply = await sendMessage(text);
      dispatch(messageAdded({ id: Date.now().toString(), role: 'assistant', text: reply }));
    } catch (e) {
      dispatch(messageAdded({
        id: Date.now().toString(),
        role: 'assistant',
        text: 'Sorry, something went wrong reaching the server.',
      }));
    }
  }

  function handleSelectSession(session: ChatSession) {
    const full = sessions.find((s) => s.id === session.id);
    if (full) {
      dispatch(messagesSet(full.messages));
      dispatch(sessionIdSet(full.id));
    }
    dispatch(historyVisibleSet(false));
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1, paddingBottom: insets.bottom }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <MessageList messages={messages} />
        <InputBar onSend={handleSend} />
      </KeyboardAvoidingView>

      <HistoryModal
        visible={historyVisible}
        onClose={() => dispatch(historyVisibleSet(false))}
        onSelectSession={handleSelectSession}
        sessions={sessions}
      />
    </Screen>
  );
}