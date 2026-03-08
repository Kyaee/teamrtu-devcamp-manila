import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { tokens } from "@/src/design/tokens";
import { AppSliceProvider } from "@/src/store/app-slice";
import { ChecklistStoreProvider } from "@/src/store/checklist-store";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: tokens.colors.background,
      card: tokens.colors.background,
      text: tokens.colors.textPrimary,
      border: tokens.colors.border,
      primary: tokens.colors.ctaPrimary,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppSliceProvider>
        <ChecklistStoreProvider>
          <ThemeProvider value={navigationTheme}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: tokens.colors.background },
                headerTintColor: tokens.colors.textPrimary,
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="alert/[id]"
                options={{ title: "Alert Detail" }}
              />
              <Stack.Screen
                name="center/[id]"
                options={{ title: "Center Detail" }}
              />
              <Stack.Screen
                name="settings/index"
                options={{ title: "Settings" }}
              />
              <Stack.Screen
                name="relief/index"
                options={{ title: "Relief (MVP-gated)" }}
              />
              <Stack.Screen
                name="donation/index"
                options={{ title: "Donation (MVP-gated)" }}
              />
              <Stack.Screen
                name="report-drain/index"
                options={{
                  title: "Report: Baradong Kanal",
                  presentation: "modal",
                }}
              />
              <Stack.Screen
                name="request-help/index"
                options={{
                  headerShown: false,
                  animation: "slide_from_bottom",
                }}
              />
            </Stack>
            <StatusBar style="dark" />
          </ThemeProvider>
        </ChecklistStoreProvider>
      </AppSliceProvider>
    </GestureHandlerRootView>
  );
}
