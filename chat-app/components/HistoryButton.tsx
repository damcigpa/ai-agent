import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';

type HistoryButtonProps = {
  onPress: () => void;
};

export function HistoryButton({ onPress }: HistoryButtonProps) {
  return (
    <Pressable style={{ paddingLeft: spacing.lg }} onPress={onPress}>
      <Ionicons name="time-outline" size={22} color={colors.text} />
    </Pressable>
  );
}
