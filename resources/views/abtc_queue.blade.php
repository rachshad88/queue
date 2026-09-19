<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ABTC Queue</title>
    <link rel="stylesheet" href="/dist/assets/module-CdqakSoB.css">
    <script type="module" src="/dist/assets/app-D1tVJTnW.js"></script>
    <link rel="stylesheet" href="/css/rhu-uniform.css?v=20260918e">
</head>
<body class="min-h-screen bg-gray-100 flex items-center justify-center p-5">
    @if ($isLoggedIn)
    <div id="sidebar-container"></div>
    @endif

    <div class="w-[360px]" role="main">
        <h2 class="mb-8 text-center text-3xl font-bold text-primary-500">ABTC Queue</h2>

        <div class="w-full max-w-[400px] rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <form method="POST" class="mb-3">
                @csrf
                <input type="hidden" name="category" value="regular">
                <button type="submit" name="take_ticket" value="1" class="w-full rounded-xl bg-primary-600 hover:bg-primary-700 px-8 py-3 text-base font-semibold text-white transition active:scale-[0.98]">
                    Take <span style="font-size:1.4em;" class="uppercase font-bold">Regular</span> Ticket
                </button>
            </form>

            <form method="POST">
                @csrf
                <input type="hidden" name="category" value="priority">
                <button type="submit" name="take_ticket" value="1" class="w-full rounded-xl bg-primary-600 hover:bg-primary-700 px-8 py-3 text-base font-semibold text-white transition active:scale-[0.98]" style="background:#16a34a;">
                    Take <span style="font-size:1.4em;" class="uppercase font-bold">Priority</span> Ticket
                </button>
            </form>
        </div>
    </div>

    @if ($isLoggedIn)
    <script src="/js/sidebar.js?v=20260917c" defer></script>
    @endif
</body>
</html>