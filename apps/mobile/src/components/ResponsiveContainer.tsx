import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * The maximum width the container should grow to.
   * Default is 800 (good for centering on tablets).
   */
  maxWidth?: number;
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({ 
  children, 
  style, 
  maxWidth = 800 
}) => {
  return (
    <View style={[styles.wrapper, style]}>
      <View style={[styles.innerContainer, { maxWidth }]}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    width: '100%',
    // The wrapper itself spans the full screen, allowing backgrounds to fill correctly
  },
  innerContainer: {
    flex: 1,
    width: '100%',
    alignSelf: 'center', // This perfectly centers the content on tablets/desktop
  },
});
