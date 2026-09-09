import { StyleSheet, Text, View } from 'react-native';

import { useWindowDimensions } from 'react-native';

type HeaderProps = {
  title: string;
};

export function Header({ title }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerText}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: 16,
    backgroundColor: '#1e1e1e',
  },
  headerText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});
