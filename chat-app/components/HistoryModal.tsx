import { Modal, Pressable, Text, FlatList, View } from 'react-native';

import { Screen } from './Screen';
import { colors, spacing, radius } from '../theme';
import { ChatSession } from '../types/chat';
import { SwipeToDeleteRow } from './SwipeDeleteRow';

type HistoryModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (session: ChatSession) => void;
  sessions: ChatSession[];
};

export function HistoryModal({ visible, onClose, onSelectSession, onDeleteSession, sessions }: HistoryModalProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen padded>
        <Pressable onPress={onClose}>
          <Text style={{ color: colors.primary, fontSize: 16, marginBottom: spacing.lg }}>Close</Text>
        </Pressable>

        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={() => (
            <Text style={{ color: colors.textMuted }}>No past chats yet.</Text>
          )}
         renderItem={({ item }) => (
            <SwipeToDeleteRow session={item} onSelect={onSelectSession} onDelete={onDeleteSession} />
)}
        />
      </Screen>
    </Modal>
  );
}