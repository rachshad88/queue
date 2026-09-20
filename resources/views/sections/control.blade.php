<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="{{ csrf_token() }}">
  <title>Section Control | RHU Queue</title>
  @inlineCss('dist/assets/module-CdqakSoB.css')
  @inlineCss('css/rhu-uniform.css')
  <script type="module" src="/dist/assets/app-D1tVJTnW.js"></script>
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

    <div class="mb-5">
      <h2 class="mb-3 text-base font-semibold text-slate-800">Admission Windows</h2>
      @php($typeLabel = 'Admission Windows')
      @include('sections._control_table', ['rows' => $admission, 'typeLabel' => $typeLabel, 'type' => 'admission'])
    </div>

    <div class="mb-5">
      <h2 class="mb-3 text-base font-semibold text-slate-800">Waiting Area Windows</h2>
      @include('sections._control_table', ['rows' => $waiting, 'typeLabel' => 'Waiting Area Windows', 'type' => 'waiting'])
    </div>
  </div>
</main>

<script src="/js/sidebar.js?v=20260917c" defer></script>
<script>
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button.release-btn');
  if (!btn) return;

  const name = btn.getAttribute('data-name');
  if (!confirm('Force logout staff from "' + name + '"? The station will become free immediately.')) return;

  btn.disabled = true;
  btn.textContent = 'Releasing...';
  const body = new URLSearchParams();
  body.set('type', btn.getAttribute('data-type'));
  body.set('section_id', btn.getAttribute('data-id'));
  const cm = document.querySelector('meta[name="csrf-token"]');
  if (cm && cm.content) body.set('csrf_token', cm.content);

  try {
    const resp = await fetch('release_section.php', { method: 'POST', body });
    const result = await resp.json();
    if (result.success) {
      location.reload();
    } else {
      alert(result.message || 'Failed to release section.');
      btn.disabled = false;
      btn.textContent = 'Logout';
    }
  } catch (err) {
    console.error(err);
    alert('Error while releasing section.');
    btn.disabled = false;
    btn.textContent = 'Logout';
  }
});
</script>
</body>
</html>