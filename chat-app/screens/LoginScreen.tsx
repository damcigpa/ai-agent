import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { register, login } from '../lib/auth';
import { colors, spacing, radius } from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';

export function LoginScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      if (isRegisterMode) {
        await register(email, password);
      } else {
        await login(email, password);
      }
      navigation.navigate('Chat');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background }}>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '600', marginBottom: spacing.lg }}>
        {isRegisterMode ? 'Regisztráció' : 'Bejelentkezés'}
      </Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        style={{ backgroundColor: colors.surface, color: colors.text, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm }}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Jelszó"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        style={{ backgroundColor: colors.surface, color: colors.text, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.lg }}
      />

      {error && <Text style={{ color: '#dc2626', marginBottom: spacing.md }}>{error}</Text>}

      <Pressable
        onPress={handleSubmit}
        disabled={loading}
        style={{ backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' }}
      >
        {loading ? <ActivityIndicator color="white" /> : (
          <Text style={{ color: 'white', fontWeight: '600' }}>
            {isRegisterMode ? 'Regisztráció' : 'Bejelentkezés'}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => setIsRegisterMode(!isRegisterMode)} style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.primary, textAlign: 'center' }}>
          {isRegisterMode ? 'Van már fiókod? Jelentkezz be' : 'Nincs még fiókod? Regisztrálj'}
        </Text>
      </Pressable>
    </View>
  );
}