import { FlatList, useWindowDimensions } from 'react-native';
import { MessageBubble } from './MessageBubble';
import { Message } from '../types/chat';
import { styles } from './MessageList.styles';

type MessageListProps = {
  messages: Message[];
};

export function MessageList({ messages }: MessageListProps) {
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={[...messages].reverse()}
      inverted
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <MessageBubble message={item} />}
    />
  );
}