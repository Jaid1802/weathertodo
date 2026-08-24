/**
 * Aurelia Design System
 * -----------------------------------------------------------
 * An original visual identity for a Weather + Productivity Assistant.
 * Inspired by iOS HIG principles (hierarchy, spacing, translucency,
 * rounded geometry) without copying Apple's visual language.
 */

export type ColorScheme = 'light' | 'dark';

export const Radius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  xxl: 40,
  pill: 999,
};

export const Space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
  xxxl: 56,
};

export const Font = {
  // Weights tuned for a crisp, editorial feel
  black: '800' as const,
  bold: '700' as const,
  semibold: '600' as const,
  medium: '500' as const,
  regular: '400' as const,
};

export const Type = {
  hero: 96,
  display: 64,
  title1: 34,
  title2: 27,
  title3: 21,
  headline: 17,
  body: 16,
  callout: 15,
  sub: 13.5,
  caption: 12,
  micro: 10.5,
};

export interface AppTheme {
  scheme: ColorScheme;
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceAlt: string;
  surfacePressed: string;
  border: string;
  hairline: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  shadow: string;
  tabBar: string;
  overlay: string;
}

const lightTheme: AppTheme = {
  scheme: 'light',
  bg: '#F4F6FB',
  bgElevated: '#FFFFFF',
  surface: 'rgba(255,255,255,0.92)',
  surfaceAlt: 'rgba(16,24,48,0.045)',
  surfacePressed: 'rgba(16,24,48,0.09)',
  border: 'rgba(16,24,48,0.09)',
  hairline: 'rgba(16,24,48,0.07)',
  text: '#0E1526',
  textSecondary: 'rgba(14,21,38,0.62)',
  textTertiary: 'rgba(14,21,38,0.40)',
  accent: '#3B5BFF',
  accentSoft: 'rgba(59,91,255,0.12)',
  onAccent: '#FFFFFF',
  success: '#0FA968',
  warning: '#E8890C',
  danger: '#E5484D',
  info: '#0C8CE9',
  shadow: '#0B1533',
  tabBar: 'rgba(255,255,255,0.82)',
  overlay: 'rgba(10,16,32,0.42)',
};

const darkTheme: AppTheme = {
  scheme: 'dark',
  bg: '#080B14',
  bgElevated: '#111726',
  surface: 'rgba(255,255,255,0.07)',
  surfaceAlt: 'rgba(255,255,255,0.06)',
  surfacePressed: 'rgba(255,255,255,0.14)',
  border: 'rgba(255,255,255,0.12)',
  hairline: 'rgba(255,255,255,0.09)',
  text: '#F2F5FF',
  textSecondary: 'rgba(242,245,255,0.66)',
  textTertiary: 'rgba(242,245,255,0.40)',
  accent: '#7C93FF',
  accentSoft: 'rgba(124,147,255,0.18)',
  onAccent: '#06091A',
  success: '#3DD68C',
  warning: '#FFB020',
  danger: '#FF6369',
  info: '#48B4FF',
  shadow: '#000000',
  tabBar: 'rgba(17,23,38,0.86)',
  overlay: 'rgba(0,0,0,0.58)',
};

const highContrastLight: AppTheme = {
  ...lightTheme,
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: 'rgba(0,0,0,0.06)',
  border: 'rgba(0,0,0,0.30)',
  hairline: 'rgba(0,0,0,0.22)',
  text: '#000000',
  textSecondary: 'rgba(0,0,0,0.78)',
  textTertiary: 'rgba(0,0,0,0.60)',
  accent: '#1B37D8',
  tabBar: '#FFFFFF',
};

const highContrastDark: AppTheme = {
  ...darkTheme,
  bg: '#000000',
  bgElevated: '#0B0B0B',
  surface: 'rgba(255,255,255,0.13)',
  surfaceAlt: 'rgba(255,255,255,0.12)',
  border: 'rgba(255,255,255,0.38)',
  hairline: 'rgba(255,255,255,0.28)',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.86)',
  textTertiary: 'rgba(255,255,255,0.66)',
  accent: '#9FB2FF',
  tabBar: '#0B0B0B',
};

