import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppProvider, useApp } from './lib/store';
import { navigationRef } from './lib/navigation';
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
import SmartSuggestionScreen from './screens/SmartSuggestionScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Safely log error without printing secrets
    console.error('[RootErrorBoundary] Caught unhandled rendering error:', error?.message);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <StatusBar style="light" />
          <View style={errorStyles.card}>
            <View style={errorStyles.iconContainer}>
              <Ionicons name="alert-circle-outline" size={52} color="#EF4444" />
            </View>
            <Text style={errorStyles.title}>Application Error</Text>
            <Text style={errorStyles.message}>
              Something went wrong while starting the application.
            </Text>
            <TouchableOpacity style={errorStyles.button} onPress={this.handleRetry} activeOpacity={0.8}>
              <Text style={errorStyles.buttonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1020',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } as any }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Calendar' }} />
      <Tab.Screen name="Clever" component={SmartSuggestionScreen} options={{ title: 'Clever' }} />
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
      <View style={{ flex: 1, backgroundColor: theme?.bg || '#0B1020', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={theme?.accent || '#3B82F6'} />
        <Text style={{ marginTop: 16, color: theme?.textSecondary || '#94A3B8', fontSize: 14 }}>
          Initializing application...
        </Text>
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme as any}>
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
        ) : !state.hasSeenWelcome && !state.user ? (
          <Stack.Screen name="SignIn" component={SignInScreen} options={{ animation: 'fade' }} />
        ) : (
          <>
            <Stack.Screen name="Main" component={Tabs} />
            <Stack.Screen name="SignIn" component={SignInScreen} options={{ animation: 'fade' }} />
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
            <Stack.Screen name="SmartSuggestion" component={SmartSuggestionScreen} />
            <Stack.Screen name="AskClever" component={SmartSuggestionScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ ...Ionicons.font });
  const [fontTimedOut, setFontTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFontTimedOut(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const canRender = fontsLoaded || fontError || fontTimedOut;

  if (!canRender) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B1020', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <AppProvider>
            <Root />
          </AppProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
