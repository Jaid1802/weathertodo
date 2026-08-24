import React, { useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import WeatherBackground from '../components/WeatherBackground';
import { Badge, GlassCard, IconBtn, Segmented, Touch, Txt } from '../components/ui';
import { BarSeries, MetricTile, PrecipBars, SunArc, TempCurve } from '../components/Charts';
import { useApp } from '../lib/store';
import { Radius, Space, getSky } from '../lib/theme';
import {
  aqiFromWeather, aqiLabel, bestOutdoorWindow, condition, fmtTemp, fmtWind, hoursForDay, skyFor, uvLabel, windCompass,
} from '../lib/weather';
import { comfortScore } from '../lib/gemini';
import { dateKey, formatHourShort, formatTime, relativeDay } from '../lib/utils';

export default function WeatherDetailScreen({ navigation }: any) {
  const { state, weather, activePlace } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const settings = state.settings;
  const [dayIdx, setDayIdx] = useState(0);
  const [mode, setMode] = useState<'temp' | 'rain' | 'wind' | 'uv'>('temp');

  const contentW = Math.min(width, 560) - Space.lg * 2 - Space.lg * 2;

  const sky = useMemo(() => {
    if (!weather) return getSky('cloudy');
    return getSky(skyFor(weather.current.code, weather.current.isDay));
  }, [weather]);

  if (!weather) {
    return (
      <View style={{ flex: 1, backgroundColor: sky.sky[1], alignItems: 'center', justifyContent: 'center' }}>
        <Txt c="#fff">Loading forecast…</Txt>
      </View>
    );
  }

  const day = weather.daily[dayIdx];
  const dayHours = hoursForDay(weather, day.date);
  const hours = dayHours.length ? dayHours : weather.hourly.slice(0, 24);
  const cur = weather.current;
  const isToday = dayIdx === 0;
  const glass = { tint: settings.highContrast ? 'rgba(0,0,0,0.44)' : sky.glass, border: settings.highContrast ? 'rgba(255,255,255,0.5)' : sky.glassBorder };
  const onSky = sky.onSky;
  const onSkyMuted = settings.highContrast ? 'rgba(255,255,255,0.9)' : sky.onSkyMuted;
  const window = bestOutdoorWindow(weather, day.date);
  const c = condition(day.code);

  const dayEvents = state.events.filter((e) => e.date === day.date).sort((a, b) => a.startMinutes - b.startMinutes);
  const dayTasks = state.tasks.filter((t) => t.dueDate === day.date && !t.done);

  return (
    <View style={{ flex: 1, backgroundColor: sky.sky[1] }}>
      <WeatherBackground sky={sky} dayProgress={0.5} reduceMotion={settings.reduceMotion} scrim={0.1} />

      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: Space.lg, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconBtn icon="chevron-back" size={38} color={onSky} bg={glass.tint} border={glass.border} onPress={() => navigation.goBack()} label="Back" />
        <View style={{ flex: 1 }}>
          <Txt v="headline" w="700" c={onSky}>{activePlace.name}</Txt>
          <Txt v="micro" c={onSkyMuted}>{weather.source === 'live' ? 'Live forecast' : 'Modelled forecast'} · {weather.timezone}</Txt>
        </View>
        <IconBtn icon="options-outline" size={38} color={onSky} bg={glass.tint} border={glass.border} onPress={() => navigation.navigate('Locations')} label="Locations" />
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
                    width: 74, alignItems: 'center', gap: 5, paddingVertical: 12, borderRadius: Radius.md,
                    backgroundColor: active ? 'rgba(255,255,255,0.22)' : glass.tint,
                    borderWidth: 1, borderColor: active ? 'rgba(255,255,255,0.5)' : glass.border,
                  }}
                >
                  <Txt v="micro" w="700" c={onSky}>{i === 0 ? 'Today' : new Date(d.time).toLocaleDateString(undefined, { weekday: 'short' })}</Txt>
                  <Ionicons name={dc.icon as any} size={19} color={onSky} />
                  <Txt v="sub" w="700" c={onSky}>{fmtTemp(d.max, settings.tempUnit)}</Txt>
                  <Txt v="micro" c={onSkyMuted}>{fmtTemp(d.min, settings.tempUnit)}</Txt>
                </View>
              </Touch>
            );
          })}
        </ScrollView>

        {/* Summary */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <GlassCard tint={glass.tint} border={glass.border}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Txt v="micro" c={onSkyMuted} w="700" style={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>{relativeDay(new Date(day.time))}</Txt>
                <Txt v="display" w="200" c={onSky} style={{ fontSize: 62, lineHeight: 70, fontWeight: '200', marginTop: 4 }}>
                  {isToday ? fmtTemp(cur.temp, settings.tempUnit) : fmtTemp(day.max, settings.tempUnit)}
                </Txt>
                <Txt v="headline" w="600" c={onSky}>{c.label}</Txt>
                <Txt v="sub" c={onSkyMuted} style={{ marginTop: 3 }}>
                  H:{fmtTemp(day.max, settings.tempUnit)} · L:{fmtTemp(day.min, settings.tempUnit)} · {day.pop}% rain
                </Txt>
              </View>
              <Ionicons name={c.icon as any} size={72} color={onSky} style={{ opacity: 0.9 }} />
            </View>

            {isToday && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <Badge label={`FEELS ${fmtTemp(cur.feelsLike, settings.tempUnit)}`} color={onSky} bg="rgba(255,255,255,0.16)" />
                <Badge label={`COMFORT ${comfortScore(cur)}/100`} color={onSky} bg="rgba(255,255,255,0.16)" />
                <Badge label={`AIR ${aqiLabel(aqiFromWeather(cur)).toUpperCase()}`} color={onSky} bg="rgba(255,255,255,0.16)" />
              </View>
            )}
          </GlassCard>
        </View>

        {/* Chart modes */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <GlassCard tint={glass.tint} border={glass.border}>
            <Segmented
              options={[
                { key: 'temp', label: 'Temp', icon: 'thermometer-outline' },
                { key: 'rain', label: 'Rain', icon: 'rainy-outline' },
                { key: 'wind', label: 'Wind', icon: 'navigate-outline' },
                { key: 'uv', label: 'UV', icon: 'sunny-outline' },
              ]}
              value={mode}
              onChange={setMode}
              bg="rgba(255,255,255,0.12)"
              tint="rgba(255,255,255,0.26)"
              fg={onSky}
            />

            <View style={{ marginTop: Space.md, alignItems: 'center' }}>
              {mode === 'temp' && <TempCurve hours={hours} width={contentW} height={140} color={sky.accent} textColor={onSky} unit={settings.tempUnit} />}
              {mode === 'rain' && (
                <View style={{ width: contentW }}>
                  <PrecipBars hours={hours.filter((_, i) => i % 2 === 0)} width={contentW} height={110} color={sky.accent} trackColor="rgba(255,255,255,0.14)" />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                    {hours.filter((_, i) => i % 6 === 0).map((h) => (
                      <Txt key={h.time} v="micro" c={onSkyMuted}>{formatHourShort(new Date(h.time), settings.use24h)}</Txt>
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
                  color={sky.accent}
                  trackColor="rgba(255,255,255,0.22)"
                  textColor={onSky}
                />
              )}
              {mode === 'uv' && (
                <BarSeries
                  values={hours.filter((_, i) => i % 3 === 0).map((h) => h.uv)}
                  labels={hours.filter((_, i) => i % 3 === 0).map((h) => formatHourShort(new Date(h.time), settings.use24h))}
                  width={contentW}
                  height={130}
                  color={sky.accent}
                  trackColor="rgba(255,255,255,0.22)"
                  textColor={onSky}
                />
              )}
            </View>
          </GlassCard>
        </View>

        {/* Hourly list */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Txt v="title3" w="700" c={onSky} style={{ marginBottom: Space.sm }}>Hour by hour</Txt>
          <GlassCard tint={glass.tint} border={glass.border} padded={false}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: Space.md, gap: 6 }}>
              {hours.map((h) => {
                const hc = condition(h.code);
                return (
                  <View key={h.time} style={{ width: 60, alignItems: 'center', gap: 7 }}>
                    <Txt v="micro" c={onSkyMuted} w="600">{formatHourShort(new Date(h.time), settings.use24h)}</Txt>
                    <Ionicons name={(h.isDay ? hc.icon : hc.iconNight) as any} size={19} color={onSky} />
                    <Txt v="callout" w="600" c={onSky}>{fmtTemp(h.temp, settings.tempUnit)}</Txt>
                    <View style={{ height: 46, width: 5, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.16)', justifyContent: 'flex-end', overflow: 'hidden' }}>
                      <View style={{ height: `${h.pop}%`, backgroundColor: sky.accent, borderRadius: 5 }} />
                    </View>
                    <Txt v="micro" c={onSkyMuted}>{h.pop}%</Txt>
                  </View>
                );
              })}
            </ScrollView>
          </GlassCard>
        </View>

        {/* Sun arc */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <GlassCard tint={glass.tint} border={glass.border}>
            <Txt v="micro" c={onSkyMuted} w="700" style={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>Daylight</Txt>
            <View style={{ alignItems: 'center', marginTop: 6 }}>
              <SunArc
                sunrise={day.sunrise}
                sunset={day.sunset}
                now={isToday ? Date.now() : (day.sunrise + day.sunset) / 2}
                width={contentW}
                height={104}
                color={sky.accent}
                trackColor="rgba(255,255,255,0.3)"
                textColor={onSkyMuted}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <View>
                <Txt v="sub" w="700" c={onSky}>{formatTime(day.sunrise, settings.use24h)}</Txt>
                <Txt v="micro" c={onSkyMuted}>First light</Txt>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Txt v="sub" w="700" c={onSky}>{Math.round((day.sunset - day.sunrise) / 3600000 * 10) / 10}h</Txt>
                <Txt v="micro" c={onSkyMuted}>Daylight</Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt v="sub" w="700" c={onSky}>{formatTime(day.sunset, settings.use24h)}</Txt>
                <Txt v="micro" c={onSkyMuted}>Last light</Txt>
              </View>
            </View>
          </GlassCard>
        </View>

        {/* Metrics */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Txt v="title3" w="700" c={onSky} style={{ marginBottom: Space.sm }}>Details</Txt>
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
                icon={<Ionicons name={m.icon as any} size={13} color={onSkyMuted} />}
                label={m.label}
                value={m.value}
                sub={m.sub}
                textColor={onSky}
                mutedColor={onSkyMuted}
                bg={glass.tint}
                border={glass.border}
              />
            ))}
          </View>
        </View>

        {/* Planning overlay */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <GlassCard tint={glass.tint} border={glass.border}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="sparkles" size={15} color={sky.accent} />
              <Txt v="micro" w="700" c={onSkyMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>What this means for your day</Txt>
            </View>
            {window && (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <Ionicons name="walk" size={16} color={sky.accent} />
                <Txt v="callout" c={onSky} style={{ flex: 1, lineHeight: 21 }}>
                  Best outdoor window {formatTime(window.start, settings.use24h)}–{formatTime(window.end, settings.use24h)} · score {window.score}/100
                </Txt>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <Ionicons name="calendar-outline" size={16} color={sky.accent} />
              <Txt v="callout" c={onSky} style={{ flex: 1, lineHeight: 21 }}>
                {dayEvents.length
                  ? `${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''} scheduled${dayEvents.some((e) => e.isOutdoor) ? `, ${dayEvents.filter((e) => e.isOutdoor).length} outdoors` : ''}.`
                  : 'No events on this day.'}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Ionicons name="checkmark-circle-outline" size={16} color={sky.accent} />
              <Txt v="callout" c={onSky} style={{ flex: 1, lineHeight: 21 }}>
                {dayTasks.length
                  ? `${dayTasks.length} task${dayTasks.length > 1 ? 's' : ''} due${dayTasks.some((t) => t.context === 'outdoor') ? ` — including outdoor work` : ''}.`
                  : 'No tasks due on this day.'}
              </Txt>
            </View>
          </GlassCard>
        </View>

        {/* Saved locations comparison */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Txt v="title3" w="700" c={onSky} style={{ marginBottom: Space.sm }}>Your locations</Txt>
          <GlassCard tint={glass.tint} border={glass.border} padded={false}>
            {state.places.map((p, i) => (
              <Touch key={p.id} onPress={() => navigation.navigate('Locations')} scale={0.99}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: 13, gap: 10 }}>
                  <Ionicons name={p.id === state.activePlaceId ? 'location' : 'location-outline'} size={16} color={p.id === state.activePlaceId ? sky.accent : onSkyMuted} />
                  <View style={{ flex: 1 }}>
                    <Txt v="callout" w="600" c={onSky}>{p.name}</Txt>
                    <Txt v="micro" c={onSkyMuted}>{[p.region, p.country].filter(Boolean).join(', ')}</Txt>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={onSkyMuted} />
                </View>
                {i < state.places.length - 1 && <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginLeft: Space.md + 26 }} />}
              </Touch>
            ))}
          </GlassCard>
        </View>
      </ScrollView>
    </View>
  );
}
