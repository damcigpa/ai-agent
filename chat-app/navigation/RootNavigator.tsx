import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChatScreen } from '../screens/ChatScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { colors } from '../theme';

export type RootStackParamList = {
  Chat: undefined;
  Quiz: { topic: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Exam Prep' }} />
      <Stack.Screen name="Quiz" component={QuizScreen} options={{ title: 'Quiz' }} />
    </Stack.Navigator>
  );
}
