import { Pressable, Text } from 'react-native';
import { spacing } from '../theme';

type LogoutButtonProps = {
  onPress: () => void;
};

export function LogoutButton({ onPress }: LogoutButtonProps) {
  return (
    <Pressable style={{ paddingRight: spacing.md }} onPress={onPress}>
      <Text style={{ color: '#dc2626', fontWeight: '600' }}>Logout</Text>
    </Pressable>
  );
}