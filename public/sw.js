/**
 * 离线缓存策略（部署后重新发布也不会白屏）：
 *
 *   HTML / 页面导航  → network-first：每次都先取最新的 index.html，
 *                      断网时才回退到缓存（否则新版本发布后，
 *                      旧的 index.html 会指向已删除的旧 assets，直接白屏）
 *   /assets/*        → cache-first：Vite 产物带内容哈希，内容变了文件名就变，可以放心长缓存
 *   /data/*.json     → network-first + 缓存兜底：保证点位数据尽量新，断网也能用
 *   sw.js            → 完全不拦截，交给浏览器自己更新
 *   跨域请求          → 不拦截（地图瓦片、Overpass、Nominatim）
 */
const VERSION = 'v2'
const CACHE = `sg-toilet-finder-${VERSION}`
const OFFLINE_CORE = ['./manifest.webmanifest', './icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(OFFLINE_CORE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request, { cacheFallback = true } = {}) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    if (cacheFallback) {
      const cached = await cache.match(request)
      if (cached) return cached
      // 导航请求断网时兜底返回首页
      if (request.mode === 'navigate') {
        const shell = await cache.match('./index.html')
        if (shell) return shell
      }
    }
    throw error
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/sw.js')) return

  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(networkFirst(request))
    return
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})
