#!/usr/bin/env node
/**
 * 抓取新加坡 OSM 数据并归一化成前端用的紧凑 JSON。
 *
 *   node scripts/fetch-osm-toilets.mjs
 *
 * 产出两级数据：
 *   1. public/data/toilets.json —— OSM 明确标注的厕所
 *      · amenity=toilets（独立/室内厕所点）
 *      · toilets=yes 的场所（商场、车站等，厕所就在该场所内）
 *   2. public/data/places.json —— 「通常有厕所」的场所（商场、地铁站、
 *      小贩中心、图书馆、民众俱乐部、医院、博物馆），
 *      这些地方 OSM 没标具体厕所位置，但对找厕所非常有用。
 *
 * 数据来源：OpenStreetMap（ODbL 许可）经由 Overpass API。
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_TOILETS = resolve(HERE, '../public/data/toilets.json')
const OUT_PLACES = resolve(HERE, '../public/data/places.json')

// 只用主镜像：kumi 镜像经常超时，重试反而更慢
const ENDPOINTS = ['https://overpass-api.de/api/interpreter']
const UA = 'sg-toilet-finder/1.0 (OSM data fetch script)'

const AREA = 'area["ISO3166-1"="SG"][admin_level=2]->.sg;'

/**
 * 拆成多条查询分别请求：Overpass 对「大范围 + 多条件 union」容易 504，
 * 分开发更稳，也方便失败时只重试其中一条。
 */
const TOILET_QUERIES = [
  {
    label: 'amenity=toilets',
    query: `[out:json][timeout:180];\n${AREA}\nnwr["amenity"="toilets"](area.sg);\nout center tags;`,
  },
  {
    label: 'toilets=yes 的场所',
    query: `[out:json][timeout:180];\n${AREA}\nnwr["toilets"="yes"]["amenity"!="toilets"](area.sg);\nout center tags;`,
  },
]

/** 场所分类：key 用于筛选与图标，label 给界面显示 */
const PLACE_QUERIES = [
  { key: 'mall', label: '商场', tags: [['shop', 'mall'], ['shop', 'department_store']] },
  {
    key: 'mrt',
    label: '地铁站/轻轨站',
    tags: [['railway', 'station'], ['railway', 'halt']],
  },
  {
    key: 'hawker',
    label: '小贩中心/市场',
    tags: [['amenity', 'food_court'], ['amenity', 'marketplace']],
  },
  { key: 'library', label: '图书馆', tags: [['amenity', 'library']] },
  { key: 'community', label: '民众俱乐部', tags: [['amenity', 'community_centre']] },
  { key: 'hospital', label: '医院', tags: [['amenity', 'hospital']] },
  { key: 'museum', label: '博物馆/展馆', tags: [['tourism', 'museum']] },
]

const PLACE_QUERY = `[out:json][timeout:180];
${AREA}
(
${PLACE_QUERIES.flatMap((group) =>
  group.tags.map(([key, value]) => `  nwr["${key}"="${value}"](area.sg);`),
).join('\n')}
);
out center tags;`

/**
 * 兜底地标：上面那些场所没覆盖到的地方（公园、酒店、超市、大学、组屋区等），
 * 用于给仍然没有名字的厕所补一个「靠近 XXX」。
 */
const LANDMARK_QUERY = `[out:json][timeout:180];
${AREA}
(
  nwr["leisure"~"park|garden|nature_reserve|sports_centre|swimming_pool"](area.sg);
  nwr["tourism"~"hotel|attraction|theme_park|zoo|viewpoint"](area.sg);
  nwr["shop"~"supermarket|convenience"](area.sg);
  nwr["amenity"~"university|college|bus_station|ferry_terminal|police|fire_station|place_of_worship"](area.sg);
  nwr["place"~"suburb|neighbourhood|quarter"](area.sg);
  nwr["building"~"commercial|retail|office"](area.sg);
);
out center tags;`

const CACHE_DIR = resolve(HERE, '.cache')
const USE_CACHE = !process.argv.includes('--refresh')

/**
 * 带磁盘缓存的 Overpass 请求。
 *
 * Overpass 会限流（429）和超时（504），全岛查询一次要几十秒，
 * 所以把原始响应缓存到 scripts/.cache/ 下：重跑脚本时已成功的部分直接读缓存，
 * 只重试缺的那部分。加 --refresh 参数可以强制重新抓取。
 */
