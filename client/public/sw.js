/*
 * Offline support for the RHU queue screens.
 * - Pages: network first, falling back to the saved app shell when the server is unreachable.
 * - Built assets, fonts, images and voice clips: served from the cache once seen.
 * - API calls and the live socket are never cached here; the app handles those itself.
 */
const VERSION = 'rhuq-v2';
const SHELL = 'rhuq-shell-' + VERSION;
const FILES = 'rhuq-files-' + VERSION;
const scope = new URL(self.registration.scope).pathname; // e.g. "/queue/"
const shellUrl = scope;

/** Save the shell and the scripts, styles and icons it links, so the first visit already works offline. */
async function saveShell(response) {
  const html = await response.clone().text();
  await (await caches.open(SHELL)).put(shellUrl, response);
  const linked = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|png|svg|ico|webp|woff2))"/g)].map((m) => new URL(m[1], self.location.origin + scope).href);
  const files = await caches.open(FILES);
  await Promise.all(linked.map((href) => files.match(href).then((hit) => hit || files.add(href)).catch(() => undefined)));
  linked.forEach((href) => pruneOldBuilds(files, new URL(href).pathname));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch(new Request(shellUrl, { cache: 'reload' }))
      .then((response) => (response.ok ? saveShell(response) : undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rhuq-') && k !== SHELL && k !== FILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isApi = (path) => path.startsWith(scope + 'api/') || path.startsWith(scope + 'socket.io/');
const isFile = (path) => /^(assets|fonts|img|sound)\//.test(path.slice(scope.length)) || /\.(js|css|woff2?|png|svg|ico|mp3|webp)$/.test(path);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scope) || isApi(url.pathname)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            event.waitUntil(saveShell(response.clone()).catch(() => undefined));
          }
          return response;
        })
        .catch(() => caches.match(shellUrl, { cacheName: SHELL }).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Images, fonts and voice clips: answer from disk at once, refresh the saved copy in the background.
  if (/^(img|fonts|sound)\//.test(url.pathname.slice(scope.length))) {
    event.respondWith(
      caches.open(FILES).then((cache) =>
        cache.match(request).then((hit) => {
          const update = fetch(request)
            .then((response) => {
              if (response.ok && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => hit || Response.error());
          if (hit) {
            event.waitUntil(update.then(() => undefined));
            return hit;
          }
          return update;
        }),
      ),
    );
    return;
  }

  if (isFile(url.pathname)) {
    event.respondWith(
      caches.open(FILES).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((response) => {
              // Range responses (audio seeking) cannot be stored whole.
              if (response.ok && response.status === 200) {
                cache.put(request, response.clone());
                pruneOldBuilds(cache, url.pathname);
              }
              return response;
            }),
        ),
      ),
    );
  }
});

/** A new build replaces `assets/index-OLDHASH.js`; drop the old copies so the cache does not grow per deploy. */
function pruneOldBuilds(cache, path) {
  const match = path.match(/\/assets\/(.+)-[\w-]{6,}\.(js|css)$/);
  if (!match) {
    return;
  }
  cache.keys().then((requests) => {
    for (const old of requests) {
      const oldPath = new URL(old.url).pathname;
      const other = oldPath.match(/\/assets\/(.+)-[\w-]{6,}\.(js|css)$/);
      if (other && other[1] === match[1] && other[2] === match[2] && oldPath !== path) {
        cache.delete(old);
      }
    }
  });
}
