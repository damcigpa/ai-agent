import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './navigation/RootNavigator';
import { store } from './store/store';
import { useState, useEffect } from 'react';
import { getToken } from './lib/auth';
import { linking } from './navigation/linking';

export default function App() {
  const [initialRoute, setInitialRoute] = useState<'Login' | 'Chat' | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const token = await getToken();
      setInitialRoute(token ? 'Chat' : 'Login');
    }
    checkAuth();
  }, []);

  if (!initialRoute) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <SafeAreaProvider>
          <NavigationContainer theme={DarkTheme} linking={linking}>
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </Provider>
    </GestureHandlerRootView>
  );
}