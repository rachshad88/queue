<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Served Queues Report | RHU Queue</title>
    <link rel="stylesheet" href="/dist/assets/module-CdqakSoB.css">
    <script type="module" src="/dist/assets/app-D1tVJTnW.js"></script>
    <link rel="stylesheet" href="/css/rhu-uniform.css?v=20260918e">
</head>
<body class="min-h-screen bg-gray-50">
    <div id="sidebar-container"></div>

    <main class="p-4 sm:p-6">
        <div class="mx-auto max-w-5xl">
            <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-xl sm:text-2xl font-bold text-slate-900">SERVED QUEUES REPORT</h1>

                <form method="get" action="">
                    <label for="type" class="text-sm font-medium text-gray-500">Report Type:</label>
                    <select name="type" id="type" onchange="this.form.submit()"
                            class="ml-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="daily" @selected($type === 'daily')>Daily</option>
                        <option value="weekly" @selected($type === 'weekly')>Weekly</option>
                        <option value="monthly" @selected($type === 'monthly')>Monthly</option>
                    </select>
                </form>
            </div>

            <div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="bg-primary-500 text-white">
                                @if ($type === 'monthly')
                                    <th class="px-5 py-3 text-left font-semibold">Year</th>
                                    <th class="px-5 py-3 text-left font-semibold">Month</th>
                                @else
                                    <th class="px-5 py-3 text-left font-semibold">{{ $type === 'daily' ? 'Date' : 'Week' }}</th>
                                @endif
                                <th class="px-5 py-3 text-left font-semibold">Total Queues Done</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            @forelse ($data as $i => $row)
                                <tr class="{{ ($i % 2 === 0) ? 'bg-gray-50' : 'bg-white' }}">
                                    @if ($type === 'daily')
                                        <td class="px-5 py-3 text-gray-700">{{ \Illuminate\Support\Carbon::parse((string) $row->period)->format('Y-m-d') }}</td>
                                    @elseif ($type === 'weekly')
                                        @php
                                            $start = Carbon\Carbon::parse((string) $row->week_start);
                                            $end = Carbon\Carbon::parse((string) $row->week_end);
                                            $label = $start->format('M j').' - '.$end->format('M j, Y');
                                        @endphp
                                        <td class="px-5 py-3 text-gray-700">{{ $label }}</td>
                                    @else
                                        <td class="px-5 py-3 text-gray-700">{{ $row->year }}</td>
                                        <td class="px-5 py-3 text-gray-700">{{ \Carbon\Carbon::createFromFormat('!m', (string) $row->month)->format('F') }}</td>
                                    @endif

                                    <td class="px-5 py-3 font-semibold text-primary-600">{{ $row->total }}</td>
                                </tr>
                            @empty
                                <tr>
                                    <td colspan="{{ $type === 'monthly' ? 3 : 2 }}" class="px-5 py-8 text-center text-gray-500">
                                        No served queues found.
                                    </td>
                                </tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </main>

    <script src="/js/sidebar.js?v=20260917c" defer></script>
</body>
</html>