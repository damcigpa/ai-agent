import { Modal, Pressable, Text, FlatList, View } from 'react-native';
import { Screen } from './Screen';
import { colors, spacing, radius } from '../theme';

export type ChatSession = {
  id: string;
  title: string;
  date: string;
};

type HistoryModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelectSession: (session: ChatSession) => void;
  sessions: ChatSession[];
};

export function HistoryModal({ visible, onClose, onSelectSession, sessions }: HistoryModalProps) {
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
            <Pressable
              style={{ backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md }}
              onPress={() => onSelectSession(item)}
            >
              <Text style={{ color: colors.text, fontSize: 16 }}>{item.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{item.date}</Text>
            </Pressable>
          )}
        />
      </Screen>
    </Modal>
  );
}