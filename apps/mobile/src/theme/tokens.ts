// KaramStay design tokens — Airbnb-inspired system (see apps/mobile/DESIGN.md).
// White canvas, single Rausch (#ff385c) voltage, near-black ink text, hairline
// borders, soft rounded corners, one subtle shadow tier. The export SHAPE is kept
// stable (brand/neutral/accent scales, radius/space/font/shadows/theme) so every
// screen that consumes useTheme() picks up the new look without edits.

export const color = {
  // Brand = Airbnb "Rausch". 500 is the canonical primary; 600 is the pressed/active
  // state (#e00b41); 100 is the disabled tint (#ffd1da) — both per DESIGN.md.
  brand: {
    50: '#FFF1F4',
    100: '#FFD1DA',
    200: '#FFB0BF',
    300: '#FF8399',
    400: '#FF5C78',
    500: '#FF385C',
    600: '#E00B41',
    700: '#C20038',
    800: '#99002B',
    900: '#700020',
  },
  // Accent is deliberately restrained — Airbnb has no loud secondary in mainline UI.
  // Mapped to the legal-link blue used only for informational links.
  accent: { 100: '#DCE9FF', 500: '#428BFF', 600: '#2F6BDB' },
  // Warm-neutral "canvas / surface / hairline / ink" ramp from DESIGN.md.
  neutral: {
    0: '#FFFFFF', // canvas
    50: '#F7F7F7', // surface-soft
    100: '#F2F2F2', // surface-strong
    200: '#EBEBEB', // hairline-soft
    300: '#DDDDDD', // hairline
    400: '#C1C1C1', // border-strong
    500: '#929292', // muted-soft
    600: '#6A6A6A', // muted
    700: '#3F3F3F', // body
    800: '#2B2B2B',
    900: '#222222', // ink (never pure black)
  },
  success: { bg: '#E9F7EF', fg: '#0B7A47', solid: '#12A05C' },
  warning: { bg: '#FFF6E6', fg: '#9A5B00', solid: '#F0A020' },
  error: { bg: '#FDECE7', fg: '#C13515', solid: '#E0501E' },
  info: { bg: '#EAF1FF', fg: '#2F6BDB', solid: '#428BFF' },
} as const;

// Rausch pressed/active state, exposed for pressable components.
export const primaryActive = color.brand[600];

// Airbnb radius scale: soft everywhere, buttons at sm (8), cards at md (14).
export const radius = { xs: 4, sm: 8, md: 14, lg: 20, xl: 32, full: 9999 } as const;

// 4px base spacing with a 2px micro-step, section band at 48.
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48 } as const;

// Type scale tuned to Airbnb Cereal proportions (modest display weights, 16px body).
export const font = {
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.3, fontFamily: 'Inter_700Bold' },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const, letterSpacing: -0.2, fontFamily: 'Inter_600SemiBold' },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const, fontFamily: 'Inter_400Regular' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const, fontFamily: 'Inter_400Regular' },
  overline: { fontSize: 11, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 0.4, fontFamily: 'Inter_700Bold' },
} as const;

// Airbnb caps elevation at essentially one subtle tier; depth comes from hairlines,
// white-on-white separation, and rounded clipping rather than layered shadows.
export const shadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

export const theme = {
  light: {
    bg: color.neutral[0], // pure white canvas
    surface: color.neutral[0], // white cards, separated by hairline + soft shadow
    surfaceSoft: color.neutral[50],
    border: color.neutral[300], // hairline
    text: color.neutral[900], // ink
    textMuted: color.neutral[600], // muted
    primary: color.brand[500], // Rausch
    primaryActive: color.brand[600],
  },
  dark: {
    // Airbnb has no public dark mode; this is a sensible functional fallback only.
    bg: '#181818',
    surface: '#222222',
    surfaceSoft: '#2B2B2B',
    border: '#3A3A3A',
    text: '#F5F5F5',
    textMuted: '#A3A3A3',
    primary: color.brand[400],
    primaryActive: color.brand[500],
  },
} as const;
