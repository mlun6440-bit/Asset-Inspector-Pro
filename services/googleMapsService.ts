// Google Maps Platform Integration Service (Zero-Legacy Modern Places API New + Maps JS SDK)
// Internal Usage Attribution ID: gmp_mcp_codeassist_v1_aistudio
// Modern Places API docs: https://developers.google.com/maps/documentation/javascript/places?utm_campaign=gmp_mcp_codeassist_v1_aistudio

export const GMP_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

// Active session token for bundling AutocompleteSuggestion + Place.fetchFields into a single Pro-tier session
let activeSessionToken: any = null;

/**
 * Retrieve Google Maps Platform API key from environment variables only (never hardcoded).
 */
export function getGoogleMapsApiKey(): string {
  const viteKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;
  if (viteKey && typeof viteKey === 'string' && viteKey.trim() !== '') {
    return viteKey.trim();
  }
  const processKey = (process.env as any)?.GOOGLE_MAPS_API_KEY;
  if (processKey && typeof processKey === 'string' && processKey.trim() !== '') {
    return processKey.trim();
  }
  return '';
}

export interface GeocodedLocation {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId?: string;
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Helper to dynamically import the modern Places library from the active Google Maps JS SDK.
 */
async function getPlacesLibrary(): Promise<any | null> {
  if (typeof window === 'undefined') return null;
  const maps = (window as any).google?.maps;
  if (!maps) return null;

  if (maps.places?.AutocompleteSuggestion && maps.places?.Place) {
    return maps.places;
  }

  if (typeof maps.importLibrary === 'function') {
    try {
      return await maps.importLibrary('places');
    } catch (err) {
      console.warn('[GoogleMaps] Unable to load Places library:', err);
      return null;
    }
  }

  return null;
}

/**
 * Reverse resolves coordinates (lat, lng) using modern Places API (New) searchNearby when active,
 * falling back cleanly to formatted GPS coordinates when offline or when no nearby place exists.
 */
export async function reverseGeocodeGoogle(lat: number, lng: number): Promise<GeocodedLocation | null> {
  const placesLib = await getPlacesLibrary();

  if (placesLib?.Place?.searchNearby) {
    try {
      const { places } = await placesLib.Place.searchNearby({
        fields: ['id', 'formattedAddress', 'location', 'displayName'],
        locationRestriction: {
          center: { lat, lng },
          radius: 50,
        },
        maxResultCount: 1,
      });

      const match = places?.[0];
      if (match?.formattedAddress) {
        const matchLat =
          typeof match.location?.lat === 'function' ? match.location.lat() : match.location?.lat ?? lat;
        const matchLng =
          typeof match.location?.lng === 'function' ? match.location.lng() : match.location?.lng ?? lng;
        return {
          latitude: matchLat,
          longitude: matchLng,
          formattedAddress: match.formattedAddress,
          placeId: match.id,
        };
      }
    } catch (err) {
      console.warn('[GoogleMaps] Places searchNearby reverse lookup failed:', err);
    }
  }

  // Graceful fallback to precise GPS coordinates when API is unavailable
  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`,
  };
}

/**
 * Resolves a Place ID or free-text address to precise coordinates using modern Places API (New).
 * Uses Place.fetchFields when a placeId is available (completing and resetting the autocomplete session),
 * or Place.searchByText for direct address queries.
 */
export async function geocodeAddressGoogle(
  address: string,
  placeId?: string
): Promise<GeocodedLocation | null> {
  if ((!address || address.trim() === '') && !placeId) return null;

  const placesLib = await getPlacesLibrary();
  if (!placesLib?.Place) return null;

  // 1. Preferred: Resolve exact Place ID via Place.fetchFields (bundles with active AutocompleteSessionToken)
  if (placeId) {
    try {
      const place = new placesLib.Place({ id: placeId });
      await place.fetchFields({
        fields: ['location', 'formattedAddress', 'id'],
      });
      // Consume/reset session token after fetchFields per Places API (New) session best practices
      activeSessionToken = null;

      if (place.location) {
        const lat = typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat;
        const lng = typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng;
        if (typeof lat === 'number' && typeof lng === 'number') {
          return {
            latitude: lat,
            longitude: lng,
            formattedAddress: place.formattedAddress || address,
            placeId: place.id || placeId,
          };
        }
      }
    } catch (err) {
      console.warn('[GoogleMaps] Place.fetchFields lookup failed:', err);
      activeSessionToken = null;
    }
  }

  // 2. Text Search via modern Place.searchByText
  if (address && address.trim() !== '' && typeof placesLib.Place.searchByText === 'function') {
    try {
      const { places } = await placesLib.Place.searchByText({
        textQuery: address.trim(),
        fields: ['id', 'formattedAddress', 'location'],
        maxResultCount: 1,
      });

      const match = places?.[0];
      if (match?.location) {
        const lat = typeof match.location.lat === 'function' ? match.location.lat() : match.location.lat;
        const lng = typeof match.location.lng === 'function' ? match.location.lng() : match.location.lng;
        if (typeof lat === 'number' && typeof lng === 'number') {
          return {
            latitude: lat,
            longitude: lng,
            formattedAddress: match.formattedAddress || address,
            placeId: match.id,
          };
        }
      }
    } catch (err) {
      console.warn('[GoogleMaps] Place.searchByText lookup failed:', err);
    }
  }

  return null;
}

/**
 * Fetches address and place autocomplete predictions using Google Maps Places API (New)
 * AutocompleteSuggestion with session token management.
 */
export async function fetchGooglePlaceSuggestions(
  query: string,
  sessionToken?: any
): Promise<PlaceSuggestion[]> {
  if (!query || query.trim().length < 2) return [];

  const placesLib = await getPlacesLibrary();
  if (!placesLib?.AutocompleteSuggestion) return [];

  try {
    if (!sessionToken && !activeSessionToken && placesLib.AutocompleteSessionToken) {
      activeSessionToken = new placesLib.AutocompleteSessionToken();
    }

    const { suggestions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query.trim(),
      sessionToken: sessionToken || activeSessionToken,
    });

    if (suggestions && suggestions.length > 0) {
      return suggestions
        .map((s: any) => {
          const placePrediction = s.placePrediction;
          if (!placePrediction) return null;
          return {
            placeId: placePrediction.placeId || '',
            description:
              placePrediction.text?.toString() ||
              placePrediction.structuredFormat?.mainText?.text ||
              query,
            mainText:
              placePrediction.structuredFormat?.mainText?.text ||
              placePrediction.text?.toString() ||
              '',
            secondaryText: placePrediction.structuredFormat?.secondaryText?.text || '',
          };
        })
        .filter(Boolean) as PlaceSuggestion[];
    }
  } catch (err) {
    console.warn('[GoogleMaps] AutocompleteSuggestion call failed:', err);
  }

  return [];
}

/**
 * Gets browser HTML5 geolocation with high-accuracy options.
 */
export function getCurrentDeviceLocation(): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy || 10,
        });
      },
      (error) => {
        let msg = 'Unable to retrieve device location.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location access was denied. Please allow location permissions in your browser settings.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'GPS position is currently unavailable.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'GPS location request timed out.';
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  });
}

/**
 * Generates a direct Google Maps URL for directions / view in new tab.
 */
export function getGoogleMapsNavigationUrl(addressOrCoords: string | { lat: number; lng: number }): string {
  if (typeof addressOrCoords === 'string') {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressOrCoords)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${addressOrCoords.lat},${addressOrCoords.lng}`;
}
