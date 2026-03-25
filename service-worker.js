// ═══════════════════════════════════════════════════════════
//  ARAUCO DIGITAL HUB — Service Worker v1.0
//  Cachea todas las páginas del kit para uso offline
// ═══════════════════════════════════════════════════════════

const CACHE_NAME    = 'arauco-hub-v1';
const OFFLINE_URL   = '/offline.html';

// Archivos que se cachean al instalar la PWA
const PRECACHE_ASSETS = [
    '/login.html',
    '/menu.html',
    '/cine.html',
    '/info.html',
    '/status.html',
    '/error.html',
    '/logout.html',
    '/pista1.html',
    '/pista2.html',
    '/premio.html',

    '/offline.html',
    '/manifest.json',
    // Íconos
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

// ── INSTALL: cachear assets al instalar ──────────────────────
self.addEventListener('install', event => {
    console.log('[SW] Instalando Arauco Hub PWA...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Pre-cacheando archivos del Hub');
                // addAll falla silencioso si algún archivo no existe todavía
                return Promise.allSettled(
                    PRECACHE_ASSETS.map(url =>
                        cache.add(url).catch(err =>
                            console.warn('[SW] No se pudo cachear:', url, err)
                        )
                    )
                );
            })
            .then(() => {
                console.log('[SW] Instalación completa');
                return self.skipWaiting();
            })
    );
});

// ── ACTIVATE: limpiar caches viejos ──────────────────────────
self.addEventListener('activate', event => {
    console.log('[SW] Activando nueva versión...');
    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Borrando cache viejo:', name);
                        return caches.delete(name);
                    })
            )
        ).then(() => {
            console.log('[SW] Activación completa');
            return self.clients.claim();
        })
    );
});

// ── FETCH: estrategia por tipo de recurso ────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar requests que no son GET
    if (request.method !== 'GET') return;

    // Ignorar requests a APIs externas (clima, coingecko, etc.)
    const externalAPIs = [
        'api.open-meteo.com',
        'api.coingecko.com',
        'wa.me',
        'google.com/maps',
        'fonts.googleapis.com',
        'fonts.gstatic.com',
    ];

    if (externalAPIs.some(api => url.href.includes(api))) {
        // Para APIs externas: network first, sin fallback de cache
        event.respondWith(
            fetch(request).catch(() => {
                // Si falla la API externa, simplemente no hace nada
                return new Response('{}', {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Para fuentes de Google: cache first
    if (url.href.includes('fonts.googleapis') || url.href.includes('fonts.gstatic')) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // Para páginas HTML del Hub: Cache First con fallback a red
    if (request.destination === 'document' || url.pathname.endsWith('.html')) {
        event.respondWith(
            caches.match(request)
                .then(cached => {
                    if (cached) {
                        // Devolver cache y actualizar en background
                        fetch(request)
                            .then(response => {
                                if (response.ok) {
                                    caches.open(CACHE_NAME)
                                        .then(cache => cache.put(request, response));
                                }
                            })
                            .catch(() => {});
                        return cached;
                    }
                    // No está en cache: ir a la red
                    return fetch(request)
                        .then(response => {
                            if (response.ok) {
                                const clone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then(cache => cache.put(request, clone));
                            }
                            return response;
                        })
                        .catch(() => {
                            // Sin red y sin cache: mostrar offline.html
                            return caches.match(OFFLINE_URL);
                        });
                })
        );
        return;
    }

    // Para el resto (imágenes, JS, CSS): Cache First
    event.respondWith(
        caches.match(request)
            .then(cached => cached || fetch(request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => new Response('', { status: 404 }))
            )
    );
});

// ── MENSAJE desde la app (para forzar update) ────────────────
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
