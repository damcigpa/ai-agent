import { Pressable, Text } from 'react-native';
import { colors, spacing } from '../theme';

type QuizButtonProps = {
  onPress: () => void;
};

export function QuizButton({ onPress }: QuizButtonProps) {
  return (
    <Pressable style={{ paddingRight: spacing.lg }} onPress={onPress}>
      <Text style={{ color: colors.primary, fontWeight: '600' }}>Quiz</Text>
    </Pressable>
  );
}
