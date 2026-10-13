import { Platform, Linking } from 'react-native';
import { Place, reverseGeocode } from './weather';
import { readLocalCache, writeLocalCache } from './syncService';

export const LAST_KNOWN_PLACE_KEY = '@weatherwhattodo/last_known_place';

export type LocationPermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export interface LocationResolutionResult {
  place: Place | null;
  status: LocationPermissionState;
  canAskAgain: boolean;
  errorMessage?: string;
}

/**
 * Checks current OS foreground location permission without prompting the user.
 */
export async function checkLocationPermission(): Promise<{ status: LocationPermissionState; canAskAgain: boolean }> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return { status: 'unavailable', canAskAgain: false };
    }
    if (typeof navigator.permissions !== 'undefined' && navigator.permissions.query) {
      try {
        const res = await navigator.permissions.query({ name: 'geolocation' as any });
        const st: LocationPermissionState =
          res.state === 'granted' ? 'granted' : res.state === 'denied' ? 'denied' : 'undetermined';
        return { status: st, canAskAgain: res.state !== 'denied' };
      } catch {
        return { status: 'undetermined', canAskAgain: true };
      }
    }
    return { status: 'undetermined', canAskAgain: true };
  }

  try {
    const Location = await import('expo-location');
    const perm = await Location.getForegroundPermissionsAsync();
    const status: LocationPermissionState =
      perm.status === 'granted'
        ? 'granted'
        : perm.status === 'denied'
        ? 'denied'
        : 'undetermined';
    return {
      status,
      canAskAgain: perm.canAskAgain ?? (status !== 'denied'),
    };
  } catch (err) {
    console.warn('[LocationService] Error checking permissions:', err);
    return { status: 'unavailable', canAskAgain: false };
  }
}

/**
 * Requests OS foreground location permission using native system dialogs.
 */
export async function requestLocationPermission(): Promise<{ status: LocationPermissionState; canAskAgain: boolean }> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return { status: 'unavailable', canAskAgain: false };
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve({ status: 'granted', canAskAgain: true }),
        (err) => {
          const isDenied = err.code === 1;
          resolve({ status: isDenied ? 'denied' : 'unavailable', canAskAgain: !isDenied });
        },
        { timeout: 10000, enableHighAccuracy: false }
      );
    });
  }

  try {
    const Location = await import('expo-location');
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.status === 'granted') {
      return { status: 'granted', canAskAgain: true };
    }

    const requested = await Location.requestForegroundPermissionsAsync();
    const status: LocationPermissionState =
      requested.status === 'granted'
        ? 'granted'
        : requested.status === 'denied'
        ? 'denied'
        : 'undetermined';

    return {
      status,
      canAskAgain: requested.canAskAgain ?? (status !== 'denied'),
    };
  } catch (err) {
    console.warn('[LocationService] Error requesting permissions:', err);
    return { status: 'unavailable', canAskAgain: false };
  }
}

/**
 * Retrieves the device's current coordinates with timeout protection
 * and fallback to last known position if balanced GPS is slow.
 */
export async function getCurrentDeviceCoordinates(): Promise<{ lat: number; lon: number } | null> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return null;
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  try {
    const Location = await import('expo-location');

    // 1. Try getCurrentPositionAsync with a timeout race
    const positionPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));

    const pos = await Promise.race([positionPromise, timeoutPromise]);
    if (pos && pos.coords) {
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    }

    // 2. Fallback to getLastKnownPositionAsync if fresh fix timed out
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown && lastKnown.coords) {
      return { lat: lastKnown.coords.latitude, lon: lastKnown.coords.longitude };
    }

    return null;
  } catch (err) {
    console.warn('[LocationService] Error getting current coordinates:', err);
    return null;
  }
}

/**
 * Resolves the device's actual current location and reverse-geocodes it to a Place.
 * Automatically saves successfully resolved coordinates to persistent storage.
 */
export async function resolveCurrentDevicePlace(
  requestPermissionIfNeeded = false
): Promise<LocationResolutionResult> {
  let { status, canAskAgain } = await checkLocationPermission();

  if (status !== 'granted' && requestPermissionIfNeeded) {
    const req = await requestLocationPermission();
    status = req.status;
    canAskAgain = req.canAskAgain;
  }

  if (status !== 'granted') {
    return {
      place: null,
      status,
      canAskAgain,
      errorMessage:
        status === 'denied'
          ? 'Location permission was denied. You can enable it in Device Settings or search for a city manually.'
          : 'Location services are currently unavailable.',
    };
  }

  const coords = await getCurrentDeviceCoordinates();
  if (!coords) {
    // Check if we have a previously saved location to fallback to
    const saved = await getLastKnownPlace();
    if (saved) {
      return {
        place: saved,
        status: 'granted',
        canAskAgain: true,
      };
    }
    return {
      place: null,
      status: 'granted',
      canAskAgain: true,
      errorMessage: 'Could not obtain GPS coordinates from the device. Please check that location is enabled.',
    };
  }

  try {
    const geo = await reverseGeocode(coords.lat, coords.lon);
    const place: Place = {
      ...geo,
      id: 'current',
    };

    // Save as last successfully resolved place
    await saveLastKnownPlace(place);

    return {
      place,
      status: 'granted',
      canAskAgain: true,
    };
  } catch (err) {
    console.warn('[LocationService] Reverse geocode error:', err);
    const place: Place = {
      id: 'current',
      name: 'Current location',
      lat: coords.lat,
      lon: coords.lon,
    };
    await saveLastKnownPlace(place);
    return {
      place,
      status: 'granted',
      canAskAgain: true,
    };
  }
}

/**
 * Opens system application settings so the user can grant permission if permanently denied.
 */
export async function openDeviceLocationSettings(): Promise<void> {
  try {
    if (Platform.OS !== 'web' && Linking.openSettings) {
      await Linking.openSettings();
    } else {
      console.log('[LocationService] Open settings requested on Web');
    }
  } catch (err) {
    console.warn('[LocationService] Failed to open system settings:', err);
  }
}

/**
 * Reads the last successfully resolved device place from persistent local storage.
 */
export async function getLastKnownPlace(): Promise<Place | null> {
  try {
    const place = await readLocalCache(LAST_KNOWN_PLACE_KEY);
    if (place && typeof place.lat === 'number' && typeof place.lon === 'number') {
      return {
        ...place,
        id: 'current',
      };
    }
  } catch {}
  return null;
}

/**
 * Persists the last successfully resolved device place to local storage.
 */
export async function saveLastKnownPlace(place: Place): Promise<void> {
  try {
    await writeLocalCache(LAST_KNOWN_PLACE_KEY, place);
  } catch {}
}
