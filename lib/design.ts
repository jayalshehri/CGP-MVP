export const cgpDesign = {
  colors: {
    navy: '#0b1f33',
    teal: '#0f7d73',
    tealDark: '#0f6f67',
    tealSoft: '#e8f5f2',
    background: '#f5f7f9',
    surface: '#ffffff',
    border: '#e2e7eb',
    text: '#0b1f33',
    muted: '#7a8794',
    danger: '#b42318',
    warning: '#9a5700',
  },
  radius: {
    sm: 9,
    md: 12,
    lg: 16,
  },
  spacing: {
    page: 40,
    card: 24,
    gap: 18,
  },
  typography: {
    fontFamily: 'Arial, sans-serif',
    pageTitle: 34,
    sectionTitle: 21,
    body: 15,
    small: 13,
  },
} as const;

export const cgpPageStyle = {
  minHeight: '100vh',
  background: cgpDesign.colors.background,
  fontFamily: cgpDesign.typography.fontFamily,
  color: cgpDesign.colors.text,
} as const;

export const cgpCardStyle = {
  background: cgpDesign.colors.surface,
  border: `1px solid ${cgpDesign.colors.border}`,
  borderRadius: cgpDesign.radius.lg,
  padding: cgpDesign.spacing.card,
} as const;
