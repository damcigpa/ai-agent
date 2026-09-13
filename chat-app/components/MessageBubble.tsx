import { useRef, useEffect } from 'react';
import { Animated, Text, Pressable, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors, spacing, radius, typography } from '../theme';
import { Message } from '../types/chat';

type MessageBubbleProps = {
  message: Message;
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  async function handleLongPress() {
    await Clipboard.setStringAsync(message.text);
    Alert.alert('Copied', 'The message has been copied to the clipboard.');
  }

  return (
    <Animated.View
      style={[
        { opacity, transform: [{ translateY }] },
        message.role === 'user'
          ? { alignSelf: 'flex-end' }
          : { alignSelf: 'flex-start' },
      ]}
    >
      <Pressable
        onLongPress={handleLongPress}
        style={[
          { padding: spacing.md, borderRadius: radius.md },
          message.role === 'user'
            ? { backgroundColor: colors.primary }
            : { backgroundColor: colors.surfaceAlt },
        ]}
      >
        <Text style={{ color: colors.text, ...typography.body }}>{message.text}</Text>
      </Pressable>
    </Animated.View>
  );
}