import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';

type NewChatButtonProps = {
  onPress: () => void;
};

export function NewChatButton({ onPress }: NewChatButtonProps) {
  return (
    <Pressable style={{ paddingLeft: spacing.md }} onPress={onPress}>
      <Ionicons name="add-circle-outline" size={22} color={colors.text} />
    </Pressable>
  );
}