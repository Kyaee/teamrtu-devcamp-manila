import { Tabs } from "expo-router";
import React from "react";
import { Ionicons } from "@expo/vector-icons";

import { tokens } from "@/src/design/tokens";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tokens.colors.ctaPrimary,
        tabBarInactiveTintColor: tokens.colors.textDisabled,
        tabBarStyle: {
          backgroundColor: tokens.colors.surface,
          borderTopColor: tokens.colors.border,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Ionicons size={22} name="home" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ color }) => (
            <Ionicons size={22} name="map" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="centers"
        options={{
          title: "Centers",
          tabBarIcon: ({ color }) => (
            <Ionicons size={22} name="navigate-circle" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: "Report",
          tabBarIcon: ({ color }) => (
            <Ionicons size={22} name="warning" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
