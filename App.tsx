import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppProvider, useApp } from './lib/store';
import TabBar from './components/TabBar';

import HomeScreen from './screens/HomeScreen';
import CalendarScreen from './screens/CalendarScreen';
import TasksScreen from './screens/TasksScreen';
import ProfileScreen from './screens/ProfileScreen';
import WeatherDetailScreen from './screens/WeatherDetailScreen';
import TaskEditorScreen from './screens/TaskEditorScreen';
import EventEditorScreen from './screens/EventEditorScreen';
import LocationsScreen from './screens/LocationsScreen';
import RemindersScreen from './screens/RemindersScreen';
import SettingsScreen from './screens/SettingsScreen';
import AppearanceScreen from './screens/AppearanceScreen';
import AccessibilityScreen from './screens/AccessibilityScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import IntegrationsScreen from './screens/IntegrationsScreen';
import AboutScreen from './screens/AboutScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import SignInScreen from './screens/SignInScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } as any }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Calendar' }} />
      <Tab.Screen name="Tasks" component={TasksScreen} options={{ title: 'Tasks' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

function Root() {
  const { ready, state, theme, scheme } = useApp();

  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: theme.bg,
      card: theme.bgElevated,
      text: theme.text,
      border: theme.border,
      primary: theme.accent,
    },
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme as any}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
          animation: state.settings.reduceMotion ? 'fade' : 'slide_from_right',
        }}
      >
        {!state.onboarded ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : !state.user ? (
          <Stack.Screen name="SignIn" component={SignInScreen} options={{ animation: 'fade' }} />
        ) : (
          <>
            <Stack.Screen name="Main" component={Tabs} />
            <Stack.Screen name="WeatherDetail" component={WeatherDetailScreen} />
            <Stack.Screen name="TaskEditor" component={TaskEditorScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="EventEditor" component={EventEditorScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Locations" component={LocationsScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Reminders" component={RemindersScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Appearance" component={AppearanceScreen} />
            <Stack.Screen name="Accessibility" component={AccessibilityScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Integrations" component={IntegrationsScreen} />
            <Stack.Screen name="About" component={AboutScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ ...Ionicons.font });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#0B1020' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <Root />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
