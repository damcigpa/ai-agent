import { Text, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors, spacing, radius } from '../theme';
import { ChatSession } from '../types/chat';

type SwipeToDeleteRowProps = {
  session: ChatSession;
  onSelect: (session: ChatSession) => void;
  onDelete: (session: ChatSession) => void;
};

export function SwipeToDeleteRow({ session, onSelect, onDelete }: SwipeToDeleteRowProps) {
  const translateX = useSharedValue(0);


const { width } = useWindowDimensions();
const SCREEN_EXIT = -(width + 100);
const DELETE_THRESHOLD = -(width * 0.35);


  function handleDelete() {
    onDelete(session);
  }

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = Math.min(event.translationX, 0);
    })
    .onEnd(() => {
      if (translateX.value < DELETE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_EXIT, { duration: 200 }, (finished) => {
          if (finished) {
            scheduleOnRN(handleDelete);
          }
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>
        <Pressable
          style={{ backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md }}
          onPress={() => onSelect(session)}
        >
          <Text style={{ color: colors.text, fontSize: 16 }}>{session.title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{session.date}</Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}