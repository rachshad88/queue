<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Queue Ticket</title>
<script type="module" src="/dist/assets/app-D1tVJTnW.js"></script>
@inlineCss('dist/assets/module-CdqakSoB.css')
<style>
    @media print {
        @page { size: 70mm 74mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        body { display: block !important; }
        .ticket { width: 70mm; margin: 0 auto; font-family: Arial, sans-serif; text-align: center; padding: 8px; }
        button { display: none !important; }
    }
</style>
</head>
<body class="min-h-screen bg-gray-100 flex items-start justify-center">
  <div class="ticket w-[70mm] bg-white p-3 text-center">
    <h1 class="leading-none text-[64px] tracking-[1px] font-bold text-gray-900">{{ $queueNumber }}</h1>
    @if ($returnCode !== '')
      <p class="mt-0 mb-0 text-sm font-bold tracking-[1px] text-gray-800">Return code: {{ $returnCode }}</p>
      <small class="block text-gray-500">Keep this code. Show it if you return.</small>
    @endif
    <small class="block text-gray-500">Printed: {{ $printedAt }}</small>
    <button onclick="window.print()" class="mt-1 rounded-md bg-primary-500 px-4 py-2 text-white">Print Ticket</button>
  </div>

  <script>
    window.onload = () => {
      window.print();
      setTimeout(() => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.close();
        }
      }, 1000);
    };
  </script>
</body>
</html>