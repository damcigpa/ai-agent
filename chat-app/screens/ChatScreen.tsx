import { useState, useEffect, useLayoutEffect } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { Screen } from '../components/Screen';
import { MessageList } from '../components/MessageList';
import { InputBar } from '../components/InputBar';
import { HistoryButton } from '../components/HistoryButton';
import { QuizButton } from '../components/QuizButton';
import { NewChatButton } from '../components/NewChatButton';
import { HistoryModal } from '../components/HistoryModal';
import { ThinkingIndicator } from '../components/ThinkingIndicator';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ChatSession } from '../types/chat';
import { RootState, AppDispatch } from '../store/store';
import {
  messageAdded, messagesSet, historyVisibleSet, sessionIdSet,
  fetchSessions, restoreLastSession, persistCurrentSession, newChatStarted, deleteSession
} from '../store/chatSlice';
import { streamMessage } from '../lib/api';

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const dispatch = useDispatch<AppDispatch>();

  const messages = useSelector((state: RootState) => state.chat.messages);
  const sessions = useSelector((state: RootState) => state.chat.sessions);
  const historyVisible = useSelector((state: RootState) => state.chat.historyVisible);
  const sessionId = useSelector((state: RootState) => state.chat.sessionId);

  const [isThinking, setIsThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState('Thinking…');

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

  function handleSend(text: string) {
    dispatch(messageAdded({ id: Date.now().toString(), role: 'user', text }));
    setIsThinking(true);
    setThinkingText('Thinking…');

    streamMessage(
      text,
      (event) => {
        if (event.type === 'progress') {
          setThinkingText(event.data);
        }
        if (event.type === 'done') {
          dispatch(messageAdded({ id: Date.now().toString(), role: 'assistant', text: event.data }));
        }
        if (event.type === 'error') {
          dispatch(messageAdded({ id: Date.now().toString(), role: 'assistant', text: 'Hiba történt.' }));
        }
      },
      () => setIsThinking(false),
      () => {
        dispatch(messageAdded({ id: Date.now().toString(), role: 'assistant', text: 'Kapcsolódási hiba.' }));
        setIsThinking(false);
      }
    );
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
        {isThinking && <ThinkingIndicator text={thinkingText} />}
        <InputBar onSend={handleSend} />
      </KeyboardAvoidingView>

      <HistoryModal
        visible={historyVisible}
        onClose={() => dispatch(historyVisibleSet(false))}
        onSelectSession={handleSelectSession}
        onDeleteSession={(session) => dispatch(deleteSession(session.id))}
        sessions={sessions}
      />
    </Screen>
  );
}