import { useRef, useState } from 'react';
import { TextInput, View, Pressable, Text, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { styles } from './InputBar.styles';

type InputBarProps = {
  onSend: (text: string) => void;
};

export function InputBar({ onSend }: InputBarProps) {
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Permission to access the photo library is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  }

  function handleSend() {
    if (text.trim().length === 0 && !imageUri) return;
    onSend(text.trim() || '[Image sent]');
    setText('');
    setImageUri(null);
    inputRef.current?.focus();
  }

  return (
    <View>
      {imageUri && (
        <Image source={{ uri: imageUri }} style={{ width: 60, height: 60, borderRadius: 8, marginBottom: 8 }} />
      )}
      <View style={styles.container}>
        <Pressable onPress={pickImage} style={{ justifyContent: 'center', paddingHorizontal: 4 }}>
          <Ionicons name="image-outline" size={22} color={colors.textMuted} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message…"
          placeholderTextColor={colors.textMuted}
        />
        <Pressable style={styles.button} onPress={handleSend}>
          <Text style={styles.buttonText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}