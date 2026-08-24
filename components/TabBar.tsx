import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../lib/store';

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Home: { on: 'home', off: 'home-outline' },
  Calendar: { on: 'calendar', off: 'calendar-outline' },
  Tasks: { on: 'checkmark-circle', off: 'checkmark-circle-outline' },
  Profile: { on: 'person', off: 'person-outline' },
};

export default function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme, state: appState } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = appState.settings.reduceMotion;
  const isDark = theme.scheme === 'dark';

  // Colors matching the design specification
  const containerBg = isDark ? '#182032' : '#FFFFFF';
  const activePillBg = isDark ? 'rgba(76, 123, 255, 0.22)' : '#E7F0FF';
  const activeColor = '#4C7BFF';
  const inactiveColor = isDark ? '#94A3B8' : '#6B7280';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const [containerWidth, setContainerWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    if (reduceMotion) {
      slideAnim.setValue(state.index);
    } else {
      Animated.spring(slideAnim, {
        toValue: state.index,
        useNativeDriver: true,
        damping: 20,
        stiffness: 180,
        mass: 0.8,
      }).start();
    }
  }, [state.index, reduceMotion, slideAnim]);

  const numTabs = state.routes.length || 4;
  const horizontalPadding = 8;
  const availableWidth = containerWidth > 0 ? containerWidth - horizontalPadding * 2 : 0;
  const tabWidth = availableWidth > 0 ? availableWidth / numTabs : 0;
  const pillMargin = 4;
  const pillWidth = tabWidth > 0 ? tabWidth - pillMargin * 2 : 0;

  const translateX = slideAnim.interpolate({
    inputRange: state.routes.map((_, i) => i),
    outputRange: state.routes.map((_, i) => horizontalPadding + i * tabWidth + pillMargin),
  });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 16,
        alignItems: 'center',
      }}
    >
      <View
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        style={[
          styles.container,
          {
            backgroundColor: containerBg,
            borderColor,
          },
        ]}
      >
        {/* Sliding active pill indicator */}
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.activePill,
              {
                width: pillWidth,
                backgroundColor: activePillBg,
                transform: [{ translateX }],
              },
            ]}
          />
        )}

        {/* Tab Items */}
        <View style={styles.tabsRow}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const { options } = descriptors[route.key];
            const label = (options.title as string) ?? route.name;
            const icons = ICONS[label] ?? ICONS.Home;

            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
            };

            const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                onLongPress={onLongPress}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                style={styles.tabItem}
              >
                <View style={styles.tabContent}>
                  <Ionicons
                    name={focused ? icons.on : icons.off}
                    size={22}
                    color={focused ? activeColor : inactiveColor}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tabLabel,
                      {
                        color: focused ? activeColor : inactiveColor,
                        fontWeight: focused ? '600' : '500',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 420,
    height: 68,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.10)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 8,
      },
    }),
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    position: 'relative',
    zIndex: 10,
  },
  tabItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 12,
    letterSpacing: -0.1,
  },
  activePill: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    borderRadius: 999,
    zIndex: 1,
  },
});
