import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient as SvgRadialGradient,
  Stop,
  Circle,
  Path,
  G,
} from 'react-native-svg';

interface Props {
  code?: number;
  isDay?: boolean;
  size?: number;
}

export default function WeatherIllustration({ code = 2, isDay = true, size = 110 }: Props) {
  const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);
  const isThunder = [95, 96, 99].includes(code);
  const isSnow = [71, 73, 75, 77, 85, 86].includes(code);
  const isFog = [45, 48].includes(code);
  const isClear = [0, 1].includes(code);

  const showSun = isDay && (isClear || code === 2);
  const showMoon = !isDay && (isClear || code === 2);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Defs>
          {/* Sun Gradients */}
          <SvgRadialGradient id="sunGlow" cx="45%" cy="40%" r="55%">
            <Stop offset="0%" stopColor="#FFF9D2" />
            <Stop offset="30%" stopColor="#FFDE43" />
            <Stop offset="75%" stopColor="#FF9800" />
            <Stop offset="100%" stopColor="#F57C00" />
          </SvgRadialGradient>
          <SvgRadialGradient id="sunAura" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFC107" stopOpacity="0.45" />
            <Stop offset="60%" stopColor="#FF9800" stopOpacity="0.15" />
            <Stop offset="100%" stopColor="#FF9800" stopOpacity="0" />
          </SvgRadialGradient>

          {/* Cloud Gradients */}
          <SvgLinearGradient id="cloudGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" />
            <Stop offset="65%" stopColor="#F1F5F9" />
            <Stop offset="100%" stopColor="#D8E2EC" />
          </SvgLinearGradient>
          <SvgLinearGradient id="cloudBackGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#E2E8F0" />
            <Stop offset="100%" stopColor="#CBD5E1" />
          </SvgLinearGradient>
          <SvgLinearGradient id="rainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#38BDF8" />
            <Stop offset="100%" stopColor="#0284C7" />
          </SvgLinearGradient>
          <SvgLinearGradient id="lightningGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFF59D" />
            <Stop offset="100%" stopColor="#FBC02D" />
          </SvgLinearGradient>
          <SvgLinearGradient id="moonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FEF9C3" />
            <Stop offset="50%" stopColor="#FDE047" />
            <Stop offset="100%" stopColor="#EAB308" />
          </SvgLinearGradient>
        </Defs>

        {/* ---------------- Clear Sun / Sun behind cloud ---------------- */}
        {showSun && (
          <G>
            {/* Sun Aura */}
            <Circle cx={isClear ? 60 : 76} cy={isClear ? 60 : 42} r={isClear ? 52 : 36} fill="url(#sunAura)" />
            {/* Sun Body */}
            <Circle cx={isClear ? 60 : 76} cy={isClear ? 60 : 42} r={isClear ? 34 : 25} fill="url(#sunGlow)" />
            {/* Sun specular highlight */}
            <Circle
              cx={isClear ? 50 : 69}
              cy={isClear ? 50 : 35}
              r={isClear ? 10 : 7}
              fill="#FFFFFF"
              opacity="0.38"
            />
          </G>
        )}

        {/* ---------------- Moon for Night ---------------- */}
        {showMoon && (
          <G>
            <Path
              d={
                isClear
                  ? 'M 74 24 C 50 24 32 40 32 64 C 32 88 50 104 74 104 C 58 92 48 78 48 64 C 48 50 58 36 74 24 Z'
                  : 'M 78 26 C 62 26 50 36 50 52 C 50 68 62 78 78 78 C 68 70 62 61 62 52 C 62 43 68 34 78 26 Z'
              }
              fill="url(#moonGrad)"
            />
          </G>
        )}

        {/* ---------------- Thunder Lightning ---------------- */}
        {isThunder && (
          <Path
            d="M 58 70 L 48 88 L 57 88 L 47 108 L 70 84 L 59 84 Z"
            fill="url(#lightningGrad)"
          />
        )}

        {/* ---------------- Raindrops ---------------- */}
        {isRain && (
          <G opacity="0.9">
            <Path d="M 38 88 C 38 88 34 98 34 101 C 34 103 36 105 38 105 C 40 105 42 103 42 101 C 42 98 38 88 38 88 Z" fill="url(#rainGrad)" />
            <Path d="M 54 84 C 54 84 50 94 50 97 C 50 99 52 101 54 101 C 56 101 58 99 58 97 C 58 94 54 84 54 84 Z" fill="url(#rainGrad)" />
            <Path d="M 70 88 C 70 88 66 98 66 101 C 66 103 68 105 70 105 C 72 105 74 103 74 101 C 74 98 70 88 70 88 Z" fill="url(#rainGrad)" />
          </G>
        )}

        {/* ---------------- Snowflakes ---------------- */}
        {isSnow && (
          <G fill="#FFFFFF" opacity="0.95">
            <Circle cx="38" cy="94" r="3.5" />
            <Circle cx="54" cy="90" r="4" />
            <Circle cx="70" cy="95" r="3.5" />
            <Circle cx="46" cy="104" r="2.5" />
            <Circle cx="62" cy="102" r="3" />
          </G>
        )}

        {/* ---------------- Fog Mist Lines ---------------- */}
        {isFog && (
          <G opacity="0.95">
            <Path d="M 32 82 L 88 82" stroke="#CBD5E1" strokeWidth="4.5" strokeLinecap="round" />
            <Path d="M 22 92 L 80 92" stroke="#E2E8F0" strokeWidth="4.5" strokeLinecap="round" />
            <Path d="M 38 102 L 72 102" stroke="#CBD5E1" strokeWidth="4.5" strokeLinecap="round" />
          </G>
        )}

        {/* ---------------- Fluffy 3D Cloud (Front) ---------------- */}
        {!isClear && (
          <G>
            {/* Soft Shadow behind the main cloud */}
            <Path
              d="M 32 80 C 24 80 18 73 18 65 C 18 58 23 52 30 51 C 32 41 40 33 51 33 C 61 33 70 40 73 49 C 76 47 80 46 84 46 C 94 46 102 54 102 64 C 102 73 95 80 86 80 Z"
              fill="rgba(15, 23, 42, 0.14)"
              transform="translate(0, 3)"
            />
            {/* Cloud Main Body */}
            <Path
              d="M 32 80 C 24 80 18 73 18 65 C 18 58 23 52 30 51 C 32 41 40 33 51 33 C 61 33 70 40 73 49 C 76 47 80 46 84 46 C 94 46 102 54 102 64 C 102 73 95 80 86 80 Z"
              fill="url(#cloudGrad)"
            />
            {/* Top highlight for 3D puff volume */}
            <Path
              d="M 36 52 C 41 38 52 35 60 36 C 53 34 43 37 36 52 Z"
              fill="#FFFFFF"
              opacity="0.75"
            />
            <Circle cx="51" cy="45" r="14" fill="#FFFFFF" opacity="0.35" />
            <Circle cx="80" cy="56" r="12" fill="#FFFFFF" opacity="0.3" />
          </G>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
