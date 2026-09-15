/**
 * Weather Theme Engine
 * -----------------------------------------------------------
 * Centralized theme mapping system connecting WMO weather conditions
 * and time-of-day to atmospheric background visual configurations.
 */

export type WeatherThemeId =
  | 'sunny'
  | 'partly-cloudy'
  | 'cloudy'
  | 'rainy'
  | 'stormy'
  | 'snowy'
  | 'foggy'
  | 'clear-night';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface OrbConfig {
  show: boolean;
  type: 'sun' | 'moon' | 'none';
  color: string;
  glowColor: string;
  xPercent: number; // 0..100 (horizontal offset)
  yPercent: number; // 0..100 (vertical offset)
  size: number;
}

export interface WeatherThemeConfig {
  id: WeatherThemeId;
  label: string;
  timeOfDay: TimeOfDay;
  subtitle: string;
  /** Sky gradient color stops from top to bottom */
  skyGradients: string[];
  orb: OrbConfig;
  cloudOpacity: number;
  cloudDensity: 'none' | 'light' | 'medium' | 'heavy';
  particles: 'none' | 'sunrays' | 'rain' | 'snow' | 'stars' | 'mist';
  hasLightning: boolean;
  /** Glass card adaptive styling */
  glassTint: string;
  glassBorder: string;
  /** Readability scrim gradient [top, bottom] */
  scrimColors: [string, string];
  accentColor: string;
  illustrationCode: number;
  isDay: boolean;
}

/**
 * Determine TimeOfDay from current local hour
 */
export function getTimeOfDay(hour: number, isDay = true): TimeOfDay {
  if (!isDay && (hour < 5 || hour >= 20)) return 'night';
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}

/**
 * Visual themes for each of the 8 canonical weather states and their time-of-day variations
 */
