import type { Toilet } from '../types'

/** 各平台的步行导航深链（不需要任何 API Key） */

export function googleWalkingUrl(
  toilet: Toilet,
  origin?: { lat: number; lon: number } | null,
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${toilet.lat},${toilet.lon}`,
    travelmode: 'walking',
  })
  if (origin) params.set('origin', `${origin.lat},${origin.lon}`)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function googlePlaceUrl(toilet: Toilet): string {
  const params = new URLSearchParams({
    api: '1',
    query: `${toilet.lat},${toilet.lon}`,
  })
  return `https://www.google.com/maps/search/?${params.toString()}`
}

export function appleMapsUrl(toilet: Toilet): string {
  const params = new URLSearchParams({
    daddr: `${toilet.lat},${toilet.lon}`,
    dirflg: 'w',
  })
  const label = toilet.name ?? toilet.landmark
  if (label) params.set('q', label)
  return `https://maps.apple.com/?${params.toString()}`
}

export function citymapperUrl(
  toilet: Toilet,
  origin?: { lat: number; lon: number } | null,
): string {
  const params = new URLSearchParams({
    endcoord: `${toilet.lat},${toilet.lon}`,
  })
  const label = toilet.name ?? toilet.landmark
  if (label) params.set('endname', label)
  if (origin) params.set('startcoord', `${origin.lat},${origin.lon}`)
  return `https://citymapper.com/directions?${params.toString()}`
}

export function osmUrl(toilet: Toilet): string {
  return `https://www.openstreetmap.org/?mlat=${toilet.lat}&mlon=${toilet.lon}#map=19/${toilet.lat}/${toilet.lon}`
}

/** 生成可分享的定位链接，打开后直接定位到该厕所 */
export function buildShareUrl(
  toilet: Toilet,
  origin?: { lat: number; lon: number } | null,
): string {
  const params = new URLSearchParams({
    toilet: toilet.id,
    lat: toilet.lat.toFixed(6),
    lng: toilet.lon.toFixed(6),
  })
  if (origin) {
    params.set('fromLat', origin.lat.toFixed(6))
    params.set('fromLng', origin.lon.toFixed(6))
  }
  const { origin: originUrl, pathname } = window.location
  return `${originUrl}${pathname}?${params.toString()}`
}

/** 判断是否 iOS，用于把 Apple Maps 排在前面 */
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/** 设备是否支持原生分享 */
export function canShare(): boolean {
  return typeof navigator.share === 'function'
}
