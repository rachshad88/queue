<section
    class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    aria-label="Queue list">

    {{-- Card header -------------------------------------------------------- --}}
    <div class="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap items-center gap-2.5">
            <span class="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-blue-100 text-blue-600" aria-hidden="true">
                <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>
            </span>
            <h2 class="m-0 text-[15px] font-extrabold tracking-tight text-slate-900">Queue List</h2>
            <span class="inline-flex items-center rounded-full bg-blue-50 px-3 py-0.5 text-xs font-bold tabular-nums text-blue-700">
                @if ($totalRecords === 0)
                    0 entries
                @else
                    {{ $shownFrom }} - {{ $shownTo }} of {{ $totalRecords }} entries
                @endif
            </span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <div class="relative inline-block" data-sh-menu>
                <button type="button" data-sh-menu-btn aria-haspopup="menu" aria-expanded="false" aria-label="Export options"
                        class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1">
                    <svg class="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                    Export
                    <svg class="h-3 w-3 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <ul class="sh-menulist" data-sh-menu-list hidden role="menu" aria-label="Export options">
                    <li><a class="sh-menuitem" role="menuitem" href="{{ $exportAllUrl }}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>All filtered rows (CSV)</a></li>
                    <li><a class="sh-menuitem" role="menuitem" href="{{ $exportPageUrl }}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>This page only (CSV)</a></li>
                    <li @if (count($selected) === 0) class="opacity-45" @endif>
                        <a class="sh-menuitem" role="menuitem" href="{{ $exportSelectedUrl }}"
                           @if (count($selected) === 0) aria-disabled="true" tabindex="-1" @endif>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>Selected rows ({{ count($selected) }}, CSV)</a>
                    </li>
                </ul>
            </div>
            <button type="button" class="sh-refresh inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1" aria-label="Refresh queue list">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            </button>
        </div>
    </div>

    {{-- Selection toolbar (only when rows are checked) --------------------- --}}
    @if (count($selected) > 0)
        <div class="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50/70 px-5 py-2.5">
            <span class="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-bold text-white">{{ count($selected) }} selected</span>
            <a href="{{ $exportSelectedUrl }}" class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-600 bg-white px-3 text-xs font-bold text-blue-700 transition-colors hover:border-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                Export selected
            </a>
            <span class="text-xs font-medium text-blue-900">Selection persists across pages.</span>
        </div>
    @endif

    {{-- Table -------------------------------------------------------------- --}}
    <div class="ctrl-tablewrap">
        <table class="controller-table sh-table min-w-[1100px]">
            <caption class="sr-only">Serve log.</caption>
            <thead>
                <tr>
                    <th scope="col" class="px-4 py-3">
                        <input wire:model.live="selectAll" id="sh-checkall" type="checkbox"
                               class="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                               aria-label="Select all rows on this page">
                    </th>
                    @php
                        $sortMeta = [
                            'num' => 'Queue #',
                            'server' => 'Server / Staff',
                            'department' => 'Department',
                            'category' => 'Category',
                            'status' => 'Status',
                            'datetime' => 'Date/Time',
                        ];
                    @endphp
                    @foreach ($sortMeta as $key => $label)
                        <th scope="col"
                            @if ($sortKey === $key) aria-sort="{{ $sortDir === 'asc' ? 'ascending' : 'descending' }}" @endif
                            class="px-4 py-3">
                            <button type="button" wire:click="sortBy('{{ $key }}')"
                                    class="group inline-flex items-center gap-1 rounded text-xs font-semibold uppercase tracking-wider {{ $sortKey === $key ? 'text-blue-600' : 'text-slate-500' }} hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                {{ $label }}
                                @if ($sortKey === $key)
                                    @if ($sortDir === 'asc')
                                        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>
                                    @else
                                        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                                    @endif
                                @else
                                    <svg class="h-3 w-3 text-slate-400 group-hover:text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></svg>
                                @endif
                            </button>
                        </th>
                    @endforeach
                    <th scope="col" class="px-4 py-3"><span class="sr-only">Actions</span></th>
                </tr>
            </thead>

            <tbody wire:loading.remove wire:target="sortBy,gotoPage,submitGoToPage">
                @forelse ($records as $row)
                    @php
                        $rowDt = \Carbon\Carbon::parse((string) $row->created_at);
                        $isSelected = in_array((int) $row->id, $this->selected, true);
                        $nameParts = preg_split('/\s+/', trim((string) $row->server_name));
                        $initials = strtoupper(collect(array_slice($nameParts ?: [], 0, 2))
                            ->map(static fn ($p) => mb_substr((string) $p, 0, 1))
                            ->join(''));
                        $avatarTone = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700'][ord(mb_substr((string) $row->server_name, 0, 1)) % 5];
                        $cellClass = 'px-4 py-3 transition-colors hover:bg-slate-50'.($isSelected ? ' bg-blue-50/60' : '');
                    @endphp
                    <tr wire:key="queue-{{ $row->id }}">
                        <td class="{{ $cellClass }}">
                            <input wire:model.live="selected" value="{{ (int) $row->id }}" type="checkbox"
                                   class="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                   aria-label="Select {{ $row->queue_number }}">
                        </td>
                        <td role="rowheader" class="{{ $cellClass }}">
                            <span class="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 font-mono text-xs font-bold tracking-wide text-blue-700">{{ $row->queue_number }}</span>
                        </td>
                        <td class="{{ $cellClass }}">
                            <div class="flex items-center gap-2.5">
                                <span class="flex h-8 w-8 flex-none items-center justify-center rounded-full {{ $initials !== '' ? $avatarTone : 'bg-slate-100 text-slate-400' }}" @if ($initials === '') aria-hidden="true" @endif>
                                    @if ($initials !== '')
                                        <span class="text-[11px] font-bold">{{ $initials }}</span>
                                    @else
                                        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                    @endif
                                </span>
                                <div class="min-w-0 leading-tight">
                                    <div class="truncate text-[13px] font-medium text-slate-800">{{ $row->server_name ?? 'Unassigned' }}</div>
                                    <div class="text-[11px] text-slate-400">Staff{{ $row->server_id ? ' #'.$row->server_id : '' }}</div>
                                </div>
                            </div>
                        </td>
                        <td class="{{ $cellClass }}">
                            <div class="flex items-center gap-1.5 text-[13px] font-medium text-slate-600">
                                <svg class="h-3.5 w-3.5 flex-none text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2"/></svg>
                                {{ $row->department }}
                            </div>
                        </td>
                        <td class="{{ $cellClass }}">
                            <span class="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{{ ucfirst((string) $row->category) }}</span>
                        </td>
                        <td class="{{ $cellClass }}"><x-status-badge :status="$row->status" /></td>
                        <td class="{{ $cellClass }}">
                            <div class="whitespace-nowrap text-[13px] font-medium tabular-nums text-slate-700">{{ $rowDt->format('M j, Y') }}</div>
                            <div class="whitespace-nowrap text-xs tabular-nums text-slate-400">{{ $rowDt->format('g:i A') }}</div>
                        </td>
                        <td class="{{ $cellClass }}">
                            <div class="flex justify-end">
                                <div class="relative inline-block" data-sh-menu>
                                    <button type="button" data-sh-menu-btn aria-haspopup="menu" aria-expanded="false"
                                            aria-label="Row actions for {{ $row->queue_number }}"
                                            class="flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
                                    </button>
                                    <div class="sh-menulist" data-sh-menu-list hidden role="menu">
                                        <button type="button" class="sh-menuitem" role="menuitem" data-sh-view
                                                data-qnum="{{ $row->queue_number }}"
                                                data-server="{{ $row->server_name ?? '' }}"
                                                data-dept="{{ $row->department }}"
                                                data-cat="{{ $row->category }}"
                                                data-status="{{ $row->status }}"
                                                data-dt="{{ $rowDt->format('Y-m-d H:i:s') }}">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>View details
                                        </button>
                                        <a class="sh-menuitem" role="menuitem" href="queue_logs.php?q={{ urlencode((string) $row->queue_number) }}">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6v6h4.5"/><circle cx="12" cy="12" r="9"/></svg>View history
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="8" class="px-4 py-10 text-center">
                            <div class="mx-auto max-w-sm">
                                <span class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                                </span>
                                @if ($this->hasActiveFilters())
                                    <p class="text-sm font-medium text-slate-600">No serve records found for the current filters.</p>
                                    <a href="server_history.php" class="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                        Clear filters
                                    </a>
                                @else
                                    <p class="text-sm font-medium text-slate-600">No serve records found.</p>
                                @endif
                            </div>
                        </td>
                    </tr>
                @endforelse
            </tbody>

            {{-- Skeleton rows shown only while sorting / paging ----------- --}}
            <tbody wire:loading wire:target="sortBy,gotoPage,submitGoToPage">
                @for ($i = 0; $i < 5; $i++)
                    <tr wire:key="skeleton-{{ $i }}">
                        <td class="px-4 py-3"><div class="h-4 w-4 animate-pulse rounded bg-slate-200"></div></td>
                        <td class="px-4 py-3"><div class="h-4 w-20 animate-pulse rounded bg-slate-100"></div></td>
                        <td class="px-4 py-3"><div class="flex items-center gap-2.5"><div class="h-8 w-8 animate-pulse rounded-full bg-slate-100"></div><div class="h-4 w-32 animate-pulse rounded bg-slate-100"></div></div></td>
                        <td class="px-4 py-3"><div class="h-4 w-28 animate-pulse rounded bg-slate-100"></div></td>
                        <td class="px-4 py-3"><div class="h-4 w-16 animate-pulse rounded bg-slate-100"></div></td>
                        <td class="px-4 py-3"><div class="h-4 w-24 animate-pulse rounded bg-slate-100"></div></td>
                        <td class="px-4 py-3"><div class="h-4 w-28 animate-pulse rounded bg-slate-100"></div></td>
                        <td class="px-4 py-3"><div class="h-4 w-8 animate-pulse rounded bg-slate-100"></div></td>
                    </tr>
                @endfor
            </tbody>
        </table>
    </div>

    {{-- Pagination ---------------------------------------------------------- --}}
    <div class="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <span class="text-[13px] text-slate-500">
            @if ($totalRecords === 0)
                No serve records found.
            @else
                Showing <strong class="font-semibold text-slate-900">{{ $shownFrom }}</strong> to <strong class="font-semibold text-slate-900">{{ $shownTo }}</strong> of <strong class="font-semibold text-slate-900">{{ $totalRecords }}</strong> entries
            @endif
        </span>

        <div class="flex flex-wrap items-center gap-3">
            <nav aria-label="Serve log pages">
                <ul class="flex items-center gap-1">
                    @if ($prevPage !== null)
                        <li>
                            <button type="button" wire:click="gotoPage({{ $prevPage }})" aria-label="Previous page"
                                    class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                <span class="sr-only">Previous</span>
                                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 19-7-7 7-7"/></svg>
                            </button>
                        </li>
                    @else
                        <li><span class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-100 text-slate-300" aria-hidden="true"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 19-7-7 7-7"/></svg></span></li>
                    @endif

                    @if ($pgStart > 2)
                        <li>
                            <button type="button" wire:click="gotoPage(1)" aria-label="Go to page 1"
                                    class="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">1</button>
                        </li>
                        <li aria-hidden="true"><span class="flex h-9 min-w-4 items-center justify-center text-slate-400">&hellip;</span></li>
                    @elseif ($pgStart === 2)
                        <li>
                            <button type="button" wire:click="gotoPage(1)" aria-label="Go to page 1"
                                    class="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">1</button>
                        </li>
                    @endif

                    @for ($pgNum = $pgStart; $pgNum <= $pgEnd; $pgNum++)
                        <li>
                            @if ($pgNum === (int) $page)
                                <span aria-current="page" class="flex h-9 min-w-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-[13px] font-semibold text-white">{{ $pgNum }}</span>
                            @else
                                <button type="button" wire:click="gotoPage({{ $pgNum }})" aria-label="Go to page {{ $pgNum }}"
                                        class="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{{ $pgNum }}</button>
                            @endif
                        </li>
                    @endfor

                    @if ($pgEnd < $totalPages - 1)
                        <li aria-hidden="true"><span class="flex h-9 min-w-4 items-center justify-center text-slate-400">&hellip;</span></li>
                        <li>
                            <button type="button" wire:click="gotoPage({{ $totalPages }})" aria-label="Go to page {{ $totalPages }}"
                                    class="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{{ $totalPages }}</button>
                        </li>
                    @elseif ($pgEnd === $totalPages - 1)
                        <li>
                            <button type="button" wire:click="gotoPage({{ $totalPages }})" aria-label="Go to page {{ $totalPages }}"
                                    class="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{{ $totalPages }}</button>
                        </li>
                    @endif

                    @if ($nextPage !== null)
                        <li>
                            <button type="button" wire:click="gotoPage({{ $nextPage }})" aria-label="Next page"
                                    class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                <span class="sr-only">Next</span>
                                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
                            </button>
                        </li>
                    @else
                        <li><span class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-100 text-slate-300" aria-hidden="true"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg></span></li>
                    @endif
                </ul>
            </nav>

            <form wire:submit="submitGoToPage" class="flex items-center gap-2">
                <label for="sh-goto" class="hidden text-[13px] font-medium text-slate-500 sm:inline">Go to</label>
                <input wire:model="goTo" type="number" id="sh-goto" min="1" max="{{ $totalPages }}" value="{{ $goTo }}"
                       class="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center text-[13px] font-medium text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <button type="submit"
                        class="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Go</button>
                <span class="text-[13px] font-medium text-slate-500">of {{ $totalPages }}</span>
            </form>
        </div>
    </div>
</section>