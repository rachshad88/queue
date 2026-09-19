// Offline voice fallback: plays pre-recorded clip sequences (app/sound/voice/*.mp3)
// when speechSynthesis is missing or silent (Android System WebView / TV browsers).
// Heavily relied on by js/index.js and js/live.js. Fully offline — no network at runtime.

(function () {
  var _voiceEl = null;
  function getVoiceEl() {
    if (!_voiceEl) {
      try {
        var a = new Audio();
        a.preload = 'auto';
        if (document.body) { try { document.body.appendChild(a); } catch (e) { /* ignore */ } }
        _voiceEl = a;
      } catch (e) { /* audio element unavailable */ }
    }
    return _voiceEl;
  }

  // Pre-recorded clip rescue. Plays each part back-to-back on its own preloaded
  // <audio> element so decode latency between clips is ~zero (this is where the
  // "slow chained reading" came from). Returns true when the sequence was
  // started; false when a required part is missing. If a clip fails to load
  // (e.g. partial deploy), the listener is invoked instead of silent playback.
  function playSpokenParts(parts, onFail) {
    if (!parts || !parts.length) return false;
    if (!window.VOICE_PARTS || !window.VOICE_PARTS.indexOf) return false;
    for (var i = 0; i < parts.length; i++) {
      if (window.VOICE_PARTS.indexOf(parts[i]) === -1) return false;
    }
    var els = [];
    for (var j = 0; j < parts.length; j++) {
      try {
        var a = new Audio();
        a.src = 'sound/voice/' + parts[j] + '.mp3';
        a.preload = 'auto';
        if (document.body) { try { document.body.appendChild(a); } catch (e) { /* ignore */ } }
        els.push(a);
      } catch (e) { els.push(null); }
    }
    _voiceEl = els[0] || null;
    var index = 0;
    var failed = false;
    function cleanup() {
      for (var x = 0; x < els.length; x++) {
        try { els[x].pause(); } catch (e) { /* ignore */ }
        try { if (els[x].parentNode) els[x].parentNode.removeChild(els[x]); } catch (e) { /* ignore */ }
      }
    }
    function fail(reason) {
      if (failed) return;
      failed = true;
      cleanup();
      if (typeof onFail === 'function') onFail(reason);
    }
    function next() {
      if (failed) return;
      var a = els[index++];
      if (!a) { fail('missing'); return; }
      var done = (index >= els.length);
      function onDone() { if (done) cleanup(); else next(); }
      function onErr() { fail('error'); }
      a.onended = onDone;
      a.onerror = onErr;
      try {
        var p = a.play();
        if (p && p.then) {
          p.then(function () {
            // Guard: an ultra-short clip may already be finished before the
            // promise resolves, so onended could never fire.
            try { if (a.ended) onDone(); } catch (e) { /* ignore */ }
          }).catch(function () { fail('blocked'); });
        } else {
          try { if (a.ended) onDone(); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        fail('error');
      }
    }
    next();
    return true;
  }

  // "AB12" -> ['letter_A','letter_B','digit_1','digit_2']
  function spellVoiceParts(code) {
    var out = [];
    var s = String(code || '').toUpperCase();
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (/[A-Z]/.test(ch)) out.push('letter_' + ch);
      else if (/[0-9]/.test(ch)) out.push('digit_' + ch);
    }
    return out;
  }

  var WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  var DEPT_WORDS = ['admission', 'clinic', 'laboratory', 'pharmacy', 'dental', 'nutrition',
    'veterinary', 'abtc', 'tb', 'waiting', 'area'];

  // "ADMISSION 1" -> ['dept_admission','number_one'] ; "TB-DOTS" -> ['dept_tb_dots'] ; "ABTC" -> ['dept_abtc']
  function deptVoiceParts(name) {
    var s = String(name || '').toLowerCase().trim();
    if (!s) return [];
    var tokens = s.split(/[^a-z0-9]+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t === 'tb') { out.push('dept_tb_dots'); continue; }
      if (t === 'dots' && out[out.length - 1] === 'dept_tb_dots') continue;
      if (DEPT_WORDS.indexOf(t) !== -1) { out.push('dept_' + t); continue; }
      if (/^[0-9]+$/.test(t)) {
        var n = parseInt(t, 10);
        if (n >= 1 && n <= 10) out.push('number_' + WORDS[n - 1]);
        else out = out.concat(spellVoiceParts(t));
        continue;
      }
      out = out.concat(spellVoiceParts(t));
    }
    return out;
  }

  window.playSpokenParts = playSpokenParts;
  window.spellVoiceParts = spellVoiceParts;
  window.deptVoiceParts = deptVoiceParts;
})();