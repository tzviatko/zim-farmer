const SHELL_CACHE = 'zim-farmer-shell-v1'
const STATIC_CACHE = 'zim-farmer-static-v1'

// On install: cache the page shell immediately and take over straight away
self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.add('/'))
  )
})

// On activate: claim all clients and prune old cache versions
self.addEventListener('activate', event => {
  const keep = new Set([SHELL_CACHE, STATIC_CACHE])
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)))
      ),
    ])
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle GET requests from this origin
  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // Next.js immutable static assets: cache-first forever (filenames are content-hashed)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        const hit = await cache.match(request)
        if (hit) return hit
        const fresh = await fetch(request)
        if (fresh.ok) cache.put(request, fresh.clone())
        return fresh
      })
    )
    return
  }

  // Everything else (page shell, fonts, icons): stale-while-revalidate
  // Falls back to the cached '/' shell for navigation when offline
  event.respondWith(
    caches.open(SHELL_CACHE).then(async cache => {
      const cached = await cache.match(request)

      const networkFetch = fetch(request)
        .then(response => {
          if (response.ok) cache.put(request, response.clone())
          return response
        })
        .catch(() => null)

      if (cached) {
        // Serve stale immediately, refresh in background
        networkFetch.catch(() => {})
        return cached
      }

      const fresh = await networkFetch
      if (fresh) return fresh

      // Offline fallback: return cached shell for navigation requests
      if (request.mode === 'navigate') {
        return cache.match('/') ?? new Response('Offline', { status: 503 })
      }

      return new Response('Offline', { status: 503 })
    })
  )
})
