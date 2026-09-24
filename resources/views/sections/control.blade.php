<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="{{ csrf_token() }}">
  <title>Section Control | RHU Queue</title>
  @inlineCss('dist/assets/module-CdqakSoB.css')
  @inlineCss('css/rhu-uniform.css')
</head>
<body class="min-h-screen bg-gray-50">
<div id="sidebar-container"></div>

<main class="p-4 sm:p-6">
  <div class="mx-auto max-w-4xl">
    <h1 class="mb-1 text-xl sm:text-2xl font-bold text-slate-900">SECTION CONTROL</h1>

    <div class="mb-5 flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800">
      <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      <span>Superadmin &middot; Force logout staff from admission / waiting area stations.</span>
    </div>

    <livewire:sections-control />
  </div>
</main>

<script src="/js/sidebar.js?v=20260923a" defer></script>
@include('partials.frontend', ['livewire' => true])
  <script src="/js/noinspect.js?v=20260922a" defer></script>
</body>
</html>