async function overpass(query, label, attempts = 4) {
  const cacheFile = resolve(
    CACHE_DIR,
    `${label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`,
  )

  if (USE_CACHE) {
    try {
      const cached = JSON.parse(await readFile(cacheFile, 'utf8'))
      console.log(`  \u21bb ${label} \u2190 \u672c\u5730\u7f13\u5b58\uff08${cached.elements.length} \u4e2a\u5143\u7d20\uff09`)
      return cached.elements ?? []
    } catch {
      /* 没有缓存，正常请求 */
    }
  }

  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': UA,
          },
          body: new URLSearchParams({ data: query }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        await mkdir(CACHE_DIR, { recursive: true })
        await writeFile(cacheFile, JSON.stringify(json))
        console.log(
          `  \u2713 ${label} \u2190 ${url}\uff08${json.elements.length} \u4e2a\u5143\u7d20\uff09`,
        )
        // 请求之间稍微停一下，避免触发限流
        await new Promise((done) => setTimeout(done, 2000))
        return json.elements ?? []
      } catch (error) {
        console.warn(`  \u2717 ${label} ${url}: ${error.message}`)
        lastError = error
      }
    }
    if (attempt < attempts) {
      const wait = attempt * 15000
      console.log(`  \u2026 ${wait / 1000}s \u540e\u91cd\u8bd5 ${label}\uff08\u7b2c ${attempt + 1}/${attempts} \u6b21\uff09`)
      await new Promise((done) => setTimeout(done, wait))
    }
  }
  throw lastError
}

function coords(element) {
  if (element.type === 'node') return { lat: element.lat, lon: element.lon }
  if (element.center) return { lat: element.center.lat, lon: element.center.lon }
  return null
}

