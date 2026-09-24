<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Queue Ticket</title>
@inlineCss('dist/assets/module-CdqakSoB.css')
<style>
    @media print {
        @page { size: 70mm 74mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        body { display: block !important; }
        .ticket-preview-wrap { margin: 0; max-width: none; }
        .ticket { width: 70mm; margin: 0 auto; font-family: Arial, sans-serif; text-align: center; padding: 8px;
            border: 0; border-radius: 0; }
        .ticket-preview-badge, .ticket-preview-hint, button { display: none !important; }
    }
    /* Screen-only preview: the ticket sits directly on the page background
       (no enclosing card). Plain CSS for the frame; everything else prints. */
    .ticket-preview-wrap { width: 100%; max-width: 420px; margin: 0 auto 16px; padding: 0 12px;
        box-sizing: border-box; text-align: center; }
    .ticket-preview-badge { display: inline-block; margin: 0 0 12px; padding: 2px 10px; font-size: 11px;
        font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #0f766e;
        background: #ccfbf1; border-radius: 999px; }
    .ticket-preview-hint { margin: 10px 0 12px; font-size: 13px; color: #64748b; }
</style>
</head>
<body class="min-h-screen bg-gray-100 flex items-start justify-center">
  <!-- On-screen preview: badge, ticket and print helpers sit directly on the
       page background (no enclosing card). The only element the printer sees
       is .ticket, so screen and print can never drift apart. -->
  <main class="ticket-preview-wrap">
    <p class="ticket-preview-badge">Ticket preview</p>
    <div class="ticket w-[70mm] bg-white p-3 text-center" style="margin-left:auto;margin-right:auto">
      <h1 class="leading-none text-[64px] tracking-[1px] font-bold text-gray-900">{{ $queueNumber }}</h1>
      @if ($returnCode !== '')
        <p class="mt-0 mb-0 text-sm font-bold tracking-[1px] text-gray-800">Return code: {{ $returnCode }}</p>
        <small class="block text-gray-500">Keep this code. Show it if you return.</small>
      @endif
      <small class="block text-gray-500">Printed: {{ $printedAt }}</small>
    </div>
    <p class="ticket-preview-hint">Print with the button below &mdash; this screen returns automatically.</p>
    <button onclick="window.print()" class="mt-1 rounded-md bg-primary-500 px-4 py-2 text-white">Print Ticket</button>
  </main>

  <script>
    // Print the ticket, then return to the kiosk ONLY after the print
    // preview closes (afterprint). The old fixed 1s auto-back raced the
    // preview: it dismissed the dialog before staff could print, which read
    // as "no preview". The 6s fallback covers kiosks where no dialog fires
    // (silent-print policy, suppressed print()) so the page never traps.
    window.onload = () => {
      let returned = false;
      const goBack = () => {
        if (returned) return;
        returned = true;
        setTimeout(() => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.close();
          }
        }, 150);
      };
      window.addEventListener('afterprint', goBack);
      setTimeout(goBack, 6000);
      window.print();
    };
  </script>
  <script src="/js/noinspect.js?v=20260922a" defer></script>
</body>
</html>