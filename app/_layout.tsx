import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { tokens } from "@/src/design/tokens";
import { AppSliceProvider } from "@/src/store/app-slice";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: tokens.colors.background,
      card: tokens.colors.surface,
      text: tokens.colors.textPrimary,
      border: tokens.colors.border,
      primary: tokens.colors.ctaPrimary,
    },
  };

  return (
    <AppSliceProvider>
      <ThemeProvider value={navigationTheme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: tokens.colors.surface },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="alert/[id]" options={{ title: "Alert Detail" }} />
          <Stack.Screen
            name="center/[id]"
            options={{ title: "Center Detail" }}
          />
          <Stack.Screen name="settings/index" options={{ title: "Settings" }} />
          <Stack.Screen
            name="relief/index"
            options={{ title: "Relief (MVP-gated)" }}
          />
          <Stack.Screen
            name="donation/index"
            options={{ title: "Donation (MVP-gated)" }}
          />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </AppSliceProvider>
  );
}