export const THEME_CONFIGS: Record<WeatherThemeId, (timeOfDay: TimeOfDay) => WeatherThemeConfig> = {
  sunny: (tod) => {
    const isEvening = tod === 'evening';
    return {
      id: 'sunny',
      label: 'Sunny',
      timeOfDay: tod,
      subtitle: 'Clear skies ahead',
      skyGradients: isEvening
        ? ['#1C2A5E', '#5D4578', '#C96868', '#F8AC6B']
        : tod === 'morning'
        ? ['#1872E8', '#3F94F3', '#7BB8F7', '#C4E2FE']
        : ['#1062DE', '#3085EE', '#66AAF5', '#B8DCFD'],
      orb: {
        show: true,
        type: 'sun',
        color: isEvening ? '#FFD496' : '#FFF5C0',
        glowColor: isEvening ? 'rgba(255, 170, 100, 0.45)' : 'rgba(255, 225, 120, 0.48)',
        xPercent: isEvening ? 68 : 78,
        yPercent: isEvening ? 12 : 7,
        size: 150,
      },
      cloudOpacity: 0.18,
      cloudDensity: 'light',
      particles: 'sunrays',
      hasLightning: false,
      glassTint: 'rgba(255, 255, 255, 0.22)',
      glassBorder: 'rgba(255, 255, 255, 0.36)',
      scrimColors: ['rgba(15, 23, 42, 0.08)', 'rgba(15, 23, 42, 0.35)'],
      accentColor: '#FFC837',
      illustrationCode: 0,
      isDay: true,
    };
  },

  'partly-cloudy': (tod) => {
    const isEvening = tod === 'evening';
    const isNight = tod === 'night';
    return {
      id: 'partly-cloudy',
      label: 'Partly Cloudy',
      timeOfDay: tod,
      subtitle: 'Sun between clouds',
      skyGradients: isNight
        ? ['#0B1226', '#142042', '#22325C', '#324474']
        : isEvening
        ? ['#202E56', '#524B70', '#9E6779', '#DC9C81']
        : ['#2563B8', '#4E89CA', '#85B1DE', '#CADDF0'],
      orb: {
        show: true,
        type: isNight ? 'moon' : 'sun',
        color: isNight ? '#F0F4FF' : isEvening ? '#FFCCA0' : '#FFF0B8',
        glowColor: isNight ? 'rgba(200, 220, 255, 0.28)' : 'rgba(255, 220, 140, 0.38)',
        xPercent: 74,
        yPercent: 8,
        size: 135,
      },
      cloudOpacity: 0.46,
      cloudDensity: 'medium',
      particles: isNight ? 'stars' : 'none',
      hasLightning: false,
      glassTint: 'rgba(255, 255, 255, 0.20)',
      glassBorder: 'rgba(255, 255, 255, 0.32)',
      scrimColors: ['rgba(15, 23, 42, 0.10)', 'rgba(15, 23, 42, 0.38)'],
      accentColor: '#FFD469',
      illustrationCode: 2,
      isDay: !isNight,
    };
  },

  cloudy: (tod) => {
    const isNight = tod === 'night';
    return {
      id: 'cloudy',
      label: 'Cloudy',
      timeOfDay: tod,
      subtitle: 'Overcast skies',
      skyGradients: isNight
        ? ['#0E1420', '#192334', '#263449', '#3D4F67']
        : ['#425166', '#5A6B83', '#7B8D9F', '#B1C2D4'],
      orb: {
        show: false,
        type: 'none',
        color: '#D8E2EC',
        glowColor: 'rgba(216, 226, 236, 0.15)',
        xPercent: 70,
        yPercent: 10,
        size: 110,
      },
      cloudOpacity: 0.82,
      cloudDensity: 'heavy',
      particles: 'none',
      hasLightning: false,
      glassTint: 'rgba(255, 255, 255, 0.16)',
      glassBorder: 'rgba(255, 255, 255, 0.26)',
      scrimColors: ['rgba(15, 23, 42, 0.14)', 'rgba(15, 23, 42, 0.42)'],
      accentColor: '#B8C9DB',
      illustrationCode: 3,
      isDay: !isNight,
    };
  },

  rainy: (tod) => {
    const isNight = tod === 'night';
    return {
      id: 'rainy',
      label: 'Light Rain',
      timeOfDay: tod,
      subtitle: 'Rain expected for next few hours',
      skyGradients: isNight
        ? ['#0B121C', '#131E2C', '#1F2F43', '#2F445E']
        : ['#172638', '#263B54', '#385272', '#557394'],
      orb: {
        show: false,
        type: 'none',
        color: '#BDD4E7',
        glowColor: 'rgba(189, 212, 231, 0.12)',
        xPercent: 70,
        yPercent: 10,
        size: 110,
      },
      cloudOpacity: 0.88,
      cloudDensity: 'heavy',
      particles: 'rain',
      hasLightning: false,
      glassTint: 'rgba(255, 255, 255, 0.13)',
      glassBorder: 'rgba(255, 255, 255, 0.22)',
      scrimColors: ['rgba(10, 16, 28, 0.20)', 'rgba(10, 16, 28, 0.50)'],
      accentColor: '#60A5FA',
      illustrationCode: 61,
      isDay: !isNight,
    };
  },

  stormy: (tod) => {
    const isNight = tod === 'night';
    return {
      id: 'stormy',
      label: 'Thunderstorm',
      timeOfDay: tod,
      subtitle: 'Thunderstorms likely',
      skyGradients: isNight
        ? ['#06050E', '#100C22', '#1B1536', '#2A204C']
        : ['#0D0B1C', '#1A1438', '#2C2255', '#40346E'],
      orb: {
        show: false,
        type: 'none',
        color: '#D8CCFF',
        glowColor: 'rgba(216, 204, 255, 0.15)',
        xPercent: 70,
        yPercent: 10,
        size: 110,
      },
      cloudOpacity: 0.94,
      cloudDensity: 'heavy',
      particles: 'rain',
      hasLightning: true,
      glassTint: 'rgba(255, 255, 255, 0.11)',
      glassBorder: 'rgba(255, 255, 255, 0.20)',
      scrimColors: ['rgba(8, 6, 18, 0.26)', 'rgba(8, 6, 18, 0.55)'],
      accentColor: '#C084FC',
      illustrationCode: 95,
      isDay: !isNight,
    };
  },

  snowy: (tod) => {
    const isNight = tod === 'night';
    return {
      id: 'snowy',
      label: 'Snow',
      timeOfDay: tod,
      subtitle: 'Snowfall expected today',
      skyGradients: isNight
        ? ['#0E1624', '#1A263A', '#293B54', '#415572']
        : ['#4C5E78', '#6A819E', '#94ACC6', '#D1E0EE'],
      orb: {
        show: false,
        type: 'none',
        color: '#FFFFFF',
        glowColor: 'rgba(255, 255, 255, 0.22)',
        xPercent: 70,
        yPercent: 10,
        size: 110,
      },
      cloudOpacity: 0.72,
      cloudDensity: 'medium',
      particles: 'snow',
      hasLightning: false,
      glassTint: 'rgba(255, 255, 255, 0.20)',
      glassBorder: 'rgba(255, 255, 255, 0.32)',
      scrimColors: ['rgba(15, 23, 42, 0.12)', 'rgba(15, 23, 42, 0.38)'],
      accentColor: '#93C5FD',
      illustrationCode: 71,
      isDay: !isNight,
    };
  },

  foggy: (tod) => {
    const isNight = tod === 'night';
    return {
      id: 'foggy',
      label: 'Foggy',
      timeOfDay: tod,
      subtitle: 'Low visibility',
      skyGradients: isNight
        ? ['#11161D', '#1D2531', '#2C3846', '#435160']
        : ['#5B6471', '#75808C', '#97A1AC', '#C3CAD2'],
      orb: {
        show: false,
        type: 'none',
        color: '#E8EDF2',
        glowColor: 'rgba(232, 237, 242, 0.18)',
        xPercent: 70,
        yPercent: 10,
        size: 110,
      },
      cloudOpacity: 0.65,
      cloudDensity: 'heavy',
      particles: 'mist',
      hasLightning: false,
      glassTint: 'rgba(255, 255, 255, 0.18)',
      glassBorder: 'rgba(255, 255, 255, 0.28)',
      scrimColors: ['rgba(15, 23, 42, 0.12)', 'rgba(15, 23, 42, 0.36)'],
      accentColor: '#E2E8F0',
      illustrationCode: 45,
      isDay: !isNight,
    };
  },

  'clear-night': (tod) => {
    return {
      id: 'clear-night',
      label: 'Clear Night',
      timeOfDay: 'night',
      subtitle: 'Clear skies',
      skyGradients: ['#050813', '#0B1228', '#142044', '#1F2F59'],
      orb: {
        show: true,
        type: 'moon',
        color: '#FDE047',
        glowColor: 'rgba(253, 224, 71, 0.35)',
        xPercent: 78,
        yPercent: 8,
        size: 130,
      },
      cloudOpacity: 0.08,
      cloudDensity: 'none',
      particles: 'stars',
      hasLightning: false,
      glassTint: 'rgba(255, 255, 255, 0.11)',
      glassBorder: 'rgba(255, 255, 255, 0.20)',
      scrimColors: ['rgba(5, 8, 19, 0.22)', 'rgba(5, 8, 19, 0.58)'],
      accentColor: '#93C5FD',
      illustrationCode: 0,
      isDay: false,
    };
  },
};

