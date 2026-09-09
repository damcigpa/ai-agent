import { FlatList, Text, View, useWindowDimensions } from 'react-native';
import { styles } from './MessageList.styles';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type MessageListProps = {
  messages: Message[];
};

export function MessageList({ messages }: MessageListProps) {
  const { width } = useWindowDimensions();
  const isWide = width > 600;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={[...messages].reverse()}
      inverted
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View
          style={[
            styles.bubble,
            { maxWidth: isWide ? 400 : '80%' },
            item.role === 'user' ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text style={styles.bubbleText}>{item.text}</Text>
        </View>
      )}
    />
  );
}
