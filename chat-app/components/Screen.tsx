import { ReactNode } from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { colors, spacing } from '../theme';

type ScreenProps = {
  children: ReactNode;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Screen({ children, padded = false, style }: ScreenProps) {
  return (
    <View
      style={[
        { flex: 1, backgroundColor: colors.background },
        padded && { padding: spacing.lg },
        style,
      ]}
    >
      {children}
    </View>
  );
}