/**
 * Resolve the dynamic weather theme configuration based on:
 * 1. Weather code (WMO)
 * 2. isDay flag
 * 3. Date / local time
 * 4. User override if set
 */
export function resolveWeatherTheme(
  code: number | undefined,
  isDay: boolean | undefined,
  date: Date = new Date(),
  overrideKey?: string | null
): WeatherThemeConfig {
  const currentHour = date.getHours();
  const effectiveIsDay = isDay !== undefined ? isDay : currentHour >= 6 && currentHour < 19;
  const tod = getTimeOfDay(currentHour, effectiveIsDay);

  // 1. Check for user settings override (e.g. from Appearance screen)
  if (overrideKey) {
    switch (overrideKey) {
      case 'clear-day':
        return THEME_CONFIGS.sunny(tod === 'night' ? 'afternoon' : tod);
      case 'clear-night':
        return THEME_CONFIGS['clear-night']('night');
      case 'partly-day':
        return THEME_CONFIGS['partly-cloudy'](tod === 'night' ? 'afternoon' : tod);
      case 'partly-night':
        return THEME_CONFIGS['partly-cloudy']('night');
      case 'cloudy':
        return THEME_CONFIGS.cloudy(tod);
      case 'fog':
        return THEME_CONFIGS.foggy(tod);
      case 'rain':
      case 'drizzle':
        return THEME_CONFIGS.rainy(tod);
      case 'thunder':
        return THEME_CONFIGS.stormy(tod);
      case 'snow':
        return THEME_CONFIGS.snowy(tod);
      case 'sunset':
        return THEME_CONFIGS.sunny('evening');
      case 'sunrise':
        return THEME_CONFIGS.sunny('morning');
    }
  }

  // 2. Fallback if weather is undefined
  if (code === undefined) {
    return effectiveIsDay ? THEME_CONFIGS['partly-cloudy'](tod) : THEME_CONFIGS['clear-night']('night');
  }

  // 3. Map WMO condition code
  // Thunderstorms (95, 96, 99)
  if ([95, 96, 99].includes(code)) {
    return THEME_CONFIGS.stormy(tod);
  }

  // Snow (71, 73, 75, 77, 85, 86)
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return THEME_CONFIGS.snowy(tod);
  }

  // Rain / Drizzle / Showers (51..67, 80..82)
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return THEME_CONFIGS.rainy(tod);
  }

  // Fog (45, 48)
  if ([45, 48].includes(code)) {
    return THEME_CONFIGS.foggy(tod);
  }

  // Overcast (3)
  if (code === 3) {
    return THEME_CONFIGS.cloudy(tod);
  }

  // Partly Cloudy (2)
  if (code === 2) {
    return THEME_CONFIGS['partly-cloudy'](tod);
  }

  // Clear / Mainly Clear (0, 1)
  if (code <= 1) {
    if (!effectiveIsDay || tod === 'night') {
      return THEME_CONFIGS['clear-night']('night');
    }
    return THEME_CONFIGS.sunny(tod);
  }

  // Default fallback
  return effectiveIsDay ? THEME_CONFIGS['partly-cloudy'](tod) : THEME_CONFIGS['clear-night']('night');
}
