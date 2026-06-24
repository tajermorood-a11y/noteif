// App.js
// Root: font loading + navigation + push notification init
// v2 — adds expo-notifications integration

import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import {
  useFonts,
  Tajawal_300Light,
  Tajawal_400Regular,
  Tajawal_500Medium,
  Tajawal_700Bold,
  Tajawal_800ExtraBold,
  Tajawal_900Black,
} from "@expo-google-fonts/tajawal";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import HomeScreen       from "./src/screens/HomeScreen";
import FullPlayerScreen from "./src/screens/FullPlayerScreen";
import MiniPlayerScreen from "./src/screens/MiniPlayerScreen";
import { colors }       from "./src/theme/colors";
import {
  initPushNotifications,
  addNotificationListeners,
} from "./src/services/notificationsService";
import { supabase } from "./src/api/supabaseClient";

const Stack = createNativeStackNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    Tajawal_300Light,
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
    Tajawal_800ExtraBold,
    Tajawal_900Black,
  });

  const navigationRef = useRef(null);

  // ── Push notifications bootstrap ─────────────────────────
  useEffect(() => {
    // 1. Listen for auth state to get user_id before registering
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user?.id) {
          await initPushNotifications(session.user.id);
        }
      }
    );

    // 2. Also try immediately (in case session already exists)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        initPushNotifications(session.user.id);
      }
    });

    // 3. Register notification listeners
    const removeListeners = addNotificationListeners({
      onReceive: (notification) => {
        // Notification arrived while app is open — handle if needed
        console.log("[App] Notification received in foreground:", notification.request.content.title);
      },
      onResponse: (response) => {
        // User tapped the notification — navigate if needed
        const data = response.notification.request.content.data;
        if (data?.screen && navigationRef.current) {
          navigationRef.current.navigate(data.screen, data.params || {});
        }
      },
    });

    // 4. Handle notification that LAUNCHED the app (tapped from closed state)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification?.request?.content?.data?.screen) {
        const { screen, params } = response.notification.request.content.data;
        // Small delay to let navigation mount
        setTimeout(() => {
          navigationRef.current?.navigate(screen, params || {});
        }, 500);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
      removeListeners();
    };
  }, []);

  // ── Font loading gate ─────────────────────────────────────
  if (!fontsLoaded) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: "center",
        alignItems: "center",
      }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={colors.background} />
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="Home"       component={HomeScreen} />
          <Stack.Screen name="FullPlayer" component={FullPlayerScreen} />
          <Stack.Screen name="MiniPlayer" component={MiniPlayerScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
