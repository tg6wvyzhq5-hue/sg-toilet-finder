/**
 * kind 的含义：
 *   mapped —— OSM 明确标注的厕所点（amenity=toilets）
 *   inside —— 某个场所被标注了 toilets=yes（厕所就在这个场所里）
 *   place  —— 推断层：商场/地铁站/小贩中心等「通常有厕所」的场所，
 *             OSM 没有标注具体厕所位置，仅作为备选建议
 */
export type ToiletKind = 'mapped' | 'inside' | 'place'

/** 一条厕所记录（由 OSM / Google Places 归一化而来） */
export interface Toilet {
  id: string
  lat: number
  lon: number
  kind?: ToiletKind
  /** 厕所自身的名字，绝大多数 OSM 点没有名字 */
  name: string | null
  /** 最近的地标名（商场/地铁站等），用于给无名厕所补上下文 */
  landmark: string | null
  landmarkKind?: string | null
  landmarkDistance?: number
  /** 场所类型文字，例如「商场」「地铁站/轻轨站」 */
  categoryLabel?: string | null
  operator?: string | null
  level?: string | null
  indoor?: boolean
  wheelchair?: 'yes' | 'limited' | 'no'
  fee?: 'yes' | 'no'
  changingTable?: boolean
  unisex?: boolean
  male?: boolean
  female?: boolean
  handwashing?: boolean
  drinkingWater?: boolean
  access?: string
  openingHours?: string
  twentyFourSeven?: boolean
  address?: string
  description?: string | null
  /** 数据来源标记 */
  source?: 'osm' | 'google'
}

/** public/data/toilets.json 的结构 */
export interface Dataset {
  source: string
  sourceUrl: string
  generatedAt: string
  count: number
  mappedCount?: number
  insideCount?: number
  nearMrt?: number
  toilets: Toilet[]
}

/** 「通常有厕所」的场所 */
export interface Place {
  id: string
  kind?: 'place'
  lat: number
  lon: number
  name: string
  category: string
  categoryLabel: string
  operator?: string | null
  address?: string
}

/** public/data/places.json 的结构 */
export interface PlaceDataset {
  source: string
  sourceUrl: string
  generatedAt: string
  count: number
  categories: { key: string; label: string }[]
  places: Place[]
}

/** 计算距离后的厕所 */
export interface ToiletWithDistance extends Toilet {
  distance: number
  walkMinutes: number
}

/** 用户当前位置（或手动选点） */
export interface Origin {
  lat: number
  lon: number
  accuracy?: number
  source: 'gps' | 'manual' | 'default' | 'place'
}

export type FilterKey = 'wheelchair' | 'free' | 'changingTable' | 'open24'

export interface PlaceResult {
  id: string
  name: string
  detail: string
  lat: number
  lon: number
}
