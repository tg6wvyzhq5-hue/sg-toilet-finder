/** 地理计算与格式化工具 */

const EARTH_RADIUS_M = 6_371_008.8
/** 步行速度约 1.25 m/s ≈ 4.5 km/h，含等红灯的保守估计 */
const WALK_SPEED_MPS = 1.15

export function distanceMetres(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δφ = φ2 - φ1
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180
  const h =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 直线距离折算的步行时间（分钟，最少 1 分钟） */
export function walkMinutes(metres: number): number {
  return Math.max(1, Math.round(metres / WALK_SPEED_MPS / 60))
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`
  if (metres < 10_000) return `${(metres / 1000).toFixed(1)} km`
  return `${Math.round(metres / 1000)} km`
}

export function formatWalkTime(minutes: number): string {
  if (minutes < 60) return `步行约 ${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `步行约 ${h} 小时${m ? ` ${m} 分` : ''}`
}

/** 粗略判断是否在新加坡范围内，用于提示用户定位跑偏 */
export function isInSingapore(lat: number, lon: number): boolean {
  return lat > 1.13 && lat < 1.5 && lon > 103.55 && lon < 104.15
}

export function formatCoordinate(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}
