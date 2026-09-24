<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Server History | RHU Queue</title>
    @inlineCss('css/datepicker.min.css')
    @inlineCss('dist/assets/module-CdqakSoB.css')
    @inlineCss('css/rhu-uniform.css')
    @inlineCss('css/controller-redesign.css')
    <style>
        /* ============ overview card (filters) ============ */
        /* Flex items default to min-width:auto (min-content floor); let the
           cards shrink to the viewport so nothing forces page width. */
        .qlayout > * { min-width: 0; }
        .sh-overview .sh-filters { margin-top: 0; padding: 20px 18px; }
        .sh-filter-head { padding: 20px 18px 0; }
        .sh-filter-icon { background: #e0e7ff; color: #4338ca; }
        .sh-chips { margin: 12px 18px 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
        .sh-chip {
            display: inline-flex; align-items: center; gap: 7px; padding: 5px 9px 5px 12px;
            border-radius: 999px; background: #eff6ff; border: 1px solid #bfdbfe;
            color: #1d4ed8; font-size: 12px; font-weight: 700; text-decoration: none; white-space: nowrap;
            transition: background .15s, border-color .15s;
        }
        .sh-chip:hover { background: #dbeafe; border-color: #93c5fd; }
        .sh-chip svg { width: 12px; height: 12px; flex: none; }
        .sh-chip:hover svg { color: #dc2626; }
        a.sh-chip:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(37,99,235,.45); }
        .sh-iconbtn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 40px; height: 40px; align-self: center; flex: none;
            background: #fff; border: 1px solid #d9e5f5; border-radius: 10px; color: #2563eb; cursor: pointer;
            box-shadow: 0 1px 2px rgba(15,42,77,.05);
            transition: background .15s, border-color .15s;
        }
        .sh-iconbtn:hover { background: #eff6ff; border-color: #93c5fd; }
        .sh-iconbtn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(37,99,235,.45); }
        .sh-iconbtn svg { width: 17px; height: 17px; }

        /* ============ filter card ============ */
        .sh-card { padding: 20px; }
        .sh-filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-top: 14px; }
        .sh-filters:first-child { margin-top: 0; }
        .sh-field { display: flex; flex-direction: column; gap: 6px; flex: 1 1 170px; min-width: 150px; }
        .sh-field-range { flex: 2 1 300px; min-width: min(320px, 100%); }
        .sh-field-search { flex: 2 1 220px; }
        .sh-actions { display: flex; gap: 8px; align-items: center; flex: none; }
        .sh-ctl { position: relative; }
        .sh-ctl-ic {
            position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
            width: 16px; height: 16px; color: #64748b; pointer-events: none;
        }
        body.page-controller .sh-filters .sh-select2,
        .sh-select2 {
            display: block; width: 100%; height: 40px; padding: 0 30px 0 34px; box-sizing: border-box;
            font-size: 12.5px; font-weight: 600; color: #0f1c2e; font-family: inherit;
            background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; outline: none;
            appearance: none; -webkit-appearance: none; color-scheme: light; cursor: pointer;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
            background-repeat: no-repeat; background-position: right 11px center;
            transition: border-color .15s;
        }
        body.page-controller .sh-filters .sh-select2 {
            background-color: #fff !important; border-color: #e2e8f0 !important; color: #0f1c2e !important;
        }
        body.page-controller .sh-filters .sh-select2 option { background-color: #fff !important; color: #0f1c2e !important; }
        .sh-select2:hover { border-color: #bfdbfe; }
        .sh-select2:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
        .sh-searchwrap { position: relative; }
        .sh-search-ic {
            position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
            width: 15px; height: 15px; color: #94a3b8; pointer-events: none;
        }
        body.page-controller .sh-filters .sh-searchinput,
        .sh-searchinput {
            display: block; width: 100%; height: 40px; padding: 0 34px 0 34px; box-sizing: border-box;
            font-size: 12.5px; color: #0f1c2e; font-family: inherit;
            background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; outline: none;
            color-scheme: light;
        }
        body.page-controller .sh-filters .sh-searchinput {
            background-color: #fff !important; border-color: #e2e8f0 !important; color: #0f1c2e !important;
        }
        .sh-searchinput:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
        .sh-searchinput::placeholder { color: #64748b; }
        .sh-clear {
            position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
            width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
            background: transparent; border: 0; border-radius: 50%; color: #94a3b8; cursor: pointer; padding: 0;
        }
        .sh-clear:hover { background: #f1f5f9; color: #475569; }
        .sh-clear[hidden] { display: none; }
        .sh-clear svg { width: 13px; height: 13px; }

        /* ============ date range (Flowbite shape, native inputs) ============ */
        .sh-datewrap { position: relative; }
        .sh-date-ic {
            position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
            width: 15px; height: 15px; color: #94a3b8; pointer-events: none;
        }
        .sh-range { display: flex; align-items: center; gap: 10px; }
        .sh-range .sh-datewrap { flex: 1 1 0; min-width: 0; }
        .sh-range .sh-date { min-width: 0; }
        .sh-range-sep { flex: none; font-size: 12.5px; font-weight: 700; color: #64748b; }
        body.page-controller .sh-filters .sh-date,
        .sh-date {
            display: block; width: 100%; height: 40px; padding: 0 12px 0 34px; box-sizing: border-box;
            font-size: 12.5px; font-weight: 600; color: #0f1c2e;
            background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; outline: none; font-family: inherit;
            color-scheme: light; transition: border-color .15s;
        }
        body.page-controller .sh-filters .sh-date {
            background-color: #fff !important; border-color: #e2e8f0 !important; color: #0f1c2e !important;
        }
        .sh-date:hover { border-color: #bfdbfe; }
        .sh-date:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
        /* Flowbite range-picker popup: force the light controller theme. */
        body.page-controller .datepicker-dropdown { z-index: 400; }
        body.page-controller .datepicker-picker {
            background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
            box-shadow: 0 12px 28px rgba(15,42,77,.18); color: #0f1c2e; font-family: inherit;
        }
        body.page-controller .datepicker-picker .datepicker-title { background: transparent; color: #0f1c2e; }
        body.page-controller .datepicker-picker .datepicker-controls button { background-color: #fff; color: #475569; }
        body.page-controller .datepicker-picker .datepicker-controls button:hover { background-color: #eff6ff; color: #1d4ed8; }
        body.page-controller .datepicker-picker .datepicker-controls button svg { color: #000; }
        body.page-controller .datepicker-picker .dow { color: #64748b; }
        body.page-controller .datepicker-picker .datepicker-cell:not(.selected):not(.range-start):not(.range-end):not(.range):not(.prev):not(.next):not(.disabled) { color: #0f1c2e; background-color: transparent; }
        body.page-controller .datepicker-picker .datepicker-cell:hover { background-color: #eff6ff; }
        body.page-controller .datepicker-picker .datepicker-cell.prev,
        body.page-controller .datepicker-picker .datepicker-cell.next,
        body.page-controller .datepicker-picker .datepicker-cell.disabled { color: #cbd5e1; }
        body.page-controller .datepicker-picker .datepicker-cell.selected,
        body.page-controller .datepicker-picker .datepicker-cell.range-start,
        body.page-controller .datepicker-picker .datepicker-cell.range-end { background-color: #1d4ed8; color: #fff; }
        body.page-controller .datepicker-picker .datepicker-cell.range { background-color: #dbeafe; color: #1d4ed8; }
        body.page-controller .datepicker-picker .datepicker-cell.today:not(.selected) { box-shadow: inset 0 0 0 1px #93c5fd; }
        body.page-controller .datepicker-picker .today-btn { background-color: #1d4ed8; color: #fff; }
        body.page-controller .datepicker-picker .clear-btn { background-color: #fff; color: #475569; border-color: #e2e8f0; }
        body.page-controller .datepicker-picker .today-btn,
        body.page-controller .datepicker-picker .clear-btn { width: 50%; }

        /* ============ queue list toolbar ============ */
        .sh-list-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .sh-list-id { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .sh-list-icon {
            width: 36px; height: 36px; flex: none; display: flex; align-items: center; justify-content: center;
            border-radius: 10px; background: #dbeafe; color: #2563eb;
        }
        .sh-list-icon svg { width: 18px; height: 18px; }
        .sh-list-title { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: -.01em; color: #0f1c2e; }
        .sh-range-pill {
            display: inline-block; padding: 3px 12px; border-radius: 999px;
            background: #eff6ff; color: #2563eb; font-size: 12px; font-weight: 700; white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }
        .sh-list-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .sh-menu { position: relative; display: inline-block; }
        .sh-menulist {
            position: absolute; top: calc(100% + 6px); right: 0; min-width: 210px; margin: 0; padding: 6px;
            background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
            box-shadow: 0 12px 28px rgba(15,42,77,.18); z-index: 300; list-style: none;
        }
        body.page-controller .sh-menulist { background: #fff !important; border-color: #e2e8f0 !important; }
        .sh-menulist[hidden] { display: none; }
        .sh-menuitem {
            display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 10px; box-sizing: border-box;
            font-size: 12.5px; font-weight: 600; font-family: inherit; text-align: left; text-decoration: none;
            color: #0f1c2e; background: transparent; border: 0; border-radius: 7px; cursor: pointer;
        }
        body.page-controller .sh-menulist .sh-menuitem { color: #0f1c2e !important; }
        .sh-menuitem:hover { background: #eff6ff; color: #1d4ed8; }
        body.page-controller .sh-menulist .sh-menuitem:hover { background: #eff6ff !important; color: #1d4ed8 !important; }
        .sh-menuitem svg { width: 15px; height: 15px; flex: none; color: #64748b; }
        .sh-menuitem:hover svg { color: #1d4ed8; }
        .sh-menuitem:disabled { opacity: .45; cursor: not-allowed; }
        .sh-menuitem:disabled:hover { background: transparent; color: #0f1c2e; }
        .sh-menuitem:disabled:hover svg { color: #64748b; }
        body.page-controller .sh-menulist .sh-menuitem:disabled { color: #0f1c2e !important; }
        body.page-controller .sh-menulist .sh-menuitem:disabled:hover { background: transparent !important; color: #0f1c2e !important; }
        body.page-controller .sh-menulist .sh-menuitem:disabled:hover svg { color: #64748b !important; }
        body.page-controller .sh-menulist .sh-menuitem svg { color: #64748b !important; }
        body.page-controller .sh-menulist .sh-menuitem:hover svg { color: #1d4ed8 !important; }

        /* ============ serve table (Livewire) ============
           The queue list is built entirely with Tailwind utilities; these
           neutralizers drop the legacy controller-table baseline so the
           utilities govern padding / typography / layout on this table only. */
        body.page-controller .sh-card .ctrl-tablewrap { margin-top: 16px; }
        body.page-controller .controller-table.sh-table th,
        body.page-controller .controller-table.sh-table td {
            padding: 0; border: 0; background: transparent;
            font-size: inherit; font-weight: 400; letter-spacing: normal;
            text-transform: none; color: inherit; text-align: inherit;
        }
        body.page-controller .controller-table.sh-table tbody tr:nth-child(even) td,
        body.page-controller .controller-table.sh-table tbody tr:nth-child(even) th { background: transparent; }
        body.page-controller .controller-table.sh-table tbody tr:hover td,
        body.page-controller .controller-table.sh-table tbody tr:hover th { background: transparent; }
        body.page-controller .controller-table.sh-table tbody tr.sh-selected td,
        body.page-controller .controller-table.sh-table tbody tr.sh-selected th { background-color: #eff6ff; }

        /* Sticky header band: opaque steel-navy so scrolled rows never ghost
           through it, plus a hairline base. Row separators restore the scan
           lines while the Tailwind utilities keep cell padding/typography. */
        body.page-controller .controller-table.sh-table thead tr {
            background: linear-gradient(180deg, #1a3a6b, #143063);
            border-bottom: 0.5px solid rgba(127, 180, 238, .32);
        }
        body.page-controller .controller-table.sh-table thead th { border-bottom: 0; }
        body.page-controller .controller-table.sh-table tbody td { border-bottom: 1px solid #eef2f7; }
        body.page-controller .controller-table.sh-table tbody tr:last-child td { border-bottom: 0; }

        /* rhu-uniform paints every h2/label in the light navy palette for the
           dark page; this card is white, so its own heading/label text must be
           dark again. (Unlayered <style> beats the rhu layer regardless of
           specificity.) */
        body.page-controller section[aria-label="Queue list"] h2 { color: #1e293b; }
        body.page-controller section[aria-label="Queue list"] label { color: #475569; }

        /* ============ details modal ============ */
        .sh-modal { position: fixed; inset: 0; z-index: 500; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(15,23,42,.5); }
        .sh-modal[hidden] { display: none; }
        .sh-modal-card { width: 100%; max-width: 440px; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 24px 60px rgba(15,42,77,.25); padding: 22px; }
        .sh-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
        .sh-modal-head h2 { margin: 0; font-size: 16px; font-weight: 800; color: #0f1c2e; }
        .sh-modal-x {
            display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
            background: transparent; border: 0; border-radius: 8px; color: #64748b; cursor: pointer;
        }
        .sh-modal-x:hover { background: #f1f5f9; color: #0f1c2e; }
        .sh-modal-x svg { width: 15px; height: 15px; }
        .sh-modal-grid { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
        .sh-modal-grid > div { min-width: 0; }
        .sh-modal-grid dt { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
        .sh-modal-grid dd { margin: 0; font-size: 13.5px; font-weight: 600; color: #0f1c2e; overflow-wrap: anywhere; }

        @media (max-width: 1023px) {
            /* The fixed hamburger (#show-sidebar, 44px at 12,12) floats over
               content on small screens — reserve room so it never covers the
               page. Page-scoped; other pages keep their own offset. */
            body.page-controller main.ctrl-main { padding-top: 64px; }
        }
        @media (max-width: 720px) {
            .sh-field, .sh-field-range, .sh-field-search { flex: 1 1 100%; min-width: 0; }
            .sh-actions { width: 100%; }
            .sh-actions .ctrl-btn { flex: 1; }
            .sh-chip { padding: 9px 12px 9px 14px; }
        }
    </style>
</head>
<body class="page-controller min-h-screen">
    <x-hospital-background />
    <div id="sidebar-container"></div>

    <main class="ctrl-main">
        <div class="ctrl-wrap">
            <div class="qlayout">

                <h1 class="sr-only">Server History</h1>

                <section class="qcard sh-overview" aria-label="Queue overview and filters">
                    <div class="sh-list-head sh-filter-head">
                        <div class="sh-list-id">
                            <span class="sh-list-icon sh-filter-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16l-6 8v6l-4 2v-8L4 4Z"/></svg></span>
                            <h2 class="sh-list-title">Filters</h2>
                            @if (count($activeFilters) > 0)
                                <span class="sh-range-pill">{{ count($activeFilters) }} active</span>
                            @endif
                        </div>
                    </div>
                    @if (count($activeFilters) > 0)
                        <ul class="sh-chips" aria-label="Active filters">
                            @foreach ($activeFilters as $chip)
                                <li>
                                    <a class="sh-chip" href="{{ $chip['removeUrl'] }}" aria-label="Remove filter {{ $chip['label'] }}">
                                        <span>{{ $chip['label'] }}</span>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                    </a>
                                </li>
                            @endforeach
                        </ul>
                    @endif
                    <form method="get" action="">
                        <input type="hidden" name="sort" value="{{ $sortKey }}">
                        <input type="hidden" name="dir" value="{{ $sortDir }}">
                        <div class="sh-filters">
                            <div class="sh-field">
                                <label class="ctrl-label" for="f-department">Department</label>
                                <div class="sh-ctl">
                                    <svg class="sh-ctl-ic" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2"/></svg>
                                    <select name="department" id="f-department" class="sh-select2">
                                        <option value="all">All Departments</option>
                                        @foreach ($departments as $dept)
                                            <option value="{{ $dept->id }}" @selected($selectedDept !== '' && $selectedDept !== 'all' && (string) $selectedDept === (string) $dept->id)>
                                                {{ $dept->name }}
                                            </option>
                                        @endforeach
                                    </select>
                                </div>
                            </div>
                            <div class="sh-field">
                                <label class="ctrl-label" for="f-sid">Server / Staff</label>
                                <div class="sh-ctl">
                                    <svg class="sh-ctl-ic" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                    <select name="sid" id="f-sid" class="sh-select2">
                                        <option value="">All Servers</option>
                                        @foreach ($serverOptions as $srv)
                                            <option value="{{ (int) $srv->server_id }}" @selected($selectedSid !== '' && (string) $selectedSid === (string) $srv->server_id)>
                                                {{ $srv->server_name }}
                                            </option>
                                        @endforeach
                                    </select>
                                </div>
                            </div>
                            <div class="sh-field sh-field-range">
                                <span class="ctrl-label" id="sh-range-label">Date Range</span>
                                <div class="sh-range" role="group" aria-labelledby="sh-range-label" id="sh-range-picker" date-rangepicker>
                                    <div class="sh-datewrap">
                                        <svg class="sh-date-ic" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Zm3-7h.01v.01H8V13Zm4 0h.01v.01H12V13Zm4 0h.01v.01H16V13Zm-8 4h.01v.01H8V17Zm4 0h.01v.01H12V17Zm4 0h.01v.01H16V17Z"/></svg>
                                        <input type="text" name="from" id="from" value="{{ $fromDate }}" class="sh-date" aria-label="From date" placeholder="Select date start" autocomplete="off">
                                    </div>
                                    <span class="sh-range-sep">to</span>
                                    <div class="sh-datewrap">
                                        <svg class="sh-date-ic" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Zm3-7h.01v.01H8V13Zm4 0h.01v.01H12V13Zm4 0h.01v.01H16V13Zm-8 4h.01v.01H8V17Zm4 0h.01v.01H12V17Zm4 0h.01v.01H16V17Z"/></svg>
                                        <input type="text" name="to" id="to" value="{{ $toDate }}" class="sh-date" aria-label="To date" placeholder="Select date end" autocomplete="off">
                                    </div>
                                </div>
                            </div>
                            <div class="sh-field sh-field-search">
                                <label class="ctrl-label" for="q">Queue #</label>
                                <div class="sh-searchwrap">
                                    <svg class="sh-search-ic" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="m21 21-3.5-3.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"/></svg>
                                    <input type="text" name="q" id="q" placeholder="e.g. R-012" value="{{ $queueSearch }}" class="sh-searchinput" autocomplete="off">
                                    <button type="button" id="sh-clearq" class="sh-clear" aria-label="Clear queue search" @if ($queueSearch === '') hidden @endif><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
                                </div>
                            </div>
                            <div class="sh-actions">
                                <button type="submit" class="ctrl-btn ctrl-btn-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m21 21-3.5-3.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"/></svg>Search</button>
                                <a href="server_history.php" class="ctrl-btn ctrl-btn-outline"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>Reset</a>
                            </div>
                        </div>
                    </form>
                </section>

                <livewire:server-history-table
                    :department="$selectedDept"
                    :sid="$selectedSid"
                    :from="$fromDate"
                    :to="$toDate"
                    :q="$queueSearch"
                />

            </div>
        </div>
    </main>

    <div class="sh-modal" id="sh-modal" hidden>
        <div class="sh-modal-card" role="dialog" aria-modal="true" aria-labelledby="sh-modal-title">
            <div class="sh-modal-head">
                <h2 id="sh-modal-title">Serve record</h2>
                <button type="button" class="sh-modal-x" data-modal-close aria-label="Close dialog"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
            <dl class="sh-modal-grid">
                <div><dt>Queue #</dt><dd id="m-qnum"></dd></div>
                <div><dt>Status</dt><dd id="m-status"></dd></div>
                <div><dt>Server / Staff</dt><dd id="m-server"></dd></div>
                <div><dt>Department</dt><dd id="m-dept"></dd></div>
                <div><dt>Category</dt><dd id="m-cat"></dd></div>
                <div><dt>Date/Time</dt><dd id="m-dt"></dd></div>
            </dl>
        </div>
    </div>

    <script src="/js/datepicker-full.min.js?v=20260923a"></script>
    <script>
    /* Queue Management interactions: dropdown menus, details modal, row
       selection, search clear, refresh, and the Flowbite date-range picker. */
    (function () {
        'use strict';

        function closeMenus() {
            document.querySelectorAll('[data-sh-menu]').forEach(function (box) {
                var list = box.querySelector('[data-sh-menu-list]');
                var btn = box.querySelector('[data-sh-menu-btn]');
                if (list) {
                    list.hidden = true;
                }
                if (btn) {
                    btn.setAttribute('aria-expanded', 'false');
                }
            });
        }
        document.addEventListener('click', function (e) {
            var menuBtn = e.target.closest('[data-sh-menu-btn]');
            if (menuBtn) {
                var box = menuBtn.closest('[data-sh-menu]');
                var list = box ? box.querySelector('[data-sh-menu-list]') : null;
                var opening = list ? list.hidden : false;
                closeMenus();
                if (list) {
                    list.hidden = !opening;
                    box.querySelector('[data-sh-menu-btn]').setAttribute('aria-expanded', opening ? 'true' : 'false');
                }
                e.stopPropagation();
                return;
            }
            if (e.target.closest('[data-sh-menu]')) {
                return;
            }
            closeMenus();
        });

        var modal = document.getElementById('sh-modal');
        var modalReturnFocus = null;
        function closeModal() {
            if (!modal) {
                return;
            }
            modal.hidden = true;
            if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') {
                modalReturnFocus.focus();
            }
            modalReturnFocus = null;
        }
        document.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-sh-view]');
            if (!btn || !modal) {
                return;
            }
            var set = function (id, val) {
                var el = document.getElementById(id);
                if (el) {
                    el.textContent = val;
                }
            };
            set('m-qnum', btn.getAttribute('data-qnum') || '');
            set('m-server', btn.getAttribute('data-server') || '');
            set('m-dept', btn.getAttribute('data-dept') || '');
            set('m-cat', btn.getAttribute('data-cat') || '');
            set('m-status', btn.getAttribute('data-status') || '');
            set('m-dt', btn.getAttribute('data-dt') || '');
            closeMenus();
            var menuBox = btn.closest('[data-sh-menu]');
            modalReturnFocus = menuBox ? menuBox.querySelector('[data-sh-menu-btn]') : null;
            modal.hidden = false;
            var x = modal.querySelector('[data-modal-close]');
            if (x) {
                x.focus();
            }
        });
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) {
                    closeModal();
                }
            });
            modal.querySelectorAll('[data-modal-close]').forEach(function (btn) {
                btn.addEventListener('click', closeModal);
            });
            modal.addEventListener('keydown', function (e) {
                if (e.key !== 'Tab') {
                    return;
                }
                var focusables = modal.querySelectorAll(
                    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                if (focusables.length === 0) {
                    return;
                }
                var first = focusables[0];
                var last = focusables[focusables.length - 1];
                var active = document.activeElement;
                if (e.shiftKey) {
                    if (active === first || active === modal) {
                        e.preventDefault();
                        last.focus();
                    }
                } else if (active === last || active === modal) {
                    e.preventDefault();
                    first.focus();
                }
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeMenus();
                closeModal();
            }
        });

        var checkAll = document.getElementById('sh-checkall');
        document.addEventListener('sh-selection', function (e) {
            checkAll = document.getElementById('sh-checkall');
            if (!checkAll) {
                return;
            }
            var sameChecked = e.detail && e.detail.samePageChecked
                ? e.detail.samePageChecked
                : 0;
            var sameTotal = e.detail && e.detail.samePageTotal
                ? e.detail.samePageTotal
                : 0;
            if (sameTotal > 0 && sameChecked === sameTotal) {
                checkAll.checked = true;
                checkAll.indeterminate = false;
            } else if (sameTotal > 0 && sameChecked > 0) {
                checkAll.checked = false;
                checkAll.indeterminate = true;
            } else {
                checkAll.checked = false;
                checkAll.indeterminate = false;
            }
        });

        var qInput = document.getElementById('q');
        var qClear = document.getElementById('sh-clearq');
        if (qInput && qClear) {
            qInput.addEventListener('input', function () {
                qClear.hidden = qInput.value === '';
            });
            qClear.addEventListener('click', function () {
                qInput.value = '';
                qClear.hidden = true;
                qInput.focus();
            });
        }

        document.addEventListener('click', function (e) {
            if (e.target.closest('.sh-refresh')) {
                window.location.reload();
            }
        });

        /* Date range picker (vendored Flowbite datepicker, offline): calendar
           popups writing yyyy-mm-dd into From/To. Typed garbage is cleared on
           submit so the server never receives an unparsable date. */
        var rangeEl = document.getElementById('sh-range-picker');
        if (rangeEl && typeof window.DateRangePicker === 'function') {
            new window.DateRangePicker(rangeEl, { format: 'yyyy-mm-dd', autohide: true, weekStart: 1 });
            var rangeForm = rangeEl.closest('form');
            if (rangeForm) {
                rangeForm.addEventListener('submit', function () {
                    rangeEl.querySelectorAll('input').forEach(function (inp) {
                        if (inp.value !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(inp.value)) {
                            inp.value = '';
                        }
                    });
                });
            }
        }
    })();
    </script>
    <script src="/js/sidebar.js?v=20260923a" defer></script>
  <script src="/js/noinspect.js?v=20260922a" defer></script>
    @include('partials.frontend', ['livewire' => true])
</body>
</html>
