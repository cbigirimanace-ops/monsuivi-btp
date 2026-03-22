// ═══════════════════════════════════════════════════════════
// CIVIL+ — Service Worker v1.0
// Cache stratégique pour mode hors-ligne
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'civilplus-v1';
const CACHE_STATIC = 'civilplus-static-v1';
const CACHE_API = 'civilplus-api-v1';

// Ressources à mettre en cache immédiatement (App Shell)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700;14..32,800&family=JetBrains+Mono:wght@500;700&display=swap',
  'https://cdn.jsdelivr.net/npm/apexcharts@3.49.0/dist/apexcharts.min.js',
];

// ── Installation : mise en cache du shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] Mise en cache du shell applicatif');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => console.warn('[SW] Certaines ressources non mises en cache:', err));
    }).then(() => self.skipWaiting())
  );
});

// ── Activation : nettoyage des anciens caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_STATIC && key !== CACHE_API)
          .map(key => {
            console.log('[SW] Suppression ancien cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch : stratégie par type de ressource ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les requêtes API Vercel
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response(
          JSON.stringify({ status: 'local_only', message: 'Hors-ligne — mode local actif' }),
          { headers: { 'Content-Type': 'application/json' } }
        ))
    );
    return;
  }

  // Ne pas intercepter les requêtes Supabase
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response('{}', { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Stratégie Cache First pour les ressources statiques (fonts, JS libs)
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Stratégie Network First avec fallback cache pour l'app principale
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html').then(cached => {
          if (cached) return cached;
          return new Response('<h1>Hors-ligne</h1><p>Rechargez quand la connexion est rétablie.</p>', {
            headers: { 'Content-Type': 'text/html' }
          });
        }))
    );
    return;
  }

  // Défaut : Network with cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Message : forcer la mise à jour ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
