// TimesUp Service Worker v1.0.0
// Change this cache name to trigger update notification
const CACHE_NAME = 'timesup-v1.0.0';
const APP_VERSION = '1.0.0';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './version.json',
  './css/style.css',
  './js/app.js',
  './js/timer.js',
  './js/dashboard.js',
  './js/storage.js',
  './js/pdf.js',
  './js/notifications.js',
  'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100;200;300;400;500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

// Install event - cache assets
self.addEventListener('install', event => {
  console.log('[SW] Installing version', APP_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.map(url => {
        return new Request(url, { mode: 'no-cors' });
      })).catch(err => {
        console.log('[SW] Cache addAll partial failure:', err);
        // Try to cache what we can
        return Promise.allSettled(
          STATIC_ASSETS.map(url => cache.add(url).catch(e => console.log('[SW] Failed to cache:', url, e)))
        );
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating version', APP_VERSION);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('timesup-') && name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Notify all clients about the update
      return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: APP_VERSION,
            cacheName: CACHE_NAME
          });
        });
      });
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip chrome-extension and other non-http
  if (!url.protocol.startsWith('http')) return;

  // For version.json - always try network first to detect updates
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(event.request).then(response => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // For Google Fonts and CDN - cache first
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          return response;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
    return;
  }

  // For app files - cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        }
        return response;
      }).catch(() => {
        // Fallback to index.html for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Background sync for timer accuracy
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'KEEP_ALIVE') {
    // Respond to keep-alive pings from the app
    event.source && event.source.postMessage({ type: 'ALIVE', timestamp: Date.now() });
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notifications (for local notifications via SW)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('./');
    })
  );
});
