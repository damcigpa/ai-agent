import { StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';

export const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  bubble: {
    padding: spacing.md,
    borderRadius: radius.md,
  },
  userBubble: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-start',
  },
  bubbleText: {
    color: colors.text,
    ...typography.body,
  },
});
