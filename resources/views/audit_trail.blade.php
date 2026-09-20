<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Audit Trail - Queue</title>
    @inlineCss('dist/assets/module-CdqakSoB.css')
    @inlineCss('css/audit.css')
    <script type="module" src="/dist/assets/app-D1tVJTnW.js"></script>
    <style>
        .controls { margin: 12px 0; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .controls input[type="text"] { padding:6px 8px; min-width:220px; }
        .controls button { padding:6px 10px; cursor:pointer; }
    </style>
</head>
<body>
    <div id="sidebar-container"></div>
    <div id="header">
        <h2>Audit Trail - Queue</h2>
    </div>

    <form method="get" action="">
        <label for="department">Select Department: </label>
        <select name="department" id="department" onchange="this.form.submit()">
            <option value="">-- Choose Department --</option>
            <option value="all" {{ $selectedDept === 'all' ? 'selected' : '' }}>All Departments</option>
            @foreach ($departments as $dept)
                <option value="{{ $dept->id }}" {{ (string) $selectedDept === (string) $dept->id ? 'selected' : '' }}>
                    {{ $dept->name }}
                </option>
            @endforeach
        </select>

        <div class="controls">
            <label for="search">Search queue number:</label>
            <input type="text" name="search" id="search" placeholder="e.g. AB9X" value="{{ $search }}" />
            <button type="submit" class="btn btn-primary" title="Search" name="sb" id="sb">Search</button>
            <button type="button" class="btn btn-outline" title="Clear search" onclick="document.getElementById('search').value=''; this.form.submit();">Reset</button>
        </div>
    </form>

    @if ($hasFilter)
        @if (count($queueData) > 0)
            <table>
                <thead>
                    <tr>
                        <th>Queue Code</th>
                        <th>Action</th>
                        <th>Operator</th>
                        <th>Date/Time</th>
                        <th>Department</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach ($queueData as $row)
                        <tr>
                            <td>{{ $row->full_queue_number }}</td>
                            <td>{{ $row->action ?? '' }}</td>
                            <td>{{ $row->operator ?? '' }}</td>
                            <td>{{ ! empty($row->created_at) ? \Carbon\Carbon::parse((string) $row->created_at)->format('Y-m-d H:i:s') : '' }}</td>
                            <td>{{ $row->department }}</td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        @else
            <p style="margin-top:30px;color:#888;">No records found for the selected filters.</p>
        @endif
    @else
        <p style="margin-top:30px;color:#888;">Please select a department or enter a queue number to view the audit trail.</p>
    @endif
</body>
<script src="/js/sidebar.js?v=20260917c" defer></script>
</html>