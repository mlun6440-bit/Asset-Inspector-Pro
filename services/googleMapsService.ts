// Source: Google Maps Platform Code Assist
// Google Maps Platform Integration Service
// Internal Usage Attribution ID: gmp_mcp_codeassist_v1_aistudio

import { Loader } from '@googlemaps/js-api-loader';

export const GMP_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

// Retrieve configured API key from environment variable
export function getGoogleMapsApiKey(): string {
  const envKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim() !== '') {
    return envKey.trim();
  }
  // Check localStorage for custom user-configured key
  const userKey = localStorage.getItem('user_google_maps_api_key');
  if (userKey && userKey.trim() !== '') {
    return userKey.trim();
  }
  return '';
}

export function setCustomGoogleMapsApiKey(key: string): void {
  if (key && key.trim()) {
    localStorage.setItem('user_google_maps_api_key', key.trim());
  } else {
    localStorage.removeItem('user_google_maps_api_key');
  }
  googleMapsLoader = null;
}

let googleMapsLoader: Loader | null = null;

export function getMapsLoader(apiKey?: string): Loader {
  const key = apiKey || getGoogleMapsApiKey();
  if (!googleMapsLoader) {
    googleMapsLoader = new Loader({
      apiKey: key,
      version: 'weekly',
      libraries: ['places', 'marker', 'geocoding', 'core'],
    });
  }
  return googleMapsLoader;
}

export interface GeocodedLocation {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId?: string;
  streetNumber?: string;
  route?: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  country?: string;
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
 * Reverse geocodes coordinates (lat, lng) to a formatted address and structured components.
 */
export async function reverseGeocodeGoogle(lat: number, lng: number): Promise<GeocodedLocation | null> {
  const apiKey = getGoogleMapsApiKey();

  // 1. If Google Maps API is loaded in window, use the SDK Geocoder
  if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
    try {
      const geocoder = new (window as any).google.maps.Geocoder();
      const response = await geocoder.geocode({
        location: { lat, lng }
      });

      if (response.results && response.results.length > 0) {
        const result = response.results[0];
        const components: Record<string, string> = {};

        result.address_components.forEach((c: any) => {
          if (c.types.includes('street_number')) components.streetNumber = c.long_name;
          if (c.types.includes('route')) components.route = c.long_name;
          if (c.types.includes('locality') || c.types.includes('postal_town')) components.locality = c.long_name;
          if (c.types.includes('administrative_area_level_1')) components.administrativeArea = c.short_name;
          if (c.types.includes('postal_code')) components.postalCode = c.long_name;
          if (c.types.includes('country')) components.country = c.long_name;
        });

        return {
          latitude: result.geometry.location.lat(),
          longitude: result.geometry.location.lng(),
          formattedAddress: result.formatted_address,
          placeId: result.place_id,
          ...components
        };
      }
    } catch (sdkErr) {
      console.warn("Google Maps SDK Geocoder failed, trying REST fallback:", sdkErr);
    }
  }

  // 2. Direct REST Geocoding with API Key if available
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const result = data.results[0];
          return {
            latitude: result.geometry.location.lat,
            longitude: result.geometry.location.lng,
            formattedAddress: result.formatted_address,
            placeId: result.place_id
          };
        }
      }
    } catch (fetchErr) {
      console.warn("REST geocode error:", fetchErr);
    }
  }

  // 3. Fallback to coordinate string if offline or key not active
  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`
  };
}

/**
 * Geocodes an address string to precise coordinates and normalized address.
 */
export async function geocodeAddressGoogle(address: string): Promise<GeocodedLocation | null> {
  if (!address || address.trim() === '') return null;
  const apiKey = getGoogleMapsApiKey();

  // 1. Try SDK Geocoder if initialized
  if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
    try {
      const geocoder = new (window as any).google.maps.Geocoder();
      const response = await geocoder.geocode({ address });

      if (response.results && response.results.length > 0) {
        const result = response.results[0];
        return {
          latitude: result.geometry.location.lat(),
          longitude: result.geometry.location.lng(),
          formattedAddress: result.formatted_address,
          placeId: result.place_id
        };
      }
    } catch (err) {
      console.warn("Google Maps JS Geocoder failed:", err);
    }
  }

  // 2. Try REST API
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'OK' && data.results?.length > 0) {
          const result = data.results[0];
          return {
            latitude: result.geometry.location.lat,
            longitude: result.geometry.location.lng,
            formattedAddress: result.formatted_address,
            placeId: result.place_id
          };
        }
      }
    } catch (fetchErr) {
      console.warn("REST geocoding failed:", fetchErr);
    }
  }

  return null;
}

/**
 * Fetches address and place autocomplete predictions using Google Maps Places API (New).
 */
export async function fetchGooglePlaceSuggestions(
  query: string,
  sessionToken?: any
): Promise<PlaceSuggestion[]> {
  if (!query || query.trim().length < 2) return [];

  // Check if Google Places API (New) is available via JS SDK
  const google = (window as any).google;
  if (google?.maps?.places?.AutocompleteSuggestion) {
    try {
      const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        sessionToken: sessionToken || new google.maps.places.AutocompleteSessionToken(),
      });

      if (suggestions && suggestions.length > 0) {
        return suggestions.map((s: any) => {
          const placePrediction = s.placePrediction;
          return {
            placeId: placePrediction?.placeId || placePrediction?.toPlace()?.id || '',
            description: placePrediction?.text?.toString() || placePrediction?.structuredFormat?.mainText?.text || query,
            mainText: placePrediction?.structuredFormat?.mainText?.text || placePrediction?.text?.toString() || '',
            secondaryText: placePrediction?.structuredFormat?.secondaryText?.text || '',
          };
        });
      }
    } catch (err) {
      console.warn("AutocompleteSuggestion API call failed:", err);
    }
  }

  // Fallback to legacy AutocompleteService if new API not initialized
  if (google?.maps?.places?.AutocompleteService) {
    try {
      const service = new google.maps.places.AutocompleteService();
      const predictions = await new Promise<any[]>((resolve) => {
        service.getPlacePredictions({ input: query }, (results: any[], status: any) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            resolve(results);
          } else {
            resolve([]);
          }
        });
      });

      return predictions.map((p) => ({
        placeId: p.place_id,
        description: p.description,
        mainText: p.structured_formatting?.main_text || p.description,
        secondaryText: p.structured_formatting?.secondary_text || '',
      }));
    } catch (legacyErr) {
      console.warn("Places autocomplete fallback error:", legacyErr);
    }
  }

  return [];
}

/**
 * Gets browser HTML5 geolocation with fallback and high accuracy options.
 */
export function getCurrentDeviceLocation(): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy || 10
        });
      },
      (error) => {
        let msg = "Unable to retrieve device location.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Location access was denied. Please allow location permissions in your browser settings.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = "GPS position is currently unavailable.";
        } else if (error.code === error.TIMEOUT) {
          msg = "GPS location request timed out.";
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
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
