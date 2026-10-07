import type { Toilet } from '../types'

/**
 * 直接从 Overpass API 拉取最新的新加坡 OSM 厕所数据。
 * 用于「刷新数据」按钮 —— 打包进 App 的 toilets.json 是快照，这个是实时的。
 */
const OVERPASS_QUERY = `[out:json][timeout:120];
area["ISO3166-1"="SG"][admin_level=2]->.sg;
nwr["amenity"="toilets"](area.sg);
out center tags;`

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export async function fetchLiveToilets(): Promise<Toilet[]> {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: OVERPASS_QUERY }),
  })
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)

  const json = (await res.json()) as { elements: OverpassElement[] }
  const toilets: Toilet[] = []

  for (const el of json.elements) {
    const tags = el.tags ?? {}
    const access = (tags.access ?? '').toLowerCase()
    if (access === 'private' || access === 'no') continue
    if (tags.disused || tags.abandoned) continue
    const lat = el.type === 'node' ? el.lat : el.center?.lat
    const lon = el.type === 'node' ? el.lon : el.center?.lon
    if (lat === undefined || lon === undefined) continue

    const wheelchair = (tags.wheelchair ?? '').toLowerCase()
    toilets.push({
      id: `${el.type}/${el.id}`,
      lat: Number(lat.toFixed(7)),
      lon: Number(lon.toFixed(7)),
      name: tags['name:en'] ?? tags.name ?? null,
      landmark: null,
      operator: tags['operator:en'] ?? tags.operator ?? null,
      level: tags.level ?? tags['addr:floor'] ?? null,
      wheelchair:
        wheelchair === 'yes' || wheelchair === 'limited' || wheelchair === 'no'
          ? wheelchair
          : undefined,
      fee:
        tags.fee === 'yes' || tags.fee === 'no' ? (tags.fee as 'yes' | 'no') : undefined,
      changingTable:
        tags['changing_table'] === 'yes' || tags.diaper === 'yes'
          ? true
          : undefined,
      twentyFourSeven:
        tags.opening_hours === '24/7' ? true : undefined,
      openingHours: tags.opening_hours,
      source: 'osm',
    })
  }
  return toilets
}
