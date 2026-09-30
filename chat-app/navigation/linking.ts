import { LinkingOptions } from '@react-navigation/native';
import { RootStackParamList } from './RootNavigator';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['examprep://', 'http://localhost:8081'],
  config: {
    screens: {
      Login: 'login',
      Chat: 'chat',
      Quiz: 'quiz/:topic',
    },
  },
};