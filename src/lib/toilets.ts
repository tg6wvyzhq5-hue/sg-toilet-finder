import type { FilterKey, Place, Toilet, ToiletWithDistance } from '../types'
import { distanceMetres, walkMinutes } from './geo'

/** 按距离排序并附上距离/步行时间 */
export function withDistance(
  toilets: Toilet[],
  origin: { lat: number; lon: number },
): ToiletWithDistance[] {
  return toilets
    .map((toilet) => {
      const distance = distanceMetres(origin, toilet)
      return { ...toilet, distance, walkMinutes: walkMinutes(distance) }
    })
    .sort((a, b) => a.distance - b.distance)
}

/** 把「通常有厕所的场所」转成列表里能统一渲染的对象 */
export function placeToToilet(place: Place): Toilet {
  return {
    id: place.id,
    lat: place.lat,
    lon: place.lon,
    kind: 'place',
    name: place.name,
    landmark: null,
    categoryLabel: place.categoryLabel,
    operator: place.operator ?? null,
    address: place.address,
    source: 'osm',
  }
}

/** 只有这两种是真的「有厕所」的数据，place 属于推断层 */
export function isRealToilet(toilet: Toilet): boolean {
  return (toilet.kind ?? 'mapped') !== 'place'
}

/** 把 OSM 里 0;1;2 这种多值写法整理得好看一点 */
export function formatLevel(level: string): string {
  return level.replace(/\s*;\s*/g, '/').trim()
}

/** 地址字段同样可能是分号分隔的多值 */
export function formatAddress(address: string): string {
  return address.replace(/\s*;\s*/g, ' / ').trim()
}

/** 厕所的展示标题：优先真实名字，其次「靠近某地标」 */
export function toiletTitle(toilet: Toilet): string {
  if (toilet.name) return toilet.name
  if (toilet.landmark) return `靠近 ${toilet.landmark}`
  if (toilet.operator) return `${toilet.operator} 公共厕所`
  if (toilet.address) return `公共厕所 · ${toilet.address}`
  return '公共厕所'
}

/** 副标题：补充所在楼层/运营方/场所类型等有用信息 */
export function toiletSubtitle(toilet: Toilet): string {
  if (toilet.kind === 'place') {
    return `${toilet.categoryLabel ?? '场所'} · 通常设有厕所，OSM 未标注具体位置`
  }

  const parts: string[] = []
  if (toilet.kind === 'inside') {
    parts.push(toilet.categoryLabel ? `${toilet.categoryLabel}内厕所` : '场所内厕所')
  }
  if (toilet.name && toilet.landmark) parts.push(`位于 ${toilet.landmark}`)
  if (toilet.operator && toilet.operator !== toilet.name) {
    parts.push(toilet.operator)
  }
  if (toilet.level) {
    const level = formatLevel(toilet.level)
    parts.push(/^\d/.test(level) ? `${level} 楼` : level)
  }
  if (toilet.indoor && toilet.kind !== 'inside') parts.push('室内')
  if (toilet.access === 'customers') parts.push('顾客专用')
  return parts.join(' · ')
}

export interface Badge {
  key: string
  label: string
}

export function toiletBadges(toilet: Toilet): Badge[] {
  if (toilet.kind === 'place') {
    return [{ key: 'candidate', label: '🏬 通常有厕所' }]
  }

  const badges: Badge[] = []
  if (toilet.kind === 'inside') badges.push({ key: 'inside', label: '场所内厕所' })
  if (toilet.wheelchair === 'yes') badges.push({ key: 'wheelchair', label: '♿ 无障碍' })
  else if (toilet.wheelchair === 'limited') {
    badges.push({ key: 'wheelchair-limited', label: '♿ 无障碍(有限)' })
  }
  if (toilet.changingTable) badges.push({ key: 'changing', label: '👶 婴儿台' })
  if (toilet.fee === 'no') badges.push({ key: 'free', label: '免费' })
  if (toilet.fee === 'yes') badges.push({ key: 'paid', label: '收费' })
  if (toilet.twentyFourSeven) badges.push({ key: '24h', label: '24 小时' })
  else if (toilet.openingHours) {
    badges.push({ key: 'hours', label: toilet.openingHours })
  }
  if (toilet.handwashing) badges.push({ key: 'wash', label: '有洗手池' })
  if (toilet.drinkingWater) badges.push({ key: 'water', label: '饮水机' })
  return badges
}

/** 没有营业时间信息的厕所，默认按「白天开放」处理 */
export function isProbablyOpenNow(toilet: Toilet, now = new Date()): boolean | null {
  if (toilet.twentyFourSeven) return true
  const hours = toilet.openingHours
  if (!hours) return null
  if (/24\s*\/\s*7/.test(hours)) return true

  const match = hours.match(/^([A-Za-z,\- ]*?)\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
  if (!match) return null

  const [, , fromH, fromM, toH, toM] = match
  const minutes = now.getHours() * 60 + now.getMinutes()
  const from = Number(fromH) * 60 + Number(fromM)
  const to = Number(toH) * 60 + Number(toM)
  if (to >= from) return minutes >= from && minutes <= to
  // 跨午夜，例如 18:00-02:00
  return minutes >= from || minutes <= to
}

export function applyFilters(
  toilets: ToiletWithDistance[],
  filters: Set<FilterKey>,
): ToiletWithDistance[] {
  if (filters.size === 0) return toilets
  return toilets.filter((toilet) => {
    // 推断层没有这些属性，一旦开启筛选就不再显示，避免误导
    if (toilet.kind === 'place') return false
    for (const filter of filters) {
      if (filter === 'wheelchair' && toilet.wheelchair !== 'yes') return false
      if (filter === 'free' && toilet.fee === 'yes') return false
      if (filter === 'changingTable' && !toilet.changingTable) return false
      if (filter === 'open24' && !toilet.twentyFourSeven) return false
    }
    return true
  })
}

/** 每个筛选条件能命中多少个，用于给筛选按钮显示数量 */
export function filterCounts(
  toilets: ToiletWithDistance[],
): Record<FilterKey, number> {
  const real = toilets.filter(isRealToilet)
  return {
    wheelchair: real.filter((toilet) => toilet.wheelchair === 'yes').length,
    changingTable: real.filter((toilet) => toilet.changingTable).length,
    free: real.filter((toilet) => toilet.fee !== 'yes').length,
    open24: real.filter((toilet) => toilet.twentyFourSeven).length,
  }
}

/** 本地模糊搜索：名字、地标、运营方、地址、场所类型 */
export function searchToilets(
  toilets: ToiletWithDistance[],
  query: string,
): ToiletWithDistance[] {
  const q = query.trim().toLowerCase()
  if (!q) return toilets
  const terms = q.split(/\s+/)
  return toilets.filter((toilet) => {
    const haystack = [
      toilet.name,
      toilet.landmark,
      toilet.operator,
      toilet.address,
      toilet.description,
      toilet.categoryLabel,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}
