import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Txt } from './ui';
import { useApp } from '../lib/store';
import { HourPoint, fmtTemp } from '../lib/weather';
import { Radius, Space } from '../lib/theme';

function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function TempCurve({
  hours, width, height = 120, color, textColor, unit, showLabels = true,
}: {
  hours: HourPoint[];
  width: number;
  height?: number;
  color: string;
  textColor: string;
  unit: 'C' | 'F';
  showLabels?: boolean;
}) {
  if (hours.length < 2) return null;
  const padY = showLabels ? 26 : 8;
  const temps = hours.map((h) => h.temp);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = Math.max(1, max - min);
  const stepX = width / (hours.length - 1);
  const pts = hours.map((h, i) => ({
    x: i * stepX,
    y: padY + (1 - (h.temp - min) / range) * (height - padY * 2),
  }));
  const d = smoothPath(pts);
  const area = `${d} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z`;
  const maxIdx = temps.indexOf(max);
  const minIdx = temps.indexOf(min);
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.34" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgGradient>
      </Defs>
      <Path d={area} fill="url(#tempFill)" />
      <Path d={d} stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {showLabels && (
        <G>
          <SvgText x={Math.min(width - 22, Math.max(14, pts[maxIdx].x))} y={pts[maxIdx].y - 10} fill={textColor} fontSize="11" fontWeight="700" textAnchor="middle">
            {fmtTemp(max, unit)}
          </SvgText>
          <SvgText x={Math.min(width - 22, Math.max(14, pts[minIdx].x))} y={pts[minIdx].y + 18} fill={textColor} fontSize="11" fontWeight="700" textAnchor="middle">
            {fmtTemp(min, unit)}
          </SvgText>
          <Circle cx={pts[maxIdx].x} cy={pts[maxIdx].y} r={3} fill={color} />
          <Circle cx={pts[minIdx].x} cy={pts[minIdx].y} r={3} fill={color} />
        </G>
      )}
    </Svg>
  );
}

export function PrecipBars({ hours, width, height = 54, color, trackColor }: { hours: HourPoint[]; width: number; height?: number; color: string; trackColor: string }) {
  const n = hours.length;
  const gap = 3;
  const bw = Math.max(2, (width - gap * (n - 1)) / n);
  return (
    <Svg width={width} height={height}>
      {hours.map((h, i) => {
        const bh = Math.max(2, (h.pop / 100) * height);
        return (
          <G key={i}>
            <Rect x={i * (bw + gap)} y={0} width={bw} height={height} rx={bw / 2} fill={trackColor} />
            <Rect x={i * (bw + gap)} y={height - bh} width={bw} height={bh} rx={bw / 2} fill={color} />
          </G>
        );
      })}
    </Svg>
  );
}

export function SunArc({
  sunrise, sunset, now, width, height = 92, color, trackColor, textColor,
}: { sunrise: number; sunset: number; now: number; width: number; height?: number; color: string; trackColor: string; textColor: string }) {
  const p = Math.max(0, Math.min(1, (now - sunrise) / Math.max(1, sunset - sunrise)));
  const r = width / 2 - 16;
  const cx = width / 2;
  const cy = height - 14;
  const angle = Math.PI * (1 - p);
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const progArc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`;
  return (
    <Svg width={width} height={height}>
      <Path d={arc} stroke={trackColor} strokeWidth={2} fill="none" strokeDasharray="4 6" strokeLinecap="round" />
      <Path d={progArc} stroke={color} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Line x1={10} y1={cy} x2={width - 10} y2={cy} stroke={trackColor} strokeWidth={1} />
      <Circle cx={x} cy={y} r={7} fill={color} />
      <Circle cx={x} cy={y} r={13} fill={color} opacity={0.22} />
      <SvgText x={cx - r} y={cy + 16} fill={textColor} fontSize="10.5" textAnchor="start">Sunrise</SvgText>
      <SvgText x={cx + r} y={cy + 16} fill={textColor} fontSize="10.5" textAnchor="end">Sunset</SvgText>
    </Svg>
  );
}

export function BarSeries({
  values, labels, width, height = 110, color, trackColor, textColor, suffix = '',
}: { values: number[]; labels: string[]; width: number; height?: number; color: string; trackColor: string; textColor: string; suffix?: string }) {
  const max = Math.max(1, ...values);
  const n = values.length;
  const gap = 8;
  const bw = Math.max(6, (width - gap * (n - 1)) / n);
  const chartH = height - 22;
  return (
    <Svg width={width} height={height}>
      {values.map((v, i) => {
        const bh = Math.max(3, (v / max) * (chartH - 14));
        return (
          <G key={i}>
            <Rect x={i * (bw + gap)} y={chartH - bh} width={bw} height={bh} rx={Math.min(6, bw / 2)} fill={v === max ? color : trackColor} />
            <SvgText x={i * (bw + gap) + bw / 2} y={chartH - bh - 4} fill={textColor} fontSize="9.5" fontWeight="700" textAnchor="middle">
              {Math.round(v)}{suffix}
            </SvgText>
            <SvgText x={i * (bw + gap) + bw / 2} y={height - 4} fill={textColor} fontSize="10" textAnchor="middle">
              {labels[i]}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

export function MetricTile({
  icon, label, value, sub, tint, textColor, mutedColor, bg, border, width,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tint?: string;
  textColor: string;
  mutedColor: string;
  bg: string;
  border: string;
  width?: number | string;
}) {
  return (
    <View
      style={{
        width: width as any,
        backgroundColor: bg,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: border,
        padding: Space.sm + 2,
        gap: 5,
        minHeight: 92,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Txt v="micro" c={mutedColor} w="600" style={{ textTransform: 'uppercase', letterSpacing: 0.7 }}>{label}</Txt>
      </View>
      <View>
        <Txt v="title3" w="700" c={textColor}>{value}</Txt>
        {sub && <Txt v="caption" c={mutedColor} numberOfLines={2} style={{ marginTop: 1 }}>{sub}</Txt>}
      </View>
    </View>
  );
}
