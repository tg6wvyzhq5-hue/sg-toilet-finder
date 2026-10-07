import type { TileLayerOptions } from 'leaflet'

/**
 * 底图配置集中在这里，想换地图服务只改这一个文件。
 *
 * 默认用 OpenStreetMap 官方瓦片：完全免费、不需要 Key，地名中英混排。
 * 另外提供一个卫星图开关（Esri World Imagery，同样无需 Key），
 * 方便在公园、海边这类没有建筑轮廓的地方确认厕所位置。
 *
 * 想换成 Google 地图底图，需要自己申请 Maps JavaScript API 并遵守其条款。
 */
export interface TileSource {
  name: string
  url: string
  options: TileLayerOptions
}

export const STREET_TILE: TileSource = {
  name: 'OpenStreetMap',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  options: {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
}

/** 卫星影像 + 地名标注，两层叠在一起 */
export const SATELLITE_TILES: TileSource[] = [
  {
    name: 'Esri World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxZoom: 19,
      attribution:
        'Imagery &copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
    },
  },
  {
    name: 'Esri Places',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: '' },
  },
]

/**
 * 没有定位权限时的默认中心：政府大厦 / 莱佛士坊一带。
 * （新加坡的地理几何中心在麦里芝蓄水池的森林里，作为兜底太没用了）
 */
export const SINGAPORE_CENTER = { lat: 1.2906, lon: 103.8515 }
