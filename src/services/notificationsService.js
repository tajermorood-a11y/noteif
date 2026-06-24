// src/services/notificationsService.js
// ─────────────────────────────────────────────────────────────
// Responsibilities:
//  1. Request OS permission for push notifications
//  2. Fetch the Expo/FCM push token from the device
//  3. Save the token to Supabase (user_fcm_tokens table)
//  4. Listen for incoming notifications (foreground + tap)
//  5. Expose sendPush() to invoke the Edge Function send-push
// ─────────────────────────────────────────────────────────────

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "../api/supabaseClient";

// ── Foreground notification behaviour ────────────────────────
// Show banner + sound even while app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

// ─────────────────────────────────────────────────────────────
// 1. Request permission + get push token
// Returns the token string, or null if denied / not a device
// ─────────────────────────────────────────────────────────────
export async function registerForPushNotifications() {
  // Simulators / emulators cannot receive push notifications
  if (!Device.isDevice) {
    console.warn("[Push] Must use a physical device for push notifications.");
    return null;
  }

  // Check / request permission
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("[Push] Permission not granted.");
    return null;
  }

  // Android: must create a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "ملعبنا",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3B82F6",
      sound: "default",
    });
  }

  // Get the Expo push token (works with FCM under the hood on Android)
  // projectId comes from your app.json → expo.extra.eas.projectId
  // or you can hardcode it from eas.json after first build
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data; // e.g. "ExponentPushToken[xxxxxx]"
  } catch (err) {
    console.error("[Push] getExpoPushTokenAsync failed:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Save token to Supabase user_fcm_tokens table
// Upserts by fcm_token (UNIQUE constraint) to avoid duplicates
// ─────────────────────────────────────────────────────────────
export async function saveTokenToSupabase(userId, token) {
  if (!userId || !token) return;

  const { error } = await supabase
    .from("user_fcm_tokens")
    .upsert(
      {
        user_id:     userId,
        fcm_token:   token,
        device_type: Platform.OS, // 'android' | 'ios'
        updated_at:  new Date().toISOString(),
      },
      { onConflict: "fcm_token" }
    );

  if (error) {
    console.error("[Push] Failed to save token:", error.message);
  } else {
    console.log("[Push] Token saved to Supabase ✓");
  }
}

// ─────────────────────────────────────────────────────────────
// 3. Full init — call this once on app launch (after auth)
//    Combines registerForPushNotifications + saveTokenToSupabase
// ─────────────────────────────────────────────────────────────
export async function initPushNotifications(userId) {
  const token = await registerForPushNotifications();
  if (token && userId) {
    await saveTokenToSupabase(userId, token);
  }
  return token;
}

// ─────────────────────────────────────────────────────────────
// 4. Send a push notification via Edge Function send-push
//    token  — FCM / Expo token of the recipient device
//    title  — notification title (Arabic or English)
//    body   — notification body text
// ─────────────────────────────────────────────────────────────
export async function sendPushNotification({ token, title, body }) {
  const { data, error } = await supabase.functions.invoke("send-push", {
    body: { token, title, body },
  });

  if (error) {
    console.error("[Push] Edge Function error:", error.message);
    return { success: false, error: error.message };
  }

  console.log("[Push] Notification sent ✓", data);
  return { success: true, data };
}

// ─────────────────────────────────────────────────────────────
// 5. Add notification listeners (call in a useEffect)
//    onReceive  — fires when notification arrives in foreground
//    onResponse — fires when user taps the notification
// Returns a cleanup function → call it in useEffect return
// ─────────────────────────────────────────────────────────────
export function addNotificationListeners({ onReceive, onResponse } = {}) {
  const receiveSub = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log("[Push] Received:", notification);
      onReceive?.(notification);
    }
  );

  const responseSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log("[Push] Tapped:", response);
      onResponse?.(response);
    }
  );

  // Return cleanup
  return () => {
    Notifications.removeNotificationSubscription(receiveSub);
    Notifications.removeNotificationSubscription(responseSub);
  };
}
