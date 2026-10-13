import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Card, IconBtn, Segmented, Touch, Txt } from '../components/ui';
import { BarSeries, MetricTile, PrecipBars, SunArc, TempCurve } from '../components/Charts';
import { useApp } from '../lib/store';
import { Radius, Space, shadow } from '../lib/theme';
import {
  aqiFromWeather, aqiLabel, bestOutdoorWindow, condition, fmtTemp, fmtWind, hoursForDay, uvLabel, windCompass,
} from '../lib/weather';
import { comfortScore } from '../lib/gemini';
import { dateKey, formatHourShort, formatTime, relativeDay } from '../lib/utils';

export default function WeatherDetailScreen({ navigation }: any) {
  const { state, weather, activePlace, theme, scheme } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const settings = state.settings;
  const [dayIdx, setDayIdx] = useState(0);
  const [mode, setMode] = useState<'temp' | 'rain' | 'wind' | 'uv'>('temp');

  const contentW = Math.min(width, 560) - Space.lg * 2 - Space.lg * 2;

  if (!weather) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Txt c={theme.textSecondary}>Loading forecast…</Txt>
      </View>
    );
  }

  const day = weather.daily[dayIdx] || weather.daily[0];
  const dayHours = hoursForDay(weather, day.date);
  const hours = dayHours.length ? dayHours : weather.hourly.slice(0, 24);
  const cur = weather.current;
  const isToday = dayIdx === 0;
  const window = bestOutdoorWindow(weather, day.date);
  const c = condition(day.code);

  const dayEvents = state.events.filter((e) => e.date === day.date).sort((a, b) => a.startMinutes - b.startMinutes);
  const dayTasks = state.tasks.filter((t) => t.dueDate === day.date && !t.done);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: Space.lg, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconBtn
          icon="chevron-back"
          size={38}
          color={theme.text}
          bg={theme.surfaceAlt}
          border={theme.hairline}
          onPress={() => navigation.goBack()}
          label="Back"
        />
        <View style={{ flex: 1 }}>
          <Txt v="headline" w="700" c={theme.text}>{activePlace.name}</Txt>
          <Txt v="micro" c={theme.textSecondary}>
            {weather.source === 'live' ? 'Live forecast' : 'Modelled forecast'} · {weather.timezone}
          </Txt>
        </View>
        <IconBtn
          icon="options-outline"
          size={38}
          color={theme.text}
          bg={theme.surfaceAlt}
          border={theme.hairline}
          onPress={() => navigation.navigate('Locations')}
          label="Locations"
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: Space.md }}>
        {/* Day selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Space.lg, gap: 8 }}>
          {weather.daily.map((d, i) => {
            const active = i === dayIdx;
            const dc = condition(d.code);
            return (
              <Touch key={d.date} onPress={() => setDayIdx(i)} scale={0.95}>
                <View
                  style={{
                    width: 76,
                    alignItems: 'center',
                    gap: 5,
                    paddingVertical: 12,
                    borderRadius: Radius.md,
                    backgroundColor: active
                      ? (scheme === 'dark' ? 'rgba(124, 147, 255, 0.20)' : 'rgba(59, 91, 255, 0.12)')
                      : theme.bgElevated,
                    borderWidth: 1,
                    borderColor: active ? theme.accent : theme.hairline,
                    ...(active ? shadow(2, theme.shadow) : shadow(1, theme.shadow)),
                  }}
                >
                  <Txt v="micro" w="700" c={active ? theme.accent : theme.textSecondary}>
                    {i === 0 ? 'Today' : new Date(d.time).toLocaleDateString(undefined, { weekday: 'short' })}
                  </Txt>
                  <Ionicons name={dc.icon as any} size={20} color={active ? theme.accent : theme.text} />
                  <Txt v="sub" w="700" c={theme.text}>{fmtTemp(d.max, settings.tempUnit)}</Txt>
                  <Txt v="micro" c={theme.textTertiary}>{fmtTemp(d.min, settings.tempUnit)}</Txt>
                </View>
              </Touch>
            );
          })}
        </ScrollView>

        {/* Summary Card */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Card style={{ backgroundColor: theme.bgElevated, borderColor: theme.hairline }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Txt v="micro" c={theme.textTertiary} w="700" style={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                  {relativeDay(new Date(day.time))}
                </Txt>
                <Txt v="display" w="200" c={theme.text} style={{ fontSize: 62, lineHeight: 70, fontWeight: '200', marginTop: 4 }}>
                  {isToday ? fmtTemp(cur.temp, settings.tempUnit) : fmtTemp(day.max, settings.tempUnit)}
                </Txt>
                <Txt v="headline" w="600" c={theme.text}>{c.label}</Txt>
                <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 3 }}>
                  H:{fmtTemp(day.max, settings.tempUnit)} · L:{fmtTemp(day.min, settings.tempUnit)} · {day.pop}% rain
                </Txt>
              </View>
              <Ionicons name={c.icon as any} size={72} color={theme.accent} style={{ opacity: 0.9 }} />
            </View>

            {isToday && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <Badge label={`FEELS ${fmtTemp(cur.feelsLike, settings.tempUnit)}`} color={theme.text} bg={theme.surfaceAlt} />
                <Badge label={`COMFORT ${comfortScore(cur)}/100`} color={theme.text} bg={theme.surfaceAlt} />
                <Badge label={`AIR ${aqiLabel(aqiFromWeather(cur)).toUpperCase()}`} color={theme.text} bg={theme.surfaceAlt} />
              </View>
            )}
          </Card>
        </View>

        {/* Chart modes */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Card style={{ backgroundColor: theme.bgElevated, borderColor: theme.hairline }}>
            <Segmented
              options={[
                { key: 'temp', label: 'Temp', icon: 'thermometer-outline' },
                { key: 'rain', label: 'Rain', icon: 'rainy-outline' },
                { key: 'wind', label: 'Wind', icon: 'navigate-outline' },
                { key: 'uv', label: 'UV', icon: 'sunny-outline' },
              ]}
              value={mode}
              onChange={setMode}
              bg={theme.surfaceAlt}
              tint={theme.bgElevated}
              fg={theme.text}
            />

            <View style={{ marginTop: Space.md, alignItems: 'center' }}>
              {mode === 'temp' && (
                <TempCurve
                  hours={hours}
                  width={contentW}
                  height={140}
                  color={theme.accent}
                  textColor={theme.textSecondary}
                  unit={settings.tempUnit}
                />
              )}
              {mode === 'rain' && (
                <View style={{ width: contentW }}>
                  <PrecipBars
                    hours={hours.filter((_, i) => i % 2 === 0)}
                    width={contentW}
                    height={110}
                    color={theme.info}
                    trackColor={theme.surfaceAlt}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                    {hours.filter((_, i) => i % 6 === 0).map((h) => (
                      <Txt key={h.time} v="micro" c={theme.textTertiary}>
                        {formatHourShort(new Date(h.time), settings.use24h)}
                      </Txt>
                    ))}
                  </View>
                </View>
              )}
              {mode === 'wind' && (
                <BarSeries
                  values={hours.filter((_, i) => i % 3 === 0).map((h) => h.wind)}
                  labels={hours.filter((_, i) => i % 3 === 0).map((h) => formatHourShort(new Date(h.time), settings.use24h))}
                  width={contentW}
                  height={130}
                  color={theme.accent}
                  trackColor={theme.surfaceAlt}
                  textColor={theme.textSecondary}
                />
              )}
              {mode === 'uv' && (
                <BarSeries
                  values={hours.filter((_, i) => i % 3 === 0).map((h) => h.uv)}
                  labels={hours.filter((_, i) => i % 3 === 0).map((h) => formatHourShort(new Date(h.time), settings.use24h))}
                  width={contentW}
                  height={130}
                  color={theme.warning}
                  trackColor={theme.surfaceAlt}
                  textColor={theme.textSecondary}
                />
              )}
            </View>
          </Card>
        </View>

        {/* Hourly list */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Txt v="title3" w="700" c={theme.text} style={{ marginBottom: Space.sm }}>Hour by hour</Txt>
          <Card style={{ backgroundColor: theme.bgElevated, borderColor: theme.hairline }} padded={false}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: Space.md, gap: 6 }}>
              {hours.map((h) => {
                const hc = condition(h.code);
                return (
                  <View key={h.time} style={{ width: 60, alignItems: 'center', gap: 7 }}>
                    <Txt v="micro" c={theme.textTertiary} w="600">{formatHourShort(new Date(h.time), settings.use24h)}</Txt>
                    <Ionicons name={(h.isDay ? hc.icon : hc.iconNight) as any} size={19} color={theme.text} />
                    <Txt v="callout" w="600" c={theme.text}>{fmtTemp(h.temp, settings.tempUnit)}</Txt>
                    <View style={{ height: 46, width: 5, borderRadius: 5, backgroundColor: theme.surfaceAlt, justifyContent: 'flex-end', overflow: 'hidden' }}>
                      <View style={{ height: `${h.pop}%`, backgroundColor: theme.accent, borderRadius: 5 }} />
                    </View>
                    <Txt v="micro" c={theme.textTertiary}>{h.pop}%</Txt>
                  </View>
                );
              })}
            </ScrollView>
          </Card>
        </View>

        {/* Sun arc */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Card style={{ backgroundColor: theme.bgElevated, borderColor: theme.hairline }}>
            <Txt v="micro" c={theme.textTertiary} w="700" style={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>Daylight</Txt>
            <View style={{ alignItems: 'center', marginTop: 6 }}>
              <SunArc
                sunrise={day.sunrise}
                sunset={day.sunset}
                now={isToday ? Date.now() : (day.sunrise + day.sunset) / 2}
                width={contentW}
                height={104}
                color={theme.warning}
                trackColor={theme.surfaceAlt}
                textColor={theme.textTertiary}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <View>
                <Txt v="sub" w="700" c={theme.text}>{formatTime(day.sunrise, settings.use24h)}</Txt>
                <Txt v="micro" c={theme.textTertiary}>First light</Txt>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Txt v="sub" w="700" c={theme.text}>{Math.round((day.sunset - day.sunrise) / 3600000 * 10) / 10}h</Txt>
                <Txt v="micro" c={theme.textTertiary}>Daylight</Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt v="sub" w="700" c={theme.text}>{formatTime(day.sunset, settings.use24h)}</Txt>
                <Txt v="micro" c={theme.textTertiary}>Last light</Txt>
              </View>
            </View>
          </Card>
        </View>

        {/* Metrics */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Txt v="title3" w="700" c={theme.text} style={{ marginBottom: Space.sm }}>Details</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              { icon: 'thermometer-outline', label: 'Feels like', value: isToday ? fmtTemp(cur.feelsLike, settings.tempUnit) : fmtTemp((day.max + day.min) / 2, settings.tempUnit), sub: isToday ? 'Apparent temperature' : 'Daily mean' },
              { icon: 'water-outline', label: 'Humidity', value: `${Math.round(cur.humidity)}%`, sub: cur.humidity > 70 ? 'High moisture' : 'Comfortable' },
              { icon: 'navigate-outline', label: 'Wind', value: fmtWind(day.windMax, settings.windUnit), sub: `Gusting from ${windCompass(cur.windDir)}` },
              { icon: 'sunny-outline', label: 'UV max', value: `${Math.round(day.uvMax)}`, sub: uvLabel(day.uvMax) },
              { icon: 'rainy-outline', label: 'Precipitation', value: `${day.precipSum.toFixed(1)} mm`, sub: `${day.pop}% chance` },
              { icon: 'speedometer-outline', label: 'Pressure', value: `${Math.round(cur.pressure)}`, sub: cur.pressure > 1015 ? 'High / settled' : 'Low / changeable' },
              { icon: 'leaf-outline', label: 'Air quality', value: `${aqiFromWeather(cur)}`, sub: aqiLabel(aqiFromWeather(cur)) },
              { icon: 'eye-outline', label: 'Visibility', value: `${Math.round(cur.visibility)} km`, sub: cur.visibility > 12 ? 'Clear' : 'Hazy' },
              { icon: 'cloud-outline', label: 'Cloud cover', value: `${Math.round(cur.cloud)}%`, sub: cur.cloud > 70 ? 'Overcast' : 'Broken' },
            ].map((m) => (
              <MetricTile
                key={m.label}
                width={(Math.min(width, 560) - Space.lg * 2 - 20) / 3}
                icon={<Ionicons name={m.icon as any} size={13} color={theme.accent} />}
                label={m.label}
                value={m.value}
                sub={m.sub}
                textColor={theme.text}
                mutedColor={theme.textSecondary}
                bg={theme.bgElevated}
                border={theme.hairline}
              />
            ))}
          </View>
        </View>

        {/* Planning overlay */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Card style={{ backgroundColor: theme.bgElevated, borderColor: theme.hairline }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="sparkles" size={15} color={theme.accent} />
              <Txt v="micro" w="700" c={theme.textTertiary} style={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>What this means for your day</Txt>
            </View>
            {window && (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <Ionicons name="walk" size={16} color={theme.accent} />
                <Txt v="callout" c={theme.text} style={{ flex: 1, lineHeight: 21 }}>
                  Best outdoor window {formatTime(window.start, settings.use24h)}–{formatTime(window.end, settings.use24h)} · score {window.score}/100
                </Txt>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <Ionicons name="calendar-outline" size={16} color={theme.accent} />
              <Txt v="callout" c={theme.text} style={{ flex: 1, lineHeight: 21 }}>
                {dayEvents.length
                  ? `${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''} scheduled${dayEvents.some((e) => e.isOutdoor) ? `, ${dayEvents.filter((e) => e.isOutdoor).length} outdoors` : ''}.`
                  : 'No events on this day.'}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Ionicons name="checkmark-circle-outline" size={16} color={theme.accent} />
              <Txt v="callout" c={theme.text} style={{ flex: 1, lineHeight: 21 }}>
                {dayTasks.length
                  ? `${dayTasks.length} task${dayTasks.length > 1 ? 's' : ''} due${dayTasks.some((t) => t.context === 'outdoor') ? ` — including outdoor work` : ''}.`
                  : 'No tasks due on this day.'}
              </Txt>
            </View>
          </Card>
        </View>

        {/* Saved locations comparison */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Txt v="title3" w="700" c={theme.text} style={{ marginBottom: Space.sm }}>Your locations</Txt>
          <Card style={{ backgroundColor: theme.bgElevated, borderColor: theme.hairline }} padded={false}>
            {state.places.map((p, i) => (
              <Touch key={p.id} onPress={() => navigation.navigate('Locations')} scale={0.99}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: 13, gap: 10 }}>
                  <Ionicons name={p.id === state.activePlaceId ? 'location' : 'location-outline'} size={16} color={p.id === state.activePlaceId ? theme.accent : theme.textTertiary} />
                  <View style={{ flex: 1 }}>
                    <Txt v="callout" w="600" c={theme.text}>{p.name}</Txt>
                    <Txt v="micro" c={theme.textTertiary}>{[p.region, p.country].filter(Boolean).join(', ')}</Txt>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} />
                </View>
                {i < state.places.length - 1 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: Space.md + 26 }} />}
              </Touch>
            ))}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
