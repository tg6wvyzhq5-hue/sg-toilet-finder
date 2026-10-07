import type { Toilet } from '../types'

/**
 * 可选的 Google Places 集成。
 *
 * 只有在 .env 里配置了 VITE_GOOGLE_MAPS_API_KEY 时才会启用：
 *   VITE_GOOGLE_MAPS_API_KEY=AIza...
 *
 * 使用 Places API (New) 的 searchNearby 接口补齐 OSM 里没有收录的厕所
 * （例如商场、酒店内部厕所）。需要在 Google Cloud 里启用
 * 「Places API (New)」并给 Key 加上 HTTP referrer 限制。
 */
const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim()

export const googleEnabled = API_KEY.length > 0

interface PlacesNewResponse {
  places?: Array<{
    id: string
    displayName?: { text?: string }
    location?: { latitude: number; longitude: number }
    formattedAddress?: string
  }>
  error?: { message?: string }
}

export async function searchNearbyToilets(
  center: { lat: number; lon: number },
  radius = 1200,
): Promise<Toilet[]> {
  if (!googleEnabled) return []

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.location,places.formattedAddress',
    },
    body: JSON.stringify({
      includedTypes: ['public_bathroom'],
      maxResultCount: 20,
      languageCode: 'zh-CN',
      locationRestriction: {
        circle: {
          center: { latitude: center.lat, longitude: center.lon },
          radius,
        },
      },
    }),
  })

  const json = (await res.json()) as PlacesNewResponse
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Places API HTTP ${res.status}`)
  }

  return (json.places ?? [])
    .filter((place) => place.location)
    .map((place) => ({
      id: `google/${place.id}`,
      lat: place.location!.latitude,
      lon: place.location!.longitude,
      name: place.displayName?.text ?? null,
      landmark: null,
      address: place.formattedAddress,
      source: 'google' as const,
    }))
}
