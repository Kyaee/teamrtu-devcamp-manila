export const tokens = {
  colors: {
    background: "#070D1A",
    surface: "#0F1829",
    surfaceAlt: "#162038",
    border: "#1E2D45",
    borderLight: "#243450",
    textPrimary: "#F0F4FF",
    textSecondary: "#7B8FA8",
    textDisabled: "#3D5068",
    ctaPrimary: "#38BDF8",
    ctaText: "#070D1A",
    safe: "#22C55E",
    danger: "#EF4444",
    severity: {
      MONITOR: "#3B82F6",
      PREPARE: "#F59E0B",
      LEAVE: "#F97316",
      EVACUATE: "#EF4444",
    },
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
  },
  radius: {
    none: 0,
    sm: 6,
    md: 10,
    lg: 16,
    pill: 24,
  },
  type: {
    body: 15,
    label: 13,
    title: 24,
    command: 32,
  },
} as const;

export type Severity = keyof typeof tokens.colors.severity;