const METRES_PER_DEG_LAT = 111_320
function distanceMetres(a, b) {
  const dLat = (a.lat - b.lat) * METRES_PER_DEG_LAT
  const dLon =
    (a.lon - b.lon) * METRES_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

function pick(tags, keys) {
  for (const key of keys) {
    const value = tags[key]
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

function placeCategory(tags) {
  for (const group of PLACE_QUERIES) {
    for (const [key, value] of group.tags) {
      if (tags[key] === value) return group
    }
  }
  return null
}

function normalizeToilet(element) {
  const tags = element.tags ?? {}
  const access = (tags.access ?? '').toLowerCase()
  if (['private', 'no'].includes(access)) return null
  if (tags.disused || tags.abandoned) return null

  const point = coords(element)
  if (!point) return null

  const insidePoi = tags.amenity !== 'toilets'
  const openingHours = tags.opening_hours
  const is24h = /^24\s*\/\s*7$/.test(openingHours ?? '')
  const wheelchair = (tags.wheelchair ?? '').toLowerCase()
  const fee = (tags.fee ?? '').toLowerCase()
  const category = insidePoi ? placeCategory(tags) : null

  return {
    id: `${element.type}/${element.id}`,
    kind: insidePoi ? 'inside' : 'mapped',
    lat: Number(point.lat.toFixed(7)),
    lon: Number(point.lon.toFixed(7)),
    name: pick(tags, ['name:en', 'name']) ?? null,
    landmark: null,
    categoryLabel: category?.label ?? null,
    operator: pick(tags, ['operator:en', 'operator']) ?? null,
    level: pick(tags, ['level', 'addr:floor']) ?? null,
    indoor:
      tags.indoor !== undefined || tags.location === 'indoor' ? true : undefined,
    wheelchair:
      wheelchair === 'yes' || wheelchair === 'limited' || wheelchair === 'no'
        ? wheelchair
        : undefined,
    fee: fee === 'no' || fee === 'yes' ? fee : undefined,
    changingTable:
      tags['changing_table'] === 'yes' || tags.diaper === 'yes' ? true : undefined,
    unisex: tags.unisex === 'yes' ? true : undefined,
    male: tags.male === 'yes' ? true : undefined,
    female: tags.female === 'yes' ? true : undefined,
    handwashing: tags.handwashing === 'yes' ? true : undefined,
    drinkingWater: tags.drinking_water === 'yes' ? true : undefined,
    access:
      access === 'customers' || access === 'permissive' ? access : undefined,
    openingHours: openingHours ?? (is24h ? '24/7' : undefined),
    twentyFourSeven: is24h || undefined,
    address:
      [
        tags['addr:housenumber'],
        tags['addr:street'] ?? tags['addr:place'],
        tags['addr:unit'] ?? tags['addr:floor'],
      ]
        .filter(Boolean)
        .join(' ') || undefined,
    description: pick(tags, ['description:en', 'description', 'note']) ?? null,
  }
}

function normalizePlace(element, category) {
  const tags = element.tags ?? {}
  const point = coords(element)
  if (!point) return null
  const name = pick(tags, ['name:en', 'name'])
  if (!name) return null
  return {
    id: `${element.type}/${element.id}`,
    kind: 'place',
    lat: Number(point.lat.toFixed(7)),
    lon: Number(point.lon.toFixed(7)),
    name,
    category: category.key,
    categoryLabel: category.label,
    operator: pick(tags, ['operator:en', 'operator']) ?? null,
    address:
      [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') ||
      undefined,
  }
}

function normalizeLandmark(element) {
  const tags = element.tags ?? {}
  const point = coords(element)
  if (!point) return null
  const name = pick(tags, ['name:en', 'name'])
  if (!name) return null
  return {
    name,
    lat: point.lat,
    lon: point.lon,
    kind: pick(tags, [
      'leisure',
      'tourism',
      'shop',
      'amenity',
      'place',
      'building',
    ]),
  }
}

async function main() {
  console.log('→ 抓取 OSM 厕所点位…')
  const toiletElements = []
  const seenElements = new Set()
  for (const elements of await Promise.all(
    TOILET_QUERIES.map((item) => overpass(item.query, item.label)),
  )) {
    for (const element of elements) {
      const key = `${element.type}/${element.id}`
      if (seenElements.has(key)) continue
      seenElements.add(key)
      toiletElements.push(element)
    }
  }
  console.log('→ 抓取「通常有厕所」的场所…')
  const placeElements = await overpass(PLACE_QUERY, 'places')
  const landmarkElements = await overpass(LANDMARK_QUERY, 'landmarks')

  const toilets = toiletElements.map(normalizeToilet).filter(Boolean)

  const placesById = new Map()
  for (const element of placeElements) {
    const category = placeCategory(element.tags ?? {})
    if (!category) continue
    const place = normalizePlace(element, category)
    if (place) placesById.set(place.id, place)
  }
  const places = [...placesById.values()]

  // 给没有名字的厕所补上下文：先找最近的场所（商场/车站更具体），
  // 找不到再用兜底地标（公园、酒店、组屋区等）
  const landmarks = landmarkElements.map(normalizeLandmark).filter(Boolean)
  let enriched = 0
  let enrichedByLandmark = 0

  const nearestWithin = (toilet, candidates) => {
    let best = null
    let bestDistance = Infinity
    for (const candidate of candidates) {
      const d = distanceMetres(toilet, candidate)
      if (d < bestDistance) {
        bestDistance = d
        best = candidate
      }
    }
    return bestDistance <= 120 ? { best, bestDistance } : null
  }

  for (const toilet of toilets) {
    if (toilet.name) continue
    const fromPlace = nearestWithin(toilet, places)
    if (fromPlace) {
      toilet.landmark = fromPlace.best.name
      toilet.landmarkKind = fromPlace.best.category
      toilet.landmarkDistance = Math.round(fromPlace.bestDistance)
      enriched += 1
      continue
    }
    const fromLandmark = nearestWithin(toilet, landmarks)
    if (fromLandmark) {
      toilet.landmark = fromLandmark.best.name
      toilet.landmarkKind = fromLandmark.best.kind ?? 'landmark'
      toilet.landmarkDistance = Math.round(fromLandmark.bestDistance)
      enrichedByLandmark += 1
    }
  }
  enriched += enrichedByLandmark

  // 去重：坐标几乎相同且同名的点只保留一个
  const seen = new Set()
  const deduped = []
  for (const toilet of toilets) {
    const key = `${toilet.lat.toFixed(5)}|${toilet.lon.toFixed(5)}|${toilet.name ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(toilet)
  }

  // 25 米内已经有明确厕所点的场所，就不必再作为「备选」出现了
  const filteredPlaces = places.filter((place) =>
    deduped.every((toilet) => distanceMetres(place, toilet) > 25),
  )

  const toiletsPayload = {
    source: 'OpenStreetMap contributors (ODbL)',
    sourceUrl: 'https://www.openstreetmap.org',
    generatedAt: new Date().toISOString(),
    count: deduped.length,
    mappedCount: deduped.filter((t) => t.kind === 'mapped').length,
    insideCount: deduped.filter((t) => t.kind === 'inside').length,
    landmarkMatched: enriched,
    landmarkFromPlaces: enriched - enrichedByLandmark,
    landmarkFromOthers: enrichedByLandmark,
    toilets: deduped,
  }

  const placesPayload = {
    source: 'OpenStreetMap contributors (ODbL)',
    sourceUrl: 'https://www.openstreetmap.org',
    generatedAt: toiletsPayload.generatedAt,
    count: filteredPlaces.length,
    categories: PLACE_QUERIES.map((group) => ({ key: group.key, label: group.label })),
    places: filteredPlaces,
  }

  await mkdir(dirname(OUT_TOILETS), { recursive: true })
  await writeFile(OUT_TOILETS, JSON.stringify(toiletsPayload))
  await writeFile(OUT_PLACES, JSON.stringify(placesPayload))

  for (const file of [OUT_TOILETS, OUT_PLACES]) {
    const { size } = await stat(file)
    console.log(`✓ ${file} (${(size / 1024).toFixed(1)} KB)`)
  }
  console.log(
    `  厕所 ${toiletsPayload.count} 个（明确标注 ${toiletsPayload.mappedCount} + 场所内厕所 ${toiletsPayload.insideCount}），` +
      `其中 ${enriched} 个补上了最近场所；备选场所 ${placesPayload.count} 个`,
  )
}

main().catch((error) => {
  console.error('抓取失败：', error)
  process.exit(1)
})
