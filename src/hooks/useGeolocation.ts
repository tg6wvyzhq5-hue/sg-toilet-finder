import { useCallback, useEffect, useRef, useState } from 'react'
import type { Origin } from '../types'
import { isInSingapore } from '../lib/geo'

export type GeoStatus =
  | 'idle'
  | 'unsupported'
  | 'locating'
  | 'granted'
  | 'denied'
  | 'error'

interface Options {
  auto?: boolean
}

/**
 * 浏览器定位封装。只拿一次当前位置（省电），需要更新时手动调用 request()。
 * 定位失败时把状态暴露给 UI，让用户可以用「点地图选点」兜底。
 */
export function useGeolocation({ auto = true }: Options = {}) {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const [origin, setOrigin] = useState<Origin | null>(null)
  const [status, setStatus] = useState<GeoStatus>(
    supported ? 'idle' : 'unsupported',
  )
  const [error, setError] = useState<string | null>(null)
  const [outsideSingapore, setOutsideSingapore] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const request = useCallback(() => {
    if (!supported) {
      setStatus('unsupported')
      setError('当前浏览器不支持定位，请在地图上手动选择位置')
      return
    }
    setStatus('locating')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current) return
        const next: Origin = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: 'gps',
        }
        setOrigin(next)
        setStatus('granted')
        setOutsideSingapore(!isInSingapore(next.lat, next.lon))
      },
      (err) => {
        if (!mounted.current) return
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied')
          setError('定位权限被拒绝，可以点击地图任意位置手动选点')
        } else if (err.code === err.TIMEOUT) {
          setStatus('error')
          setError('定位超时，请重试或点击地图手动选点')
        } else {
          setStatus('error')
          setError('无法获取位置，请检查网络或点击地图手动选点')
        }
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  }, [supported])

  useEffect(() => {
    if (auto && supported) request()
    // 只在挂载时自动定位一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 用户在地图上点选 / 搜索地点时使用 */
  const setManualOrigin = useCallback(
    (lat: number, lon: number, source: Origin['source'] = 'manual') => {
      setOrigin({ lat, lon, source })
      setStatus('granted')
      setError(null)
      setOutsideSingapore(!isInSingapore(lat, lon))
    },
    [],
  )

  return {
    origin,
    status,
    error,
    outsideSingapore,
    request,
    setManualOrigin,
    supported,
  }
}
