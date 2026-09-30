import { getStateFromPath } from '@react-navigation/native';
import { linking } from './linking';

describe('deep linking config', () => {
  it('maps quiz/:topic to the Quiz screen with the topic param', () => {
    const state = getStateFromPath('quiz/roman-history', linking.config);

    expect(state?.routes[0].name).toBe('Quiz');
    expect(state?.routes[0].params).toEqual({ topic: 'roman-history' });
  });

  it('maps chat to the Chat screen', () => {
    const state = getStateFromPath('chat', linking.config);
    expect(state?.routes[0].name).toBe('Chat');
  });
});