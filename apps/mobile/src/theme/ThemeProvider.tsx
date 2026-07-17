import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import * as tokens from './tokens';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  colors: typeof tokens.theme.light;
  isDark: boolean;
  radius: typeof tokens.radius;
  space: typeof tokens.space;
  font: typeof tokens.font;
  shadows: typeof tokens.shadows;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (mode === 'system') {
      setResolvedTheme(systemScheme === 'dark' ? 'dark' : 'light');
    } else {
      setResolvedTheme(mode);
    }
  }, [mode, systemScheme]);

  const colors = tokens.theme[resolvedTheme] as typeof tokens.theme.light;
  const isDark = resolvedTheme === 'dark';

  return (
    <ThemeContext.Provider
      value={{
        mode,
        setMode,
        colors,
        isDark,
        radius: tokens.radius,
        space: tokens.space,
        font: tokens.font,
        shadows: tokens.shadows,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
