import { View, Text, ActivityIndicator } from 'react-native';
import { colors, spacing } from '../theme';

type ThinkingIndicatorProps = {
  text?: string;
};

export function ThinkingIndicator({ text = 'Thinking…' }: ThinkingIndicatorProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.sm,
        gap: spacing.sm,
      }}
    >
      <ActivityIndicator size="small" color={colors.textMuted} />
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{text}</Text>
    </View>
  );
}