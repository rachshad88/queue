(function () {
  if (typeof window.fetch === 'function') return;
  // Android System WebView (TV browsers) predates fetch(); provide a minimal
  // XHR-backed equivalent covering the URL -> {ok,status,json(),text()} usage.
  window.fetch = function (url, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(opts.method || 'GET', url, true);
      if (opts.headers && opts.headers['Content-Type']) {
        xhr.setRequestHeader('Content-Type', opts.headers['Content-Type']);
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            ok: true,
            status: xhr.status,
            json: function () { return Promise.resolve(JSON.parse(xhr.responseText)); },
            text: function () { return Promise.resolve(xhr.responseText); }
          });
        } else {
          reject(new Error('HTTP ' + xhr.status));
        }
      };
      xhr.onerror = function () { reject(new Error('Network error')); };
      xhr.send(opts.body || null);
    });
  };
})();