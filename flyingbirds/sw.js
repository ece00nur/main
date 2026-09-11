// Minimal offline-caching Service Worker.
// Strategy: cache-first for the app shell, with runtime caching for anything
// else same-origin fetches pull in later (e.g. a newly added asset).
const CACHE_VERSION = 'flying-bird-v3';

const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './game.js',
    './firebase-config.js',
    './leaderboard.js',
    './manifest.json',
    './assets/bg_panorama.png',
    './assets/ground.png',
    './assets/pipe_top.png',
    './assets/pipe_bottom.png',
    './assets/bird1.png',
    './assets/bird2.png',
    './assets/bird3.png',
    './assets/bird4.png',
    './assets/bird5.png',
    './assets/bird6.png',
    './assets/bird7.png',
    './assets/leaf.png',
    './assets/feather.png',
    './assets/sakura.png',
    './assets/electro.png',
    './assets/ginkgo.png',
    './assets/anemo_blade.png',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle simple same-origin GETs; let everything else (analytics,
    // POSTs, cross-origin font requests, etc.) go straight to the network.
    if (event.request.method !== 'GET') return;
    if (new URL(event.request.url).origin !== self.location.origin) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const network = fetch(event.request)
                .then((response) => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => cached);

            // Cache-first: serve instantly if we have it, still refresh the
            // cache in the background so the next offline session is current.
            return cached || network;
        })
    );
});
