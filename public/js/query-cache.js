(function () {
  var cache = {};
  function keyPrefix(key) { return String(key || ''); }
  // Android System WebView (TV browsers) exposes no fetch(); fall back to XHR.
  function xhrJson(url) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); }
        } else { reject(new Error('HTTP ' + xhr.status)); }
      };
      xhr.onerror = function () { reject(new Error('Network error')); };
      xhr.send();
    });
  }
  function reqJson(url) {
    if (typeof fetch === 'function') {
      return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }
    return xhrJson(url);
  }
  window.QueryCache = {
    fetchQuery: function (key, url, opts) {
      var stale = opts && opts.staleTime ? opts.staleTime : 0;
      var now = Date.now();
      var hit = cache[key];
      if (hit && now - hit.time < stale) return Promise.resolve(hit.data);
      return reqJson(url).then(function (data) {
        cache[key] = { time: Date.now(), data: data };
        return data;
      });
    },
    invalidate: function (prefix) {
      var p = keyPrefix(prefix);
      for (var key in cache) if (Object.prototype.hasOwnProperty.call(cache, key) && key.indexOf(p) === 0) delete cache[key];
    }
  };
})();
