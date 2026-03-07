export const tokens = {
  colors: {
    background: "#FFFFFF",
    surface: "#F5F5F5",
    surfaceAlt: "#EBEBEB",
    border: "#E0E0E0",
    borderLight: "#D6D6D6",
    textPrimary: "#000000",
    textSecondary: "#6B6B6B",
    textDisabled: "#A3A3A3",
    ctaPrimary: "#000000",
    ctaText: "#FFFFFF",
    safe: "#22C55E",
    danger: "#EF4444",
    severity: {
      MONITOR: "#22C55E",
      PREPARE: "#EAB308",
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
