import { useState, useEffect, useCallback } from 'react';
import { Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { colors, spacing } from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';

type QuizScreenRouteProp = RouteProp<RootStackParamList, 'Quiz'>;

// Fake "server call" — simulates network latency
function fakeFetchQuiz(topic: string): Promise<string[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        `Question 1 about ${topic}`,
        `Question 2 about ${topic}`,
        `Question 3 about ${topic}`,
      ]);
    }, 1000);
  });

}
export function QuizScreen() {
  const route = useRoute<QuizScreenRouteProp>();
  const { topic } = route.params;

  const [questions, setQuestions] = useState<string[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fakeFetchQuiz(topic).then(setQuestions);
  }, [topic]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const fresh = await fakeFetchQuiz(topic);
    setQuestions(fresh);
    setRefreshing(false);
  }, [topic]);

  if (!questions) {
    return (
      <Screen padded style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen padded>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: spacing.md }}>
          Quiz on: {topic}
        </Text>
        {questions.map((q, i) => (
          <Text key={i} style={{ color: colors.text, marginBottom: spacing.sm }}>
            {q}
          </Text>
        ))}
      </ScrollView>
    </Screen>
  );
}
