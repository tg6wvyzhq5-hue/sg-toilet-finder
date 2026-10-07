import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapView, type FocusTarget } from './components/MapView'
import { SearchBar } from './components/SearchBar'
import { FilterChips } from './components/FilterChips'
import { BottomSheet } from './components/BottomSheet'
import { NearestCard } from './components/NearestCard'
import { ToiletListItem } from './components/ToiletListItem'
import { ToiletDetail } from './components/ToiletDetail'
import { InfoPanel } from './components/InfoPanel'
import { useGeolocation } from './hooks/useGeolocation'
import { useDebouncedValue } from './hooks/useDebouncedValue'
import { SINGAPORE_CENTER } from './lib/mapTiles'
import { distanceMetres, formatCoordinate, isInSingapore } from './lib/geo'
import {
  applyFilters,
  filterCounts,
  isRealToilet,
  placeToToilet,
  searchToilets,
  toiletTitle,
  withDistance,
} from './lib/toilets'
import { searchPlaces } from './lib/geocode'
import { fetchLiveToilets } from './lib/overpass'
import { googleEnabled, searchNearbyToilets } from './lib/googlePlaces'
import { buildShareUrl } from './lib/navigate'
import type {
  Dataset,
  FilterKey,
  Origin,
  Place,
  PlaceDataset,
  PlaceResult,
  Toilet,
} from './types'

const PAGE_SIZE = 40

const URL_PARAMS = new URLSearchParams(window.location.search)
const URL_FROM_LAT = Number(URL_PARAMS.get('fromLat'))
const URL_FROM_LNG = Number(URL_PARAMS.get('fromLng'))
const URL_ORIGIN: { lat: number; lon: number } | null =
  Number.isFinite(URL_FROM_LAT) &&
  Number.isFinite(URL_FROM_LNG) &&
  isInSingapore(URL_FROM_LAT, URL_FROM_LNG)
    ? { lat: URL_FROM_LAT, lon: URL_FROM_LNG }
    : null
const URL_TOILET_ID = URL_PARAMS.get('toilet')

/** 定位不可用时的兜底起点：市中心 */
const FALLBACK_ORIGIN: Origin = {
  lat: SINGAPORE_CENTER.lat,
  lon: SINGAPORE_CENTER.lon,
  source: 'default',
}

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [liveToilets, setLiveToilets] = useState<Toilet[] | null>(null)
  const [googleToilets, setGoogleToilets] = useState<Toilet[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [showPlaces, setShowPlaces] = useState(true)

  const [filters, setFilters] = useState<Set<FilterKey>>(() => new Set())
  const [query, setQuery] = useState(URL_PARAMS.get('q') ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetRatio, setSheetRatio] = useState(0.46)
  const [focus, setFocus] = useState<FocusTarget | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [toast, setToast] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [googleStatus, setGoogleStatus] = useState<string | null>(null)

  const geo = useGeolocation({ auto: URL_ORIGIN === null })
  const { origin, status: geoStatus, error: geoError, outsideSingapore, request, setManualOrigin } = geo

  const toiletsRef = useRef<Toilet[]>([])
  const deepLinkHandled = useRef(false)
  const lastOriginKey = useRef('')
  const googleFetchedFor = useRef('')

  /* ---------- 内置数据 ---------- */
  useEffect(() => {
    let alive = true
    fetch(`${import.meta.env.BASE_URL}data/toilets.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Dataset>
      })
      .then((data) => {
        if (alive) setDataset(data)
      })
      .catch((err: Error) => {
        if (alive) setLoadError(err.message)
      })
    return () => {
      alive = false
    }
  }, [])

  /* ---------- 「通常有厕所」的场所（推断层，体积较大，单独加载） ---------- */
  useEffect(() => {
    let alive = true
    fetch(`${import.meta.env.BASE_URL}data/places.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<PlaceDataset>
      })
      .then((data) => {
        if (alive) setPlaces(data.places)
      })
      .catch(() => {
        // 推断层加载失败不影响核心功能，静默降级
        if (alive) setPlaces([])
      })
    return () => {
      alive = false
    }
  }, [])

  /* ---------- 起点：URL 参数 / GPS ---------- */
  useEffect(() => {
    if (URL_ORIGIN) setManualOrigin(URL_ORIGIN.lat, URL_ORIGIN.lon, 'place')
  }, [setManualOrigin])

  const osmToilets = liveToilets ?? dataset?.toilets ?? []
  const placeToilets = useMemo(
    () => (showPlaces ? places.map(placeToToilet) : []),
    [places, showPlaces],
  )
  const allToilets = useMemo(
    () => [...osmToilets, ...googleToilets, ...placeToilets],
    [osmToilets, googleToilets, placeToilets],
  )
  toiletsRef.current = allToilets

  const effectiveOrigin: Origin = origin ?? FALLBACK_ORIGIN
  const hasRealOrigin = origin !== null

  /* ---------- 距离计算 + 搜索 + 筛选 ---------- */
  const byDistance = useMemo(
    () => withDistance(allToilets, effectiveOrigin),
    [allToilets, effectiveOrigin],
  )
  const searched = useMemo(() => searchToilets(byDistance, query), [byDistance, query])
  const filtered = useMemo(() => applyFilters(searched, filters), [searched, filters])
  const counts = useMemo(() => filterCounts(searched), [searched])
  // 「离你最近」只推荐真实厕所点位，推断出来的场所退到列表里
  const nearest = useMemo(
    () => filtered.find(isRealToilet) ?? filtered[0] ?? null,
    [filtered],
  )
  const placesMuted = filters.size > 0
  const mappedCount = osmToilets.filter((toilet) => (toilet.kind ?? 'mapped') === 'mapped').length
  const insideCount = osmToilets.filter((toilet) => toilet.kind === 'inside').length
  const selected = useMemo(
    () => (selectedId ? byDistance.find((item) => item.id === selectedId) ?? null : null),
    [byDistance, selectedId],
  )

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, filters, hasRealOrigin])

  /* ---------- 定位成功后自动把地图移到当前位置 ---------- */
  useEffect(() => {
    if (!origin) return
    const key = `${origin.lat.toFixed(5)},${origin.lon.toFixed(5)},${origin.source}`
    if (lastOriginKey.current === key) return
    lastOriginKey.current = key
    setFocus({ lat: origin.lat, lon: origin.lon, zoom: 16, key: Date.now() })
  }, [origin])

  /* ---------- 分享链接里带的厕所，直接打开详情 ---------- */
  useEffect(() => {
    if (deepLinkHandled.current || !dataset || !URL_TOILET_ID) return
    deepLinkHandled.current = true
    const target = allToilets.find((toilet) => toilet.id === URL_TOILET_ID)
    if (!target) return
    setSelectedId(target.id)
    setSheetRatio(0.6)
    setFocus({ lat: target.lat, lon: target.lon, zoom: 17, key: Date.now() })
  }, [dataset, allToilets])

  /* ---------- 可选的 Google Places 补充 ---------- */
  useEffect(() => {
    if (!googleEnabled || !origin) return
    const key = `${origin.lat.toFixed(3)},${origin.lon.toFixed(3)}`
    if (googleFetchedFor.current === key) return
    googleFetchedFor.current = key
    let alive = true
    setGoogleStatus('正在从 Google Places 获取附近厕所…')
    searchNearbyToilets(origin)
      .then((results) => {
        if (!alive) return
        const fresh = results.filter((candidate) =>
          toiletsRef.current.every((toilet) => {
            if (toilet.source === 'google') return true
            return (
              distanceMetres(
                { lat: candidate.lat, lon: candidate.lon },
                { lat: toilet.lat, lon: toilet.lon },
              ) > 60
            )
          }),
        )
        if (fresh.length > 0) setGoogleToilets((prev) => [...prev, ...fresh])
        setGoogleStatus(
          fresh.length > 0
            ? `Google Places 补充了 ${fresh.length} 个点位`
            : 'Google Places 没有发现新增点位',
        )
      })
      .catch((err: Error) => {
        if (alive) setGoogleStatus(`Google Places 调用失败：${err.message}`)
      })
    return () => {
      alive = false
    }
  }, [origin])

  /* ---------- 联网搜索地点（Nominatim） ---------- */
  const debouncedQuery = useDebouncedValue(query, 500)
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([])
  const [placeLoading, setPlaceLoading] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)

  useEffect(() => {
    const text = debouncedQuery.trim()
    if (text.length < 3) {
      setPlaceResults([])
      setPlaceLoading(false)
      setPlaceError(null)
      return
    }
    let alive = true
    setPlaceLoading(true)
    setPlaceError(null)
    searchPlaces(text)
      .then((results) => {
        if (!alive) return
        setPlaceResults(results)
        setPlaceLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setPlaceResults([])
        setPlaceLoading(false)
        setPlaceError('地点搜索暂时不可用（可能是网络问题）')
      })
    return () => {
      alive = false
    }
  }, [debouncedQuery])

  /* ---------- 提示条自动消失 ---------- */
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  /* ---------- 交互 ---------- */
  const focusOn = useCallback((lat: number, lon: number, zoom: number) => {
    setFocus({ lat, lon, zoom, key: Date.now() })
  }, [])

  const handleSelectToilet = useCallback(
    (id: string) => {
      setSelectedId(id)
      setSheetRatio((ratio) => (ratio < 0.5 ? 0.5 : ratio))
      const toilet = toiletsRef.current.find((item) => item.id === id)
      if (toilet) focusOn(toilet.lat, toilet.lon, 17)
    },
    [focusOn],
  )

  const handleBack = useCallback(() => {
    setSelectedId(null)
    setSheetRatio(0.46)
  }, [])

  const handlePickPoint = useCallback(
    (lat: number, lon: number) => {
      setManualOrigin(lat, lon, 'manual')
      setSelectedId(null)
      setToast(`起点已设为 ${formatCoordinate(lat, lon)}`)
    },
    [setManualOrigin],
  )

  const handleSelectPlace = useCallback(
    (place: PlaceResult) => {
      setManualOrigin(place.lat, place.lon, 'place')
      setQuery('')
      setSelectedId(null)
      focusOn(place.lat, place.lon, 16)
      setToast(`起点已设为 ${place.name}`)
    },
    [focusOn, setManualOrigin],
  )

  const handleToggleFilter = useCallback((key: FilterKey) => {
    setFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleRefreshLive = useCallback(async () => {
    setLiveLoading(true)
    setLiveError(null)
    try {
      const list = await fetchLiveToilets()
      setLiveToilets(list)
      setToast(`已从 OpenStreetMap 更新 ${list.length} 个点位`)
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误'
      setLiveError(`在线更新失败：${message}`)
      setToast('在线更新失败，继续使用内置数据')
    } finally {
      setLiveLoading(false)
    }
  }, [])

  const handleShare = useCallback(async () => {
    if (!selected) return
    const url = buildShareUrl(selected, origin)
    const title = toiletTitle(selected)
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `${title} · 新加坡找厕所`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setToast('链接已复制，可以发给朋友')
    } catch {
      setToast('分享已取消')
    }
  }, [origin, selected])

  const handleLocate = useCallback(() => {
    request()
  }, [request])

  const handleShowOnMap = useCallback(() => {
    if (!selected) return
    focusOn(selected.lat, selected.lon, 18)
    setSheetRatio(0.2)
  }, [focusOn, selected])

  const locateHint =
    geoStatus === 'denied' || geoStatus === 'error' || geoStatus === 'unsupported'
      ? geoError
      : outsideSingapore
        ? '检测到你不在新加坡，距离可能没有意义，可以点地图手动选点。'
        : null

  if (loadError) {
    return (
      <div className="splash">
        <h1>数据加载失败</h1>
        <p>{loadError}</p>
        <p className="splash__hint">
          请先运行 <code>npm run fetch:data</code> 生成 public/data/toilets.json，或检查网络后刷新。
        </p>
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="splash">
        <div className="splash__spinner" />
        <h1>找厕所 · 新加坡</h1>
        <p>正在加载公厕数据…</p>
      </div>
    )
  }

  const shown = filtered.slice(0, visibleCount)

  return (
    <div className="app">
      <MapView
        toilets={filtered}
        origin={origin}
        selectedId={selectedId}
        nearestId={nearest?.id ?? null}
        focus={focus}
        locating={geoStatus === 'locating'}
        onSelect={handleSelectToilet}
        onPickPoint={handlePickPoint}
        onLocate={handleLocate}
      />

      <div className="top-bar">
        <SearchBar
          value={query}
          onChange={setQuery}
          toiletResults={searched}
          placeResults={placeResults}
          placeLoading={placeLoading}
          placeError={placeError}
          onSelectToilet={handleSelectToilet}
          onSelectPlace={handleSelectPlace}
        />
        <FilterChips
          active={filters}
          counts={counts}
          onToggle={handleToggleFilter}
          placesEnabled={showPlaces}
          placesCount={places.length}
          placesMuted={placesMuted}
          onTogglePlaces={() => setShowPlaces((prev) => !prev)}
        />
      </div>

      <BottomSheet ratio={sheetRatio} onRatioChange={setSheetRatio}>
        {selected ? (
          <ToiletDetail
            toilet={selected}
            origin={origin}
            onBack={handleBack}
            onShowOnMap={handleShowOnMap}
            onShare={handleShare}
          />
        ) : (
          <div className="list-view">
            {locateHint && (
              <div className="hint-bar">
                <span>{locateHint}</span>
                <button type="button" onClick={handleLocate}>
                  重新定位
                </button>
              </div>
            )}

            {!hasRealOrigin && (
              <button type="button" className="locate-cta" onClick={handleLocate}>
                <span className="locate-cta__title">开启定位，找到离你最近的厕所</span>
                <span className="locate-cta__sub">
                  定位只在本机计算，不会上传；也可以直接点击地图选点
                </span>
              </button>
            )}

            {nearest ? (
              <NearestCard
                toilet={nearest}
                origin={origin}
                onDetail={() => handleSelectToilet(nearest.id)}
              />
            ) : (
              <div className="empty">
                <p>没有符合当前条件的厕所</p>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => {
                    setFilters(new Set())
                    setQuery('')
                  }}
                >
                  清除筛选条件
                </button>
              </div>
            )}

            {placesMuted && showPlaces && places.length > 0 && (
              <p className="list-note">
                已开启属性筛选，暂不显示「通常有厕所」的推断场所（关掉筛选即可看到）
              </p>
            )}

            <div className="list-head">
              <span>
                {hasRealOrigin ? '附近' : '市中心附近'} · {filtered.length} 个结果
              </span>
              <button type="button" className="list-head__info" onClick={() => setInfoOpen(true)}>
                数据说明
              </button>
            </div>

            <div className="list">
              {shown.map((toilet) => (
                <ToiletListItem
                  key={toilet.id}
                  toilet={toilet}
                  origin={origin}
                  selected={toilet.id === selectedId}
                  onSelect={() => handleSelectToilet(toilet.id)}
                />
              ))}
              {filtered.length > shown.length && (
                <button
                  type="button"
                  className="list-more"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  显示更多（还有 {filtered.length - shown.length} 个）
                </button>
              )}
            </div>

            <p className="list-foot">
              数据来自 OpenStreetMap 志愿者（ODbL）：{mappedCount} 个明确标注的厕所
              {insideCount > 0 ? `、${insideCount} 个场所内厕所` : ''}
              {showPlaces && places.length > 0
                ? `，另有 ${places.length} 个「通常设有厕所」的商场/车站等场所（推断，位置以地图为准）`
                : ''}
              {googleToilets.length > 0
                ? `，Google Places 补充 ${googleToilets.length} 个`
                : ''}
              。标记为「通常有厕所」的点位没有具体厕所位置，建议到现场后留意指示牌。
            </p>
          </div>
        )}
      </BottomSheet>

      {toast && <div className="toast">{toast}</div>}

      {infoOpen && (
        <InfoPanel
          dataset={dataset}
          liveActive={liveToilets !== null}
          totalCount={allToilets.length}
          liveLoading={liveLoading}
          liveError={liveError}
          googleEnabled={googleEnabled}
          googleStatus={googleStatus}
          onRefreshLive={handleRefreshLive}
          onClose={() => setInfoOpen(false)}
        />
      )}
    </div>
  )
}
