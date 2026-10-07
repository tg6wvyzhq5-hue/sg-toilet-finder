import type { PlaceResult } from '../types'
import { isInSingapore } from './geo'

/**
 * 用 Nominatim（OpenStreetMap 官方地理编码）搜索新加坡地点。
 * 免费、无需 Key；使用时有 1 请求/秒 的礼貌限制，因此调用方需要做防抖 + 缓存。
 */
const cache = new Map<string, PlaceResult[]>()

interface NominatimItem {
  place_id: number
  display_name: string
  lat: string
  lon: string
  name?: string
  type?: string
  address?: Record<string, string>
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const key = query.trim().toLowerCase()
  if (key.length < 3) return []
  const cached = cache.get(key)
  if (cached) return cached

  const params = new URLSearchParams({
    q: key,
    format: 'jsonv2',
    countrycodes: 'sg',
    limit: '5',
    'accept-language': 'zh-CN,en',
  })

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)

  const items = (await res.json()) as NominatimItem[]
  const results: PlaceResult[] = items
    .map((item) => {
      const lat = Number(item.lat)
      const lon = Number(item.lon)
      const name =
        item.name ||
        item.display_name.split(',')[0]?.trim() ||
        item.display_name
      const detail = item.display_name
        .split(',')
        .slice(1, 4)
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' · ')
      return { id: `nominatim/${item.place_id}`, name, detail, lat, lon }
    })
    .filter((place) => isInSingapore(place.lat, place.lon))

  cache.set(key, results)
  return results
}
