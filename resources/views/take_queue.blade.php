<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ticket Issuance Disabled</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/dist/assets/module-CdqakSoB.css">
  <script type="module" src="/dist/assets/app-D1tVJTnW.js"></script>
  <link rel="stylesheet" href="/css/rhu-uniform.css?v=20260918e">
</head>
<body class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
  @if ($isLoggedIn)
  <div id="sidebar-container"></div>
  @endif

  <div class="w-[380px] rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm" role="main">
    <h1 class="mb-4 text-xl font-bold text-slate-900">Ticket Issuance Moved</h1>
    <p class="mb-5 text-sm text-slate-600">Tickets are now issued only from the Waiting Area or ABTC queue pages.</p>
    <div class="flex flex-col gap-2.5">
      <a href="waiting_queue.php" class="btn block w-full rounded-xl bg-primary-600 py-3 text-[15px] font-semibold text-white">Waiting Area Queue</a>
      <a href="abtc_queue.php" class="btn block w-full rounded-xl bg-primary-600 py-3 text-[15px] font-semibold text-white">ABTC Queue</a>
    </div>
  </div>

</body>
@if ($isLoggedIn)
<script src="/js/sidebar.js?v=20260917c" defer></script>
@endif
</html>