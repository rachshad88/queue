<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Choose Waiting Section</title>
    @inlineCss('dist/assets/module-CdqakSoB.css')
    @inlineCss('css/rhu-uniform.css')
    <script type="module" src="/dist/assets/choose_section-D1tVJTnW.js"></script>
</head>
<body class="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-5">

    <main class="w-full flex flex-col items-center justify-center">
    <h2 class="text-center text-3xl sm:text-4xl font-bold text-primary-500 mb-8">Select Your Waiting Station</h2>

    <div class="max-w-2xl w-full">
        <form method="POST" class="mb-5 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm" action="choose_waiting_section.php">
            @csrf
            <button type="submit" name="for_customer" value="1" class="rounded-xl bg-primary-600 px-8 py-3 text-base font-semibold text-white transition hover:bg-primary-700 active:scale-[0.98]">
                For Customer (Limited View)
            </button>
        </form>

        <div class="flex flex-wrap justify-center gap-2">
            @php($myUserId = session('user_id'))
            @php($canOverride = ($myUserId !== null) && (int) session('department_id', 0) === (int) $canOverrideDept)
            @foreach ($sections as $row)
                @php($occupied = !empty($row->occupied_by))
                <div class="flex flex-col items-stretch gap-2">
                    <form method="POST" action="assign_waiting_section.php">
                        @csrf
                        <input type="hidden" name="section_id" value="{{ (int) $row->id }}">
                        <button type="submit"
                                @disabled($occupied)
                                class="min-w-[200px] rounded-xl border px-8 py-5 text-lg font-semibold transition {{ $occupied ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 hover:bg-gray-100' : 'cursor-pointer border-gray-200 bg-white text-gray-900 shadow-md hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]' }}">
                            {{ $row->section_name }}
                        </button>
                    </form>
                    @if ($occupied)
                        <p class="text-center text-xs text-slate-500">
                            Occupied by: {{ $row->occupant_name ?: ($row->username ?: ('User #' . (int) $row->occupied_by)) }}
                        </p>
                    @endif
                    @if ($occupied && $canOverride)
                        @php($isHolder = (int) $row->occupied_by === (int) $myUserId)
                        @php($confirmMsg = $isHolder
                            ? 'Override ' . $row->section_name . '? This station is already yours.'
                            : 'Override ' . $row->section_name . '? The current staff will be removed from this station.')
                        <form method="POST" action="assign_waiting_section.php"
                              onsubmit="return confirm('{{ htmlspecialchars($confirmMsg, ENT_QUOTES) }}');">
                            @csrf
                            <input type="hidden" name="section_id" value="{{ (int) $row->id }}">
                            <input type="hidden" name="override" value="1">
                            <button type="submit"
                                    class="min-w-[200px] rounded-xl border border-red-200 bg-red-50 px-8 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 active:scale-[0.98]">
                                {!! $isHolder ? 'Override &middot; Reclaim station' : 'Override &middot; Remove staff' !!}
                            </button>
                        </form>
                    @endif
                </div>
            @endforeach
        </div>
    </div>
    </main>
</body>
</html>