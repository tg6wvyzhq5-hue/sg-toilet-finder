import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Origin, ToiletWithDistance } from '../types'
import { SATELLITE_TILES, SINGAPORE_CENTER, STREET_TILE } from '../lib/mapTiles'

export interface FocusTarget {
  lat: number
  lon: number
  zoom?: number
  /** 每次请求聚焦都换一个 key，保证同样的坐标也会触发 */
  key: number
}

interface Props {
  toilets: ToiletWithDistance[]
  origin: Origin | null
  selectedId: string | null
  nearestId: string | null
  focus: FocusTarget | null
  locating?: boolean
  onSelect: (id: string) => void
  onPickPoint: (lat: number, lon: number) => void
  onLocate: () => void
}

type PinVariant = 'normal' | 'nearest' | 'selected' | 'place'

const PIN_ICONS: Record<PinVariant, L.DivIcon> = {
  normal: L.divIcon({
    className: 'pin-wrap',
    html: '<span class="pin pin--normal"></span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  }),
  nearest: L.divIcon({
    className: 'pin-wrap',
    html: '<span class="pin pin--nearest"></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  }),
  selected: L.divIcon({
    className: 'pin-wrap',
    html: '<span class="pin pin--selected"></span>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  }),
  // 推断层：商场/车站等「通常有厕所」的场所，用方块区分
  place: L.divIcon({
    className: 'pin-wrap',
    html: '<span class="pin pin--place"></span>',
    iconSize: [15, 15],
    iconAnchor: [7.5, 7.5],
  }),
}

const ORIGIN_ICON = L.divIcon({
  className: 'origin-wrap',
  html: '<span class="origin-dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

export function MapView({
  toilets,
  origin,
  selectedId,
  nearestId,
  focus,
  locating,
  onSelect,
  onPickPoint,
  onLocate,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const originLayerRef = useRef<L.LayerGroup | null>(null)
  const callbacksRef = useRef({ onSelect, onPickPoint })
  callbacksRef.current = { onSelect, onPickPoint }

  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null)
  const [zoom, setZoom] = useState(13)
  const [basemap, setBasemap] = useState<'street' | 'satellite'>('street')
  const streetLayerRef = useRef<L.TileLayer | null>(null)
  const satelliteLayerRef = useRef<L.LayerGroup | null>(null)

  // 初始化地图（只跑一次）
  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current, {
      center: [SINGAPORE_CENTER.lat, SINGAPORE_CENTER.lon],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0.5,
    })
    streetLayerRef.current = L.tileLayer(
      STREET_TILE.url,
      STREET_TILE.options,
    ).addTo(map)
    satelliteLayerRef.current = L.layerGroup(
      SATELLITE_TILES.map((tile) => L.tileLayer(tile.url, tile.options)),
    )

    const syncViewport = () => {
      setBounds(map.getBounds())
      setZoom(map.getZoom())
    }
    map.on('moveend zoomend', syncViewport)
    map.on('click', (event: L.LeafletMouseEvent) => {
      callbacksRef.current.onPickPoint(event.latlng.lat, event.latlng.lng)
    })
    mapRef.current = map
    syncViewport()

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
      streetLayerRef.current = null
      satelliteLayerRef.current = null
    }
  }, [])

  // 切换街道图 / 卫星图
  useEffect(() => {
    const map = mapRef.current
    const street = streetLayerRef.current
    const satellite = satelliteLayerRef.current
    if (!map || !street || !satellite) return
    if (basemap === 'satellite') {
      map.removeLayer(street)
      satellite.addTo(map)
    } else {
      map.removeLayer(satellite)
      street.addTo(map)
    }
  }, [basemap])

  // 视野内需要渲染的厕所（按距离排序后截断，保证手机端不卡）
  const visible = useMemo(() => {
    if (!bounds) return toilets.slice(0, 60)
    const cap = zoom < 13 ? 60 : zoom < 15 ? 180 : 400
    const padded = bounds.pad(0.12)
    return toilets
      .filter((toilet) => padded.contains([toilet.lat, toilet.lon]))
      .slice(0, cap)
  }, [toilets, bounds, zoom])

  // 增量同步标记点
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = markersRef.current
    const wanted = new Set(visible.map((toilet) => toilet.id))

    for (const [id, marker] of markers) {
      if (!wanted.has(id)) {
        marker.remove()
        markers.delete(id)
      }
    }

    for (const toilet of visible) {
      const variant: PinVariant =
        toilet.id === selectedId
          ? 'selected'
          : toilet.id === nearestId
            ? 'nearest'
            : toilet.kind === 'place'
              ? 'place'
              : 'normal'

      let marker = markers.get(toilet.id)
      if (!marker) {
        marker = L.marker([toilet.lat, toilet.lon], {
          icon: PIN_ICONS[variant],
          keyboard: false,
          riseOnHover: true,
        })
        marker.on('click', () => callbacksRef.current.onSelect(toilet.id))
        marker.addTo(map)
        markers.set(toilet.id, marker)
      } else {
        marker.setIcon(PIN_ICONS[variant])
      }
      marker.setZIndexOffset(
        variant === 'selected' ? 1000 : variant === 'nearest' ? 500 : 0,
      )
    }
  }, [visible, selectedId, nearestId])

  // 当前位置标记（含精度圈）
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    originLayerRef.current?.remove()
    originLayerRef.current = null
    if (!origin) return

    const group = L.layerGroup()
    if (origin.accuracy && origin.accuracy < 800) {
      L.circle([origin.lat, origin.lon], {
        radius: origin.accuracy,
        interactive: false, // 否则点精度圈会被当成「在地图上选点」
        color: '#2f7cf6',
        weight: 1,
        opacity: 0.5,
        fillColor: '#2f7cf6',
        fillOpacity: 0.12,
      }).addTo(group)
    }
    L.marker([origin.lat, origin.lon], {
      icon: origin.source === 'gps' ? ORIGIN_ICON : PIN_ICONS.selected,
      interactive: false,
      zIndexOffset: 2000,
    }).addTo(group)
    group.addTo(map)
    originLayerRef.current = group
  }, [origin])

  // 响应外部聚焦请求（搜索结果 / 选中厕所）
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    map.setView(
      [focus.lat, focus.lon],
      focus.zoom ?? Math.max(map.getZoom(), 16),
      { animate: true },
    )
  }, [focus])

  const zoomBy = (delta: number) => {
    const map = mapRef.current
    if (map) map.setZoom(map.getZoom() + delta, { animate: true })
  }

  return (
    <div className="map-root">
      <div ref={containerRef} className="map-canvas" />
      <div className="map-controls">
        <div className="map-zoom">
          <button type="button" aria-label="放大" onClick={() => zoomBy(1)}>
            +
          </button>
          <button type="button" aria-label="缩小" onClick={() => zoomBy(-1)}>
            −
          </button>
        </div>
        <button
          type="button"
          className="map-basemap"
          aria-label="切换卫星图"
          onClick={() => setBasemap((prev) => (prev === 'street' ? 'satellite' : 'street'))}
        >
          {basemap === 'street' ? '卫星' : '地图'}
        </button>
        <button
          type="button"
          className={`map-locate ${locating ? 'is-busy' : ''}`}
          aria-label="定位到我的位置"
          onClick={onLocate}
        >
          <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
            <path
              d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
