(function () {
  var URL = './get_live_serving.php';
  var DEPT_KEY = 'live_selected_depts';
  var SIDEBAR_KEY = 'live_sidebar_collapsed';
  var WAIT_HIDDEN_KEY = 'live_waiting_hidden';
  var SEC_ADM_KEY = 'live_adm_sections';
  var SEC_WAIT_KEY = 'live_wait_sections';
  var lastData = [];
  var pollTimer = null;
  var ANNOUNCE_KEY = 'live_announce';
  var prevServing = {};
  var _chimeCtx = null;
  var _liveSocket = null;
  var _annAudio = null;
  var _audioUnlocked = false;

  function getChimeContext() {
    try {
      if (!_chimeCtx) {
        var Ctr = window.AudioContext || window.webkitAudioContext;
        if (!Ctr) return null;
        _chimeCtx = new Ctr();
      }
      if (_chimeCtx.state === 'suspended') _chimeCtx.resume();
      return _chimeCtx;
    } catch (e) { return null; }
  }

  // Synthesized three-note call chime. Returns true if a WebAudio path exists.
  function playChime() {
    var ctx = getChimeContext();
    if (!ctx) return false;
    try {
      var now = ctx.currentTime;
      [880, 941, 1046].forEach(function (freq, i) {
        var start = now + i * 0.22, dur = 0.3;
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = 'sine';
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.6, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.start(start); osc.stop(start + dur);
      });
      return true;
    } catch (e) { return false; }
  }

  // File-based announcement. m4a has a correct audio MIME everywhere; wav is the
  // universal fallback, served through sound/serve.php so older WebViews get the
  // right Content-Type instead of application/octet-stream.
  var _annTry = 0;
  var _annSrcs = ['sound/announcement.m4a', 'sound/serve.php?f=announcement.wav'];
  function getAnnouncementAudio() {
    if (!_annAudio) {
      try {
        var a = new Audio();
        a.preload = 'auto';
        a.onerror = function () {
          _annTry++;
          if (_annTry < _annSrcs.length) {
            try { a.src = _annSrcs[_annTry]; a.load(); } catch (e) { /* ignore */ }
          }
        };
        a.src = _annSrcs[0];
        a.load();
        if (document.body) { try { document.body.appendChild(a); } catch (e) { /* ignore */ } }
        _annAudio = a;
      } catch (e) { /* audio element unavailable */ }
    }
    return _annAudio;
  }

  var _retrying = false;
  function retrySoundLater() {
    if (_retrying) return;
    _retrying = true;
    setTimeout(function () {
      _retrying = false;
      playAnnouncement();
    }, 4000);
  }

  function playAnnouncement() {
    try {
      var a = getAnnouncementAudio();
      if (a) {
        var retried = false;
        var retryOnce = function () { if (!retried) { retried = true; if (!playChime()) retrySoundLater(); } };
        a.onerror = retryOnce;
        a.currentTime = 0;
        var p = a.play();
        if (p && p.then) {
          p.then(function () { a.onerror = null; }).catch(retryOnce);
        } else if (p) {
          a.onerror = null;
        } else {
          retryOnce();
        }
      } else if (!playChime()) {
        retrySoundLater();
      }
    } catch (e) {
      if (!playChime()) retrySoundLater();
    }
  }

  function hideAudioHint() {
    try {
      var el = document.getElementById('audio-hint');
      if (el) el.classList.add('audio-hint-hidden');
    } catch (e) { /* ignore */ }
  }

  // Called once per page session after the first trusted gesture so the browser
  // will allow the announcement file/AudioContext to play without further input.
  function unlockAudio() {
    if (_audioUnlocked) return;
    try {
      var a = getAnnouncementAudio();
      if (a) {
        var p = a.play();
        if (p && p.then) p.then(function () { a.pause(); a.currentTime = 0; }).catch(function () {});
      }
    } catch (e) { /* ignore */ }
    try { var ctx = getChimeContext(); if (ctx && ctx.resume) ctx.resume(); } catch (e2) { /* ignore */ }
    _audioUnlocked = true;
    hideAudioHint();
  }

  // Best-effort autoplay probe on load (no trusted gesture needed): resumes the
  // AudioContext and plays the announcement muted. Harmless when the browser
  // still blocks audio; helps once the origin has autoplay allowance (MEI).
  function primeAudioBestEffort() {
    try {
      var ctx = getChimeContext();
      if (ctx && ctx.resume) ctx.resume();
    } catch (e) { /* ignore */ }
    try {
      var a = getAnnouncementAudio();
      if (a) {
        a.volume = 0;
        var p = a.play();
        if (p && p.then) p.then(function () { try { a.pause(); a.currentTime = 0; } catch (e2) { /* ignore */ } }).catch(function () {});
      }
      setTimeout(function () { try { if (_annAudio) _annAudio.volume = 1; } catch (e3) { /* ignore */ } }, 600);
    } catch (e4) { /* ignore */ }
  }

  function announceEnabled() { try { return localStorage.getItem(ANNOUNCE_KEY) !== '0'; } catch (e) { return true; } }
  function speakLocal(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.95; u.volume = 1;
      window.speechSynthesis.speak(u);
    } catch (e) { /* speech not available */ }
  }
  function announce(text) {
    try {
      if (!announceEnabled()) return;
      playAnnouncement();
      speakLocal(text);
    } catch (e) { /* speech not available */ }
  }
  function announceParts(parts, text) {
    try {
      if (!announceEnabled()) return;
      playAnnouncement();
      var partsText = String(text || '');
      setTimeout(function () {
        var played = false;
        if (window.playSpokenParts) {
          function fallback() { speakLocal(partsText); }
          played = window.playSpokenParts(parts, fallback);
        }
        if (!played) speakLocal(partsText);
      }, 750);
    } catch (e) { /* ignore */ }
  }
  function spellForTts(code) {
    return String(code || '').split('').map(function (ch) { return /[0-9A-Za-z]/.test(ch) ? ch.toUpperCase() : ''; }).filter(Boolean).join(' ');
  }
  function handleRepeatCall(payload) {
    try {
      payload = payload || {};
      var deptId = String(payload.department_id != null ? payload.department_id : '');
      if (deptId && selectedIds().indexOf(deptId) === -1) return;
      var number = String(payload.queue_number || '').trim();
      if (!number) return;
      var target = String(payload.department_name || '').trim();
      var parts = ['repeating_call', 'queue_number'];
      parts = parts.concat(window.spellVoiceParts ? window.spellVoiceParts(number) : []);
      var suffix = '';
      if (target) {
        parts = parts.concat(['please_proceed_to']);
        if (window.deptVoiceParts) parts = parts.concat(window.deptVoiceParts(target));
        suffix = '. Please proceed to ' + target + '.';
      }
      announceParts(parts, 'Repeating call. Queue number ' + spellForTts(number) + suffix);
    } catch (e) { /* ignore */ }
  }
  // Dedupe guard between the socket payload announcer and the 5s poll diff:
  // at most one serve-next announcement per queue number change, regardless of
  // which of the two lands first (their ordering raced before this fix).
  var _recentlyAnnounced = {};
  function isRecentlyAnnounced(key, number) {
    var e = _recentlyAnnounced[key];
    if (!e) return false;
    if (e.n !== number) { delete _recentlyAnnounced[key]; return false; }
    return (Date.now() - e.t) < 4500;
  }
  function markAnnounced(key, number) { _recentlyAnnounced[key] = { n: number, t: Date.now() }; }

  // Announce a serve-next directly from the queue-updated payload: the
  // "Now serving. Queue number <spelled>" phrase (mirrors the operator's
  // announceServeNext in js/index.js). trackAndAnnounce remains the poll
  // fallback when a payload carries no queue number.
  function announceServePayload(payload) {
    try {
      payload = payload || {};
      var number = String(payload.queue_number || '').trim();
      if (!number) return;
      var deptId = String(payload.dept != null ? payload.dept : '');
      if (deptId && selectedIds().indexOf(deptId) === -1) return;
      // Seed the diff baseline and dedupe. Key forms must match
      // trackAndAnnounce: sectioned uses deptId:label, plain uses d+deptId.
      var label = String(payload.section || '').trim();
      var forms = ['d' + deptId];
      if (label) forms.push(deptId + ':' + label);
      var skip = false;
      for (var i = 0; i < forms.length; i++) {
        prevServing[forms[i]] = number;
        if (isRecentlyAnnounced(forms[i], number)) skip = true;
      }
      if (skip) return;
      for (var j = 0; j < forms.length; j++) markAnnounced(forms[j], number);
      var parts = ['now_serving', 'queue_number'];
      parts = parts.concat(window.spellVoiceParts ? window.spellVoiceParts(number) : []);
      announceParts(parts, 'Now serving. Queue number ' + spellForTts(number) + '.');
    } catch (e) { /* ignore */ }
  }
  function trackAndAnnounce(data) {
    try {
      var next = {};
      for (var i = 0; i < data.length; i++) {
        var dept = data[i], sections = dept.serving || [];
        if (dept.is_sectioned || dept.is_admission) {
          for (var j = 0; j < sections.length; j++) {
            var s = sections[j], key = dept.id + ':' + s.section;
            if (s.queue_number && s.queue_number !== '-') {
              next[key] = s.queue_number;
              if (prevServing[key] !== undefined && prevServing[key] !== s.queue_number) {
                if (!isRecentlyAnnounced(key, s.queue_number)) {
                  markAnnounced(key, s.queue_number);
                  var parts = ['now_serving', 'queue_number'].concat(window.spellVoiceParts ? window.spellVoiceParts(s.queue_number) : []);
                  announceParts(parts, 'Now serving. Queue number ' + spellForTts(s.queue_number) + '.');
                }
              }
            }
          }
        } else {
          var q = sections.length ? sections[0] : null, key2 = 'd' + dept.id;
          if (q && q.queue_number && q.queue_number !== '-') {
            next[key2] = q.queue_number;
            if (prevServing[key2] !== undefined && prevServing[key2] !== q.queue_number) {
              if (!isRecentlyAnnounced(key2, q.queue_number)) {
                markAnnounced(key2, q.queue_number);
                var parts2 = ['now_serving', 'queue_number'].concat(window.spellVoiceParts ? window.spellVoiceParts(q.queue_number) : []);
                announceParts(parts2, 'Now serving. Queue number ' + spellForTts(q.queue_number) + '.');
              }
            }
          }
        }
      }
      prevServing = next;
    } catch (e) { /* ignore */ }
  }

  function esc(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function getJson(key, fallback) { try { var v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : fallback; } catch (e) { return fallback; } }
  function setJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function selectedIds() { var out = [], els = document.querySelectorAll('.dept-checkbox:checked'); for (var i=0;i<els.length;i++) out.push(els[i].value); return out; }
  function hiddenWaits() { return getJson(WAIT_HIDDEN_KEY, []); }
  function secSaved(key) { return getJson(key, null); }
  function selectedSecs(key) { var out=[], els=document.querySelectorAll('.sec-checkbox[data-sec-key="'+key+'"]:checked'); for(var i=0;i<els.length;i++) out.push(els[i].value); return out; }
  function secKeyForDept(id, name) { var n=String(name||'').toUpperCase(); if(String(id)==='3'||n.indexOf('ADMISSION')!==-1) return SEC_ADM_KEY; if(String(id)==='15'||n.indexOf('WAITING')!==-1) return SEC_WAIT_KEY; return null; }
  function catInfo(category) { var c=String(category||'regular').toLowerCase(); if(c.indexOf('emerg')!==-1)return {cls:'emergency',label:'Emergency'}; if(c.indexOf('pwd')!==-1||c.indexOf('person')!==-1)return {cls:'pwd',label:'PWD'}; if(c.indexOf('prior')!==-1||c.indexOf('vip')!==-1)return {cls:'priority',label:'Priority'}; if(c.indexOf('senior')!==-1)return {cls:'senior',label:'Senior'}; return {cls:'regular',label:'Regular'}; }
  function topBarHtml(staff) { return staff ? '<div class="card-top"><span class="server-chip">'+esc(staff)+'</span></div>' : ''; }
  function footHtml(category, live) { var h='<div class="card-foot"><span class="status-pill '+(live?'live':'idle')+'"><span class="led"></span>'+(live?'Now Serving':'Idle')+'</span>'; if(category){var i=catInfo(category);h+='<span class="category-chip cat-'+i.cls+'">'+i.label+'</span>';}return h+'</div>'; }
  function setGridCount(grid) { grid.setAttribute('data-count', String(grid.children.length)); }
  function updateStyles() { var all=document.querySelectorAll('.dept-checkbox,.sec-checkbox,.wait-checkbox'); for(var i=0;i<all.length;i++){var label=all[i].closest?all[i].closest('.dept-option'):all[i].parentNode; if(label) label.classList.toggle('active',all[i].checked); } }
  function fitText(el, floor) {
    if (!el || el.classList.contains('empty')) return;
    el.style.fontSize = ''; el.style.letterSpacing = '';
    var start = parseFloat(getComputedStyle(el).fontSize) || 0;
    var spacing = parseFloat(getComputedStyle(el).letterSpacing) || 0;
    if (!start || el.scrollWidth <= el.clientWidth + 4) return;
    var f = start, guard = 0;
    while (el.scrollWidth > el.clientWidth - 8 && f > floor && guard++ < 14) {
      f = Math.max(floor, Math.floor(f * ((el.clientWidth - 8) / el.scrollWidth) * 100) / 100);
      el.style.fontSize = f + 'px';
      el.style.letterSpacing = (spacing * (f / start)).toFixed(2) + 'px';
    }
    if (el.scrollWidth > el.clientWidth && spacing > 0) {
      el.style.letterSpacing = '0px';
      guard = 0;
      while (el.scrollWidth > el.clientWidth && f > floor && guard++ < 14) {
        f = Math.max(floor, Math.floor(f * (el.clientWidth / el.scrollWidth) * 100) / 100);
        el.style.fontSize = f + 'px';
      }
    }
  }
  function fitCards() {
    var els = document.querySelectorAll('.dept-card .queue-number,.dept-card .dept-name');
    for (var i = 0; i < els.length; i++) fitText(els[i], 10);
    var chips = document.querySelectorAll('.server-chip');
    for (var j = 0; j < chips.length; j++) fitText(chips[j], 18);
  }

  function renderWaitSub(data) {
    var sub=document.getElementById('admission-wait-sub'); if(!sub)return;
    var admission=null; for(var i=0;i<data.length;i++)if(data[i].is_admission){admission=data[i];break;}
    var dept=admission&&document.querySelector('.dept-checkbox[value="'+admission.id+'"]');
    if(!admission||!dept||!dept.checked){sub.innerHTML='';sub.setAttribute('data-empty','1');return;}
    var hidden=hiddenWaits(), waits=admission.waiting||[], html='', valid=[];
    for(var j=0;j<waits.length;j++){var w=waits[j],id=String(w.id),info=catInfo(w.category);valid.push(id);html+='<label class="dept-option dept-sub-option'+(hidden.indexOf(id)===-1?' active':'')+'"><input class="wait-checkbox" type="checkbox" value="'+id+'"'+(hidden.indexOf(id)===-1?' checked':'')+'><span class="dept-label">'+esc(w.queue_number)+'</span><span class="wait-cat cat-'+info.cls+'">'+info.label+'</span></label>';}
    sub.innerHTML=html;sub.setAttribute('data-empty',waits.length?'0':'1');
    var keep=[];for(var k=0;k<hidden.length;k++)if(valid.indexOf(hidden[k])!==-1)keep.push(hidden[k]);if(keep.length!==hidden.length)setJson(WAIT_HIDDEN_KEY,keep);
  }
  function renderRail(data) {
    var rail=document.getElementById('wait-rail'),list=document.getElementById('wait-rail-list'),count=document.getElementById('wait-rail-count');if(!rail||!list)return;
    var hidden=hiddenWaits(),sel=selectedIds(),groups='',shown=0;
    for(var i=0;i<data.length;i++){
      var dept=data[i];if(sel.indexOf(String(dept.id))===-1)continue;
      var waits=dept.waiting||[],prio='',reg='',dshown=0;
      for(var j=0;j<waits.length;j++){
        var w=waits[j];if(hidden.indexOf(String(w.id))!==-1)continue;
        var info=catInfo(w.category);
        var row='<div class="wait-row '+(info.cls==='regular'?'is-regular':(info.cls==='emergency'?'is-emergency':'is-priority'))+'"><span class="wait-num">'+esc(w.queue_number)+'</span></div>';
        if(info.cls==='regular')reg+=row;else prio+=row;
        dshown++;
      }
      if(!dshown)continue;
      shown+=dshown;
      groups+='<div class="wait-dept">'
        +'<div class="wait-dept-head"><span class="wait-dept-name">'+esc(dept.name)+'</span><span class="wait-dept-count">'+dshown+'</span></div>'
        +'<div class="wait-cols">'
        +'<div class="wait-col is-priority"><div class="wait-col-head">Priority</div>'+(prio||'<div class="wait-empty">—</div>')+'</div>'
        +'<div class="wait-col is-regular"><div class="wait-col-head">Regular</div>'+(reg||'<div class="wait-empty">—</div>')+'</div>'
        +'</div>'
        +'</div>';
    }
    list.innerHTML=groups;count.textContent=shown;rail.setAttribute('data-open',shown?'1':'0');document.body.classList.toggle('rail-open',shown>0);
  }
  function renderCards(data) {
    lastData=data||[];trackAndAnnounce(lastData);renderWaitSub(lastData);renderRail(lastData);var grid=document.getElementById('cards-grid');if(!grid)return;grid.innerHTML='';
    var sel=selectedIds();
    for(var i=0;i<lastData.length;i++){var dept=lastData[i],sections=dept.serving||[];if(sel.indexOf(String(dept.id))===-1)continue;
      if(dept.is_sectioned||dept.is_admission){
        var skey=secKeyForDept(dept.id,dept.name),sfilter=skey?secSaved(skey):null;
        if(sfilter!==null){var visible=[];for(var vi=0;vi<sections.length;vi++)if(sfilter.indexOf(sections[vi].section)!==-1)visible.push(sections[vi]);sections=visible;}
        if(!sections.length){if(sfilter!==null)continue;var empty=document.createElement('div');empty.className='dept-card is-idle';empty.innerHTML=topBarHtml(dept.server)+'<div class="dept-name">'+esc(dept.name)+'</div><div class="queue-number empty">-</div>'+footHtml(null,false);grid.appendChild(empty);continue;}
        for(var j=0;j<sections.length;j++){var s=sections[j],idle=!s.queue_number||s.queue_number==='-',card=document.createElement('div');card.className='dept-card '+(idle?'is-idle':'is-live');card.setAttribute('data-dept',dept.id);card.setAttribute('data-section',s.section);card.innerHTML=topBarHtml(s.staff||'')+'<div class="dept-name">'+esc(s.section)+'</div><div class="queue-number'+(idle?' empty':' qnum-live')+'">'+esc(s.queue_number||'-')+'</div>'+footHtml(idle?null:s.category,!idle);grid.appendChild(card);}continue;
      }
      var serving=sections.length?sections[0]:null,queue=serving?serving.queue_number:'-',idle2=!queue||queue==='-',normal=document.createElement('div');normal.className='dept-card '+(idle2?'is-idle':'is-live');normal.setAttribute('data-dept',dept.id);normal.innerHTML=topBarHtml(dept.server)+'<div class="dept-name">'+esc(dept.name)+'</div><div class="queue-number'+(idle2?' empty':' qnum-live')+'">'+esc(queue||'-')+'</div>'+footHtml(idle2?null:serving.category,!idle2);grid.appendChild(normal);
    }
    if(!grid.children.length)grid.innerHTML='<div class="empty-state">Open the sidebar and select departments to view serving queues.</div>';setGridCount(grid);requestAnimationFrame(fitCards);
  }
  function fetchServing() { var ids=selectedIds();if(!ids.length){renderCards([]);return;}var key='live:serving:'+ids.slice().sort().join(',');window.QueryCache.fetchQuery(key,URL+'?ids='+ids.join(','),{staleTime:1000}).then(renderCards).catch(function(e){console.error('[Live]',e);}); }
  function subscribeDepts() { if (_liveSocket) { _liveSocket.emit('subscribe', { depts: selectedIds(), page: 'live', label: document.title || 'Live Monitor' }); } }
  function initSidebar() {var sidebar=document.getElementById('sidebar'),toggle=document.getElementById('sidebar-toggle'),close=document.getElementById('sidebar-close'),main=document.getElementById('main-content');function hide(){sidebar.classList.add('hidden');toggle.classList.add('visible');main.classList.add('expanded');try{localStorage.setItem(SIDEBAR_KEY,'1');}catch(e){}}function show(){sidebar.classList.remove('hidden');toggle.classList.remove('visible');main.classList.remove('expanded');try{localStorage.removeItem(SIDEBAR_KEY);}catch(e){}}toggle.addEventListener('click',show);close.addEventListener('click',hide);if(document.documentElement.className.indexOf('sidebar-prehidden')!==-1||window.innerWidth<=768){document.documentElement.className=document.documentElement.className.replace(/\bsidebar-prehidden\b/,'');hide();}}
  function initControls() {var announceEl=document.getElementById('announce-toggle');if(announceEl){try{announceEl.checked=localStorage.getItem(ANNOUNCE_KEY)!=='0';}catch(e){}announceEl.addEventListener('change',function(){try{localStorage.setItem(ANNOUNCE_KEY,announceEl.checked?'1':'0');}catch(e){}if(!announceEl.checked&&'speechSynthesis' in window)window.speechSynthesis.cancel();});}var testBtn=document.getElementById('audio-test');if(testBtn){testBtn.addEventListener('click',function(){unlockAudio();announceParts(['sound_test'],'This is a test. Sound is working.');});}var saved=getJson(DEPT_KEY,[]),depts=document.querySelectorAll('.dept-checkbox');for(var i=0;i<depts.length;i++){if(saved.indexOf(depts[i].value)!==-1)depts[i].checked=true;depts[i].addEventListener('change',function(){setJson(DEPT_KEY,selectedIds());window.QueryCache.invalidate('live:serving:');updateStyles();renderCards(lastData);subscribeDepts();fetchServing();});}var secs=document.querySelectorAll('.sec-checkbox');for(var si=0;si<secs.length;si++){(function(el){var key=el.getAttribute('data-sec-key'),saved=secSaved(key);if(saved!==null)el.checked=saved.indexOf(el.value)!==-1;el.addEventListener('change',function(){setJson(key,selectedSecs(key));updateStyles();renderCards(lastData);});})(secs[si]);}document.addEventListener('change',function(ev){var el=ev.target;if(!el||!el.classList||!el.classList.contains('wait-checkbox'))return;var hidden=hiddenWaits(),id=el.value,index=hidden.indexOf(id);if(el.checked&&index!==-1)hidden.splice(index,1);if(!el.checked&&index===-1)hidden.push(id);setJson(WAIT_HIDDEN_KEY,hidden);renderCards(lastData);});updateStyles();}
  document.addEventListener('DOMContentLoaded',function(){initSidebar();initControls();fetchServing();if(window.io){var socket=window.io(window._QUEUE_SOCKET_HOST,{transports:['websocket']});_liveSocket=socket;function pollOn(on){if(on&&!pollTimer)pollTimer=setInterval(fetchServing,30000);if(!on&&pollTimer){clearInterval(pollTimer);pollTimer=null;}}setInterval(function(){if(_liveSocket&&_liveSocket.connected)subscribeDepts();},30000);socket.on('connect',function(){pollOn(false);fetchServing();subscribeDepts();});socket.on('disconnect',function(){pollOn(true);});socket.on('connect_error',function(){pollOn(true);});socket.on('queue-updated',function(payload){window.QueryCache.invalidate('live:serving:');fetchServing();announceServePayload(payload);});socket.on('repeat-call',function(payload){handleRepeatCall(payload);window.QueryCache.invalidate('live:serving:');fetchServing();});}else{pollTimer=setInterval(fetchServing,30000);}window.addEventListener('visibilitychange',function(){if(!document.hidden)fetchServing();});window.addEventListener('resize',function(){requestAnimationFrame(fitCards);});setTimeout(primeAudioBestEffort,600);});
  function oncePrime(ev){if(ev&&ev.isTrusted)unlockAudio();}
  function addPrime(type){var fn=function(e){oncePrime(e);document.removeEventListener(type,fn);};document.addEventListener(type,fn);}
  ['pointerdown','mousedown','touchstart','touchend','click','keydown','keyup'].forEach(addPrime);
})();
