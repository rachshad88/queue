<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Queue Logs | RHU Queue</title>
    @inlineCss('dist/assets/module-CdqakSoB.css')
    @inlineCss('css/rhu-uniform.css')
    <style>
        .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
        .filters label { display: block; font-size: .8rem; color: #64748b; margin-bottom: 2px; }
        .filters input, .filters select {
            padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px;
            font-size: .9rem; background: #fff; min-width: 150px;
        }
        .pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
        .pagination .page-input {
            width: 72px; padding: 6px 8px; border: 1px solid #1e3a8a; border-radius: 8px;
            font-size: .9rem; font-weight: 600; text-align: center; background: #1e3a8a; color: #fff;
        }
        .pagination .page-input::-webkit-outer-spin-button,
        .pagination .page-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .pagination .page-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(30,58,138,.35); }
        .status-badge { display: inline-block; border-radius: 9999px; padding: 2px 8px; font-size: .7rem; font-weight: 600; }
        .st-done { background: #d1fae5; color: #047857; }
        .st-serving { background: #e0f2fe; color: #0369a1; }
        .st-waiting { background: #f1f5f9; color: #475569; }
        .st-hold { background: #fef3c7; color: #b45309; }
        .st-null { background: #e2e8f0; color: #64748b; }
    </style>
</head>
<body class="min-h-screen bg-gray-50">
    <div id="sidebar-container"></div>

    <main class="p-4 sm:p-6">
        <div class="mx-auto max-w-6xl">
            <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-xl sm:text-2xl font-bold text-slate-900">QUEUE LOGS</h1>
                <a href="queue_logs.php" class="text-sm text-sky-600 hover:underline">&laquo; Reset filters</a>
            </div>

            <form method="get" action="" class="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div class="filters">
                    <div>
                        <label for="department">Department</label>
                        <select name="department" id="department">
                            <option value="all">All Departments</option>
                            @foreach ($departments as $dept)
                                <option value="{{ $dept->id }}" @selected($selectedDept !== '' && $selectedDept !== 'all' && (string) $selectedDept === (string) $dept->id)>
                                    {{ $dept->name }}
                                </option>
                            @endforeach
                        </select>
                    </div>
                    <div>
                        <label for="action">Action</label>
                        <select name="action" id="action">
                            <option value="">All Actions</option>
                            @foreach ($actions as $action)
                                <option value="{{ $action }}" @selected($selectedAction !== '' && $selectedAction === $action)>
                                    {{ $action }}
                                </option>
                            @endforeach
                        </select>
                    </div>
                    <div>
                        <label for="uid">Operator</label>
                        <select name="uid" id="uid">
                            <option value="">All Operators</option>
                            @foreach ($operators as $o)
                                <option value="{{ (int) $o->uid }}" @selected($selectedUid !== '' && (string) $selectedUid === (string) $o->uid)>
                                    {{ $o->nm }}
                                </option>
                            @endforeach
                        </select>
                    </div>
                    <div>
                        <label for="from">From</label>
                        <input type="date" name="from" id="from" value="{{ $fromDate }}">
                    </div>
                    <div>
                        <label for="to">To</label>
                        <input type="date" name="to" id="to" value="{{ $toDate }}">
                    </div>
                    <div>
                        <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700">Filter</button>
                    </div>
                    <div style="margin-left:auto; display:flex; align-items:flex-end; gap:8px;">
                        <div>
                            <label for="q">Queue #</label>
                            <input type="text" name="q" id="q" placeholder="e.g. R-012" value="{{ $queueSearch }}">
                        </div>
                        <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700">Search</button>
                    </div>
                </div>
            </form>

            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Audit Log</h2>
            <div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="bg-slate-800 text-white">
                                <th class="px-5 py-3 text-left font-semibold">Queue #</th>
                                <th class="px-5 py-3 text-left font-semibold">Action</th>
                                <th class="px-5 py-3 text-left font-semibold">Status Change</th>
                                <th class="px-5 py-3 text-left font-semibold">Department</th>
                                <th class="px-5 py-3 text-left font-semibold">Operator</th>
                                <th class="px-5 py-3 text-left font-semibold">Client IP</th>
                                <th class="px-5 py-3 text-left font-semibold">Date/Time</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            @forelse ($records as $i => $row)
                                @php
                                    $old = trim((string) ($row->old_status ?? ''));
                                    $new = trim((string) ($row->new_status ?? ''));
                                    $transitions = [];
                                    if ($old !== '') $transitions[] = ['label' => $old, 'cls' => 'st-'.strtolower($old)];
                                    if ($new !== '') $transitions[] = ['label' => $new, 'cls' => 'st-'.strtolower($new)];
                                @endphp
                                <tr class="{{ ($i % 2 === 0) ? 'bg-white' : 'bg-gray-50' }}">
                                    <td class="px-5 py-3 font-semibold text-slate-800">{{ $row->queue_number }}</td>
                                    <td class="px-5 py-3 text-gray-700">{{ $row->action }}</td>
                                    <td class="px-5 py-3 text-gray-700">
                                        @if (count($transitions) > 0)
                                            @foreach ($transitions as $j => $t)
                                                @if ($j > 0)<span class="mx-1 text-gray-400">&rarr;</span>@endif
                                                <span class="status-badge {{ $t['cls'] }}">{{ $t['label'] }}</span>
                                            @endforeach
                                        @else
                                            <span class="status-badge st-null">-</span>
                                        @endif
                                    </td>
                                    <td class="px-5 py-3 text-gray-700">{{ $row->department }}</td>
                                    <td class="px-5 py-3 text-gray-700">{{ trim((string) ($row->operator_name ?? '')) !== '' ? $row->operator_name : ($row->username ?? '') }}</td>
                                    <td class="px-5 py-3 font-mono text-xs text-gray-500">{{ $row->client_ip ?? '' }}</td>
                                    <td class="px-5 py-3 text-gray-700">{{ \Carbon\Carbon::parse((string) $row->created_at)->format('Y-m-d H:i:s') }}</td>
                                </tr>
                            @empty
                                <tr>
                                    <td colspan="7" class="px-5 py-8 text-center text-gray-500">No log records found.</td>
                                </tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="pagination mt-4">
                <span class="text-sm text-slate-500">
                    @if ($totalRecords === 0)
                        No log records found.
                    @else
                        Showing {{ $shownFrom }}&ndash;{{ $shownTo }} of {{ $totalRecords }}
                    @endif
                </span>
                <div class="flex flex-wrap items-center gap-2">
                    @if ($prevHref !== null)
                        <a href="{{ $prevHref }}" class="text-sm text-sky-600 hover:underline">&laquo; Prev</a>
                    @endif
                    <form method="get" action="queue_logs.php" class="flex items-center gap-2">
                        <input type="hidden" name="department" value="{{ $selectedDept }}">
                        <input type="hidden" name="action" value="{{ $selectedAction }}">
                        <input type="hidden" name="uid" value="{{ $selectedUid }}">
                        <input type="hidden" name="q" value="{{ $queueSearch }}">
                        <input type="hidden" name="from" value="{{ $fromDate }}">
                        <input type="hidden" name="to" value="{{ $toDate }}">
                        <input type="number" name="page" min="1" max="{{ $totalPages }}" value="{{ $page }}" class="page-input">
                        <button type="submit" class="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700">Go</button>
                        <span class="text-sm text-slate-500">of {{ $totalPages }}</span>
                    </form>
                    @if ($nextHref !== null)
                        <a href="{{ $nextHref }}" class="text-sm text-sky-600 hover:underline">Next &raquo;</a>
                    @endif
                </div>
            </div>
        </div>
    </main>

    <script src="/js/sidebar.js?v=20260923a" defer></script>
  <script src="/js/noinspect.js?v=20260922a" defer></script>
</body>
</html>