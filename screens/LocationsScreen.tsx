import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Btn, Card, EmptyState, IconBtn, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { DEFAULT_PLACES, Place, condition, fmtTemp, reverseGeocode, searchPlaces } from '../lib/weather';
import { resolveCurrentDevicePlace, openDeviceLocationSettings } from '../lib/locationService';

export default function LocationsScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme, weatherByPlace, loadPlaceWeather, scheme } = app;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    state.places.forEach((p) => loadPlaceWeather(p).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.places.length]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchPlaces(query);
      setResults(r);
      setSearching(false);
    }, 340);
    return () => clearTimeout(t);
  }, [query]);

  const [permissionDenied, setPermissionDenied] = useState(false);

  const useCurrentLocation = useCallback(async () => {
    setLocating(true);
    setError(null);
    setPermissionDenied(false);
    try {
      const res = await resolveCurrentDevicePlace(true);
      if (res.place) {
        app.addPlace(res.place);
        app.setActivePlace('current');
        navigation.goBack();
      } else if (res.status === 'denied') {
        setPermissionDenied(true);
        setError(res.errorMessage || 'Location permission denied. Enable location in Device Settings or search for a city below.');
      } else {
        setError(res.errorMessage || 'Could not determine your location. Try searching for a city instead.');
      }
    } catch {
      setError('Could not determine your location. Try searching instead.');
    } finally {
      setLocating(false);
    }
  }, [app, navigation]);

  const renderSaved = ({ item, index }: { item: Place; index: number }) => {
    const w = weatherByPlace[item.id];
    const active = item.id === state.activePlaceId;
    const c = w ? condition(w.current.code) : null;
    return (
      <Card style={{ marginBottom: 10, borderColor: active ? theme.accent : theme.hairline, borderWidth: active ? 1.5 : StyleSheet.hairlineWidth }} padded={false}>
        <Touch onPress={() => { app.setActivePlace(item.id); navigation.goBack(); }} scale={0.99}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: Space.md, gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: active ? theme.accent : theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={item.id === 'current' ? 'navigate' : 'location'} size={18} color={active ? theme.onAccent : theme.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Txt v="callout" w="700">{item.name}</Txt>
                {active && <Badge label="ACTIVE" color={theme.accent} bg={theme.accentSoft} />}
              </View>
              <Txt v="micro" c={theme.textTertiary} numberOfLines={1}>{[item.region, item.country].filter(Boolean).join(', ') || `${item.lat.toFixed(2)}, ${item.lon.toFixed(2)}`}</Txt>
            </View>
            {w && c ? (
              <View style={{ alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={(w.current.isDay ? c.icon : c.iconNight) as any} size={17} color={theme.textSecondary} />
                  <Txt v="title3" w="600">{fmtTemp(w.current.temp, state.settings.tempUnit)}</Txt>
                </View>
                <Txt v="micro" c={theme.textTertiary}>{c.short}</Txt>
              </View>
            ) : (
              <ActivityIndicator size="small" color={theme.textTertiary} />
            )}
          </View>
        </Touch>
        <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }}>
          <Touch onPress={() => app.reorderPlace(item.id, -1)} style={{ flex: 1 }} scale={0.97}>
            <View style={{ alignItems: 'center', paddingVertical: 9, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
              <Ionicons name="arrow-up" size={13} color={theme.textTertiary} />
              <Txt v="micro" c={theme.textTertiary} w="600">Up</Txt>
            </View>
          </Touch>
          <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
          <Touch onPress={() => app.reorderPlace(item.id, 1)} style={{ flex: 1 }} scale={0.97}>
            <View style={{ alignItems: 'center', paddingVertical: 9, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
              <Ionicons name="arrow-down" size={13} color={theme.textTertiary} />
              <Txt v="micro" c={theme.textTertiary} w="600">Down</Txt>
            </View>
          </Touch>
          <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: theme.hairline }} />
          <Touch onPress={() => app.removePlace(item.id)} style={{ flex: 1 }} disabled={state.places.length <= 1} scale={0.97}>
            <View style={{ alignItems: 'center', paddingVertical: 9, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
              <Ionicons name="trash-outline" size={13} color={theme.danger} />
              <Txt v="micro" c={theme.danger} w="600">Remove</Txt>
            </View>
          </Touch>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="chevron-back" onPress={() => navigation.goBack()} label="Back" />
        <View style={{ flex: 1 }}>
          <Txt v="headline" w="700">Locations</Txt>
          <Txt v="micro" c={theme.textTertiary}>{state.places.length} saved</Txt>
        </View>
      </View>

      <View style={{ paddingHorizontal: Space.lg, marginBottom: Space.sm }}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.bgElevated,
            borderRadius: Radius.pill, paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border,
          }}
        >
          <Ionicons name="search" size={17} color={theme.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search any city…"
            placeholderTextColor={theme.textTertiary}
            style={{ flex: 1, paddingVertical: 13, color: theme.text, fontSize: 16, /* @ts-ignore */ outlineStyle: 'none' }}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searching ? <ActivityIndicator size="small" color={theme.textTertiary} /> : query ? <IconBtn icon="close-circle" size={24} iconSize={17} bg="transparent" color={theme.textTertiary} onPress={() => setQuery('')} label="Clear" /> : null}
        </View>
      </View>

      <FlatList
        data={query.trim().length >= 2 ? [] : state.places}
        keyExtractor={(p) => p.id}
        renderItem={renderSaved}
        contentContainerStyle={{ paddingHorizontal: Space.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {query.trim().length >= 2 ? (
              <View style={{ marginBottom: Space.md }}>
                <Txt v="caption" c={theme.textTertiary} w="700" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Results</Txt>
                {results.length === 0 && !searching ? (
                  <Card><Txt v="callout" c={theme.textSecondary}>No matches for “{query}”. Try a different spelling.</Txt></Card>
                ) : (
                  results.map((p) => (
                    <Touch key={p.id} onPress={() => { app.addPlace(p); setQuery(''); navigation.goBack(); }} scale={0.99}>
                      <Card style={{ marginBottom: 8 }} padded={false}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', padding: Space.md, gap: 12 }}>
                          <Ionicons name="add-circle-outline" size={20} color={theme.accent} />
                          <View style={{ flex: 1 }}>
                            <Txt v="callout" w="600">{p.name}</Txt>
                            <Txt v="micro" c={theme.textTertiary}>{[p.region, p.country].filter(Boolean).join(', ')}</Txt>
                          </View>
                          <Txt v="micro" c={theme.textTertiary}>{p.lat.toFixed(1)}, {p.lon.toFixed(1)}</Txt>
                        </View>
                      </Card>
                    </Touch>
                  ))
                )}
              </View>
            ) : (
              <View style={{ marginBottom: Space.md }}>
                <Btn
                  title={locating ? 'Locating…' : 'Use my current location'}
                  icon="navigate"
                  full
                  loading={locating}
                  onPress={useCurrentLocation}
                />
                {error ? (
                  <View style={{ marginTop: 10, padding: 12, backgroundColor: theme.surfaceAlt, borderRadius: Radius.md, borderWidth: 1, borderColor: theme.hairline }}>
                    <Txt v="sub" c={theme.danger} style={{ lineHeight: 18 }}>{error}</Txt>
                    {permissionDenied ? (
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                        {Platform.OS !== 'web' ? (
                          <Btn
                            title="Open Settings"
                            kind="secondary"
                            small
                            icon="settings-outline"
                            onPress={openDeviceLocationSettings}
                          />
                        ) : null}
                        <Btn
                          title="Try again"
                          kind="primary"
                          small
                          icon="refresh-outline"
                          onPress={useCurrentLocation}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <Txt v="caption" c={theme.textTertiary} w="700" style={{ marginTop: Space.lg, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Saved locations</Txt>
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          query.trim().length >= 2 ? null : (
            <View style={{ marginTop: Space.lg }}>
              <Txt v="caption" c={theme.textTertiary} w="700" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Popular</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {DEFAULT_PLACES.filter((p) => !state.places.some((x) => x.name === p.name)).map((p) => (
                  <Touch key={p.id} onPress={() => app.addPlace(p)} scale={0.95}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: theme.surfaceAlt }}>
                      <Ionicons name="add" size={14} color={theme.textSecondary} />
                      <Txt v="sub" w="600" c={theme.textSecondary}>{p.name}</Txt>
                    </View>
                  </Touch>
                ))}
              </View>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