export function getTheme(scheme: ColorScheme, highContrast = false): AppTheme {
  if (highContrast) return scheme === 'dark' ? highContrastDark : highContrastLight;
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/* ----------------------------------------------------------------
 * Weather-reactive atmospheres
 * Each condition has its own sky palette, accent and particle system.
 * ---------------------------------------------------------------- */

export type SkyKey =
  | 'clear-day'
  | 'clear-night'
  | 'partly-day'
  | 'partly-night'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'thunder'
  | 'snow'
  | 'sunrise'
  | 'sunset';

export type ParticleKind = 'none' | 'stars' | 'rain' | 'snow' | 'mist' | 'sunrays' | 'drizzle';

export interface SkyTheme {
  key: SkyKey;
  label: string;
  /** vertical gradient stops, top -> bottom */
  sky: string[];
  /** glow orb color (sun / moon) */
  orb: string;
  orbGlow: string;
  showOrb: boolean;
  /** primary foreground text on the sky */
  onSky: string;
  onSkyMuted: string;
  /** translucent card over the sky */
  glass: string;
  glassBorder: string;
  accent: string;
  particles: ParticleKind;
  cloudOpacity: number;
  /** best status bar content color */
  statusBar: 'light' | 'dark';
  /** short poetic descriptor used in the hero */
  mood: string;
}

const SKIES: Record<SkyKey, SkyTheme> = {
  'clear-day': {
    key: 'clear-day',
    label: 'Clear',
    sky: ['#1D6FE0', '#4C9BEF', '#8FC6F7', '#CFE7FB'],
    orb: '#FFF3C4',
    orbGlow: 'rgba(255,226,138,0.55)',
    showOrb: true,
    onSky: '#FFFFFF',
    onSkyMuted: 'rgba(255,255,255,0.76)',
    glass: 'rgba(255,255,255,0.17)',
    glassBorder: 'rgba(255,255,255,0.28)',
    accent: '#FFD469',
    particles: 'sunrays',
    cloudOpacity: 0.12,
    statusBar: 'light',
    mood: 'Open skies',
  },
  'clear-night': {
    key: 'clear-night',
    label: 'Clear night',
    sky: ['#05060F', '#0B1030', '#161F46', '#243069'],
    orb: '#E9EEFF',
    orbGlow: 'rgba(190,205,255,0.35)',
    showOrb: true,
    onSky: '#F4F6FF',
    onSkyMuted: 'rgba(244,246,255,0.66)',
    glass: 'rgba(255,255,255,0.09)',
    glassBorder: 'rgba(255,255,255,0.16)',
    accent: '#9AB0FF',
    particles: 'stars',
    cloudOpacity: 0.06,
    statusBar: 'light',
    mood: 'Quiet and still',
  },
  'partly-day': {
    key: 'partly-day',
    label: 'Partly cloudy',
    sky: ['#2E6FB8', '#5E96CE', '#9BBBD9', '#D7E3EC'],
    orb: '#FFF0CC',
    orbGlow: 'rgba(255,232,178,0.4)',
    showOrb: true,
    onSky: '#FFFFFF',
    onSkyMuted: 'rgba(255,255,255,0.76)',
    glass: 'rgba(255,255,255,0.16)',
    glassBorder: 'rgba(255,255,255,0.26)',
    accent: '#FFDD8C',
    particles: 'none',
    cloudOpacity: 0.5,
    statusBar: 'light',
    mood: 'Sun between clouds',
  },
  'partly-night': {
    key: 'partly-night',
    label: 'Partly cloudy',
    sky: ['#070A18', '#111834', '#1D2748', '#2C3660'],
    orb: '#DCE4FF',
    orbGlow: 'rgba(180,196,255,0.28)',
    showOrb: true,
    onSky: '#EFF2FF',
    onSkyMuted: 'rgba(239,242,255,0.62)',
    glass: 'rgba(255,255,255,0.08)',
    glassBorder: 'rgba(255,255,255,0.15)',
    accent: '#8FA5F5',
    particles: 'stars',
    cloudOpacity: 0.42,
    statusBar: 'light',
    mood: 'Drifting clouds',
  },
  cloudy: {
    key: 'cloudy',
    label: 'Cloudy',
    sky: ['#4A5568', '#63718A', '#8695AB', '#B7C2D0'],
    orb: '#DDE4EC',
    orbGlow: 'rgba(220,228,238,0.22)',
    showOrb: false,
    onSky: '#FFFFFF',
    onSkyMuted: 'rgba(255,255,255,0.74)',
    glass: 'rgba(255,255,255,0.15)',
    glassBorder: 'rgba(255,255,255,0.24)',
    accent: '#C9D6E6',
    particles: 'none',
    cloudOpacity: 0.85,
    statusBar: 'light',
    mood: 'Soft grey light',
  },
  fog: {
    key: 'fog',
    label: 'Fog',
    sky: ['#6E7681', '#8C949E', '#AEB5BD', '#D2D6DB'],
    orb: '#EDEFF2',
    orbGlow: 'rgba(237,239,242,0.2)',
    showOrb: false,
    onSky: '#FFFFFF',
    onSkyMuted: 'rgba(255,255,255,0.78)',
    glass: 'rgba(255,255,255,0.18)',
    glassBorder: 'rgba(255,255,255,0.26)',
    accent: '#DDE2E8',
    particles: 'mist',
    cloudOpacity: 0.6,
    statusBar: 'light',
    mood: 'Low visibility',
  },
  drizzle: {
    key: 'drizzle',
    label: 'Drizzle',
    sky: ['#33465C', '#456079', '#5E7B94', '#8DA3B6'],
    orb: '#CFE0EC',
    orbGlow: 'rgba(207,224,236,0.18)',
    showOrb: false,
    onSky: '#FFFFFF',
    onSkyMuted: 'rgba(255,255,255,0.72)',
    glass: 'rgba(255,255,255,0.13)',
    glassBorder: 'rgba(255,255,255,0.22)',
    accent: '#8FD3E8',
    particles: 'drizzle',
    cloudOpacity: 0.75,
    statusBar: 'light',
    mood: 'Light rain in the air',
  },
  rain: {
    key: 'rain',
    label: 'Rain',
    sky: ['#131E2E', '#1E2F45', '#2C4560', '#42607F'],
    orb: '#B9D2E4',
    orbGlow: 'rgba(185,210,228,0.14)',
    showOrb: false,
    onSky: '#FFFFFF',
    onSkyMuted: 'rgba(255,255,255,0.70)',
    glass: 'rgba(255,255,255,0.11)',
    glassBorder: 'rgba(255,255,255,0.19)',
    accent: '#5FC9F0',
    particles: 'rain',
    cloudOpacity: 0.9,
    statusBar: 'light',
    mood: 'Steady rainfall',
  },
  thunder: {
    key: 'thunder',
    label: 'Thunderstorm',
    sky: ['#0B0A1A', '#1A1435', '#2A2050', '#3D2F66'],
    orb: '#C9BEFF',
    orbGlow: 'rgba(201,190,255,0.16)',
    showOrb: false,
    onSky: '#FFFFFF',
    onSkyMuted: 'rgba(255,255,255,0.68)',
    glass: 'rgba(255,255,255,0.10)',
    glassBorder: 'rgba(255,255,255,0.18)',
    accent: '#C4A6FF',
    particles: 'rain',
    cloudOpacity: 0.95,
    statusBar: 'light',
    mood: 'Electric and unsettled',
  },
  snow: {
    key: 'snow',
    label: 'Snow',
    sky: ['#5A6C86', '#7E90A8', '#A8B8CB', '#DCE5EF'],
    orb: '#FFFFFF',
    orbGlow: 'rgba(255,255,255,0.24)',
    showOrb: false,
    onSky: '#FFFFFF',
    onSkyMuted: 'rgba(255,255,255,0.78)',
    glass: 'rgba(255,255,255,0.19)',
    glassBorder: 'rgba(255,255,255,0.30)',
    accent: '#DFF1FF',
    particles: 'snow',
    cloudOpacity: 0.7,
    statusBar: 'light',
    mood: 'Cold and hushed',
  },
  sunrise: {
    key: 'sunrise',
    label: 'Sunrise',
    sky: ['#1B2A5B', '#6A4A82', '#D4767A', '#F7B172'],
    orb: '#FFE0A8',
    orbGlow: 'rgba(255,190,120,0.45)',
    showOrb: true,
    onSky: '#FFFFFF',
    onSkyMuted: 'rgba(255,255,255,0.78)',
    glass: 'rgba(255,255,255,0.15)',
    glassBorder: 'rgba(255,255,255,0.26)',
    accent: '#FFC48C',
    particles: 'none',
    cloudOpacity: 0.3,
    statusBar: 'light',
    mood: 'First light',
  },
  sunset: {
    key: 'sunset',
    label: 'Sunset',
    sky: ['#161B3D', '#4A3A70', '#B45D74', '#F09263'],
    orb: '#FFD59B',
    orbGlow: 'rgba(255,170,110,0.42)',
    showOrb: true,
    onSky: '#FFFFFF',
    onSkyMuted: 'rgba(255,255,255,0.76)',
    glass: 'rgba(255,255,255,0.14)',
    glassBorder: 'rgba(255,255,255,0.24)',
    accent: '#FFB07A',
    particles: 'none',
    cloudOpacity: 0.35,
    statusBar: 'light',
    mood: 'Golden hour',
  },
};

export function getSky(key: SkyKey): SkyTheme {
  return SKIES[key] ?? SKIES['clear-day'];
}

export const ALL_SKIES: SkyTheme[] = Object.values(SKIES);

/** Shadow presets that read well on both platforms */
export function shadow(level: 1 | 2 | 3, color = '#0B1533') {
  const map = {
    1: { o: 0.06, r: 10, y: 3, e: 2 },
    2: { o: 0.1, r: 22, y: 8, e: 6 },
    3: { o: 0.16, r: 38, y: 16, e: 12 },
  } as const;
  const s = map[level];
  return {
    shadowColor: color,
    shadowOpacity: s.o,
    shadowRadius: s.r,
    shadowOffset: { width: 0, height: s.y },
    elevation: s.e,
  };
}
