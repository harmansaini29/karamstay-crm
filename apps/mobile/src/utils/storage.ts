import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value);
      } catch (e) {}
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (e) {}
  },
  deleteItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {}
  },
};
