<!DOCTYPE html>
<html lang="en">
<head>
  <script>try{if(localStorage.getItem('live_sidebar_collapsed')==='1')document.documentElement.className+=' sidebar-prehidden';}catch(e){}</script>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Live Queue Monitor</title>
  @inlineCss('dist/assets/module-CdqakSoB.css')
  @inlineCss('css/fontawesome/css/all.min.css')
  @inlineCss('css/rhu-uniform.css')
  <style>
    #audio-hint{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:999;background:rgba(0,0,0,.78);color:#fff;padding:8px 18px;border-radius:999px;font-size:14px;letter-spacing:.02em;box-shadow:0 2px 10px rgba(0,0,0,.4);cursor:pointer;pointer-events:none}
    #audio-hint.audio-hint-hidden{display:none}
    #audio-hint i{margin-right:7px}
    .audio-test-btn{flex:none;margin-left:8px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);color:#fff;border-radius:6px;width:26px;height:26px;line-height:1;font-size:12px;cursor:pointer}
    .audio-test-btn:focus{outline:2px solid #fff}
  </style>
</head>
<body class="page-live">
  <button class="sidebar-toggle" id="sidebar-toggle" title="Show departments"><i class="fa-solid fa-bars"></i></button>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header"><h3><i class="fa-solid fa-building"></i> Departments</h3><button class="sidebar-close" id="sidebar-close" title="Close"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="sidebar-depts">
      @foreach ($departments as $dept)
        @php
          $isAdmission = stripos((string) $dept->name, 'admission') !== false;
          $isWaiting = stripos((string) $dept->name, 'waiting') !== false;
        @endphp
        <label class="dept-option" data-dept-id="{{ (int) $dept->id }}"><input class="dept-checkbox" type="checkbox" value="{{ (int) $dept->id }}" checked><span class="dept-label">{{ $dept->name }}</span></label>
        @if ($isAdmission || $isWaiting)
          <div class="adm-sub-block">
            <div class="dept-sub-group"><div class="dept-sub-head">Windows</div><div class="dept-sub" id="{{ $isAdmission ? 'admission-sec-sub' : 'waiting-sec-sub' }}">
              @foreach ($isAdmission ? $admissionSections : $waitingSections as $section)
                <label class="dept-option dept-sub-option"><input class="sec-checkbox" type="checkbox" data-sec-key="{{ $isAdmission ? 'live_adm_sections' : 'live_wait_sections' }}" value="{{ $section->section_name }}" checked><span class="dept-label">{{ $section->section_name }}</span></label>
              @endforeach
            </div></div>
            @if ($isAdmission)
            <div class="dept-sub-group"><div class="dept-sub-head">Waiting List</div><div class="dept-sub" id="admission-wait-sub" data-empty="1"></div></div>
            @endif
          </div>
        @endif
      @endforeach
    </div>
    <div class="sidebar-footer">
      <label class="announce-row"><input type="checkbox" id="announce-toggle" checked><span class="announce-label"><i class="fa-solid fa-volume-high"></i> Voice announcements</span><button type="button" id="audio-test" class="audio-test-btn" title="Test sound"><i class="fa-solid fa-volume-up"></i></button></label>
    </div>
  </aside>
  <main class="main-content" id="main-content"><header class="page-header"><h1>Live Queue Monitor</h1></header><div class="cards-grid" id="cards-grid"><div class="empty-state">Open the sidebar to adjust which departments are shown.</div></div><div class="footer">RHU Queue System | Live Monitor</div></main>
  <aside id="wait-rail" data-open="0"><div class="wait-rail-head"><h4>Waiting List</h4><span id="wait-rail-count">0</span></div><div id="wait-rail-list"></div></aside>
  <div id="audio-hint" title="Tap or press OK once so the browser will play call sounds"><i class="fa-solid fa-volume-high"></i>Press OK / tap to enable sound</div>
  <script>window._QUEUE_SOCKET_HOST=window.location.origin;</script>
  @php
    $reverbLiveHost = config('reverb.apps.apps.0.options.host');
    $reverbLiveConfig = [
        'key' => config('reverb.apps.apps.0.key'),
        'host' => in_array($reverbLiveHost, ['localhost', '127.0.0.1', null], true) ? null : $reverbLiveHost,
        'port' => (int) config('reverb.apps.apps.0.options.port', 8080),
        'scheme' => config('reverb.apps.apps.0.options.scheme', 'http'),
        'deptId' => null,
        'csrfToken' => csrf_token(),
    ];
  @endphp
  <script>
    window._REVERB = @json($reverbLiveConfig);
  </script>
  <script src="/js/pusher.min.js" defer></script>
  <script src="/js/echo.iife.js" defer></script>
  <script src="/js/reverb.js?v=20260922a" defer></script>
  <script src="/js/socket.io.min.js"></script><script src="/js/query-cache.js?v=20260910a"></script><script src="/js/voice-parts.js?v=20260910a"></script><script src="/js/tts-fallback.js?v=20260910a"></script><script src="/js/live.js?v=20260930a" defer></script>
  <script src="/js/noinspect.js?v=20260922a" defer></script>
</body>
</html>