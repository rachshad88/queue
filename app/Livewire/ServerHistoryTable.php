<?php

namespace App\Livewire;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;
use Livewire\Attributes\Url;
use Livewire\Component;

/**
 * The "Queue List" serve log on server_history.php as a Livewire 3 component.
 *
 * The component owns the sortable, paginated table plus row selection. Filters
 * stay with the static GET form in the page: the controller passes their
 * (already Manila-today defaulted) values as mount props, sorting / page live
 * in the URL via #[Url], and selection is component state. CSV exports still
 * hit the controller's legacy endpoints (scope=page / scope=selected) so the
 * export contract is untouched.
 */
class ServerHistoryTable extends Component
{
    private const PAGE_SIZE = 20;

    /** Sort keys exposed to the UI, mapped to whitelisted ORDER BY expressions. */
    private const SORT_COLUMNS = [
        'num' => 'q.queue_number',
        'server' => 'server_name',
        'staff' => 'server_name',
        'department' => 'd.name',
        'category' => 'q.category',
        'status' => 'q.status',
        'datetime' => 'q.created_at',
        'id' => 'q.id',
    ];

    #[Url(as: 'sort')]
    public string $sortKey = '';

    #[Url(as: 'dir')]
    public string $sortDir = 'asc';

    #[Url]
    public string $page = '1';

    public string $department = '';

    public string $sid = '';

    public string $from = '';

    public string $to = '';

    public string $q = '';

    public int $goTo = 1;

    /** @var array<int, int> */
    public array $selected = [];

    public bool $selectAll = false;

    private bool $syncingSelection = false;

    /**
     * @param  string  $department  department filter passed by the controller
     * @param  string  $sid  server filter passed by the controller
     * @param  string  $from  from-date filter (already Manila-today defaulted)
     * @param  string  $to  to-date filter (already Manila-today defaulted)
     * @param  string  $q  queue-number search passed by the controller
     */
    public function mount(string $department = '', string $sid = '', string $from = '', string $to = '', string $q = ''): void
    {
        $this->department = $department;
        $this->sid = $sid;
        $this->from = $from;
        $this->to = $to;
        $this->q = $q;

        $querySort = trim((string) request()->query('sort', ''));
        if (array_key_exists($querySort, self::SORT_COLUMNS)) {
            $this->sortKey = $querySort;
        } else {
            $this->sortKey = '';
        }

        $queryDir = strtolower(trim((string) request()->query('dir', '')));
        $this->sortDir = $queryDir === 'desc' ? 'desc' : 'asc';

        $this->page = max(1, (int) request()->query('page', 1));
        $this->goTo = $this->page;
    }

    public function render()
    {
        $totalRecords = $this->totalRecords();
        $totalPages = max(1, (int) ceil($totalRecords / self::PAGE_SIZE));

        $this->page = (string) max(1, (int) $this->page);
        if ((int) $this->page > $totalPages) {
            $this->page = (string) $totalPages;
            $this->goTo = $this->page;
        }

        $records = $this->fetchPage();
        $pageIds = array_map(static fn ($row) => (int) $row->id, $records);
        $offset = ((int) $this->page - 1) * self::PAGE_SIZE;

        $this->selectAll = count($pageIds) > 0
            && count(array_intersect($this->selected, $pageIds)) === count($pageIds);

        $pgWindow = 5;
        $pgStart = max(1, min((int) $this->page - intdiv($pgWindow, 2), $totalPages - $pgWindow + 1));
        $pgEnd = min($totalPages, $pgStart + $pgWindow - 1);

        return view('livewire.server-history-table', [
            'records' => $records,
            'pageIds' => $pageIds,
            'totalRecords' => $totalRecords,
            'totalPages' => $totalPages,
            'shownFrom' => $totalRecords === 0 ? 0 : $offset + 1,
            'shownTo' => min($offset + self::PAGE_SIZE, $totalRecords),
            'prevPage' => (int) $this->page > 1 ? (int) $this->page - 1 : null,
            'nextPage' => (int) $this->page < $totalPages ? (int) $this->page + 1 : null,
            'pgStart' => $pgStart,
            'pgEnd' => $pgEnd,
            'exportAllUrl' => $this->exportUrl(),
            'exportPageUrl' => $this->exportUrl(scope: 'page'),
            'exportSelectedUrl' => $this->exportUrl(scope: 'selected'),
        ]);
    }

    public function hasActiveFilters(): bool
    {
        return ($this->department !== '' && $this->department !== 'all')
            || $this->sid !== ''
            || $this->from !== ''
            || $this->to !== ''
            || $this->q !== '';
    }

    public function sortBy(string $key): void
    {
        $this->ensureAuthenticated();

        if (! array_key_exists($key, self::SORT_COLUMNS)) {
            return;
        }

        if ($this->sortKey === $key) {
            $this->sortDir = $this->sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            $this->sortKey = $key;
            $this->sortDir = 'asc';
        }

        $this->page = 1;
        $this->goTo = 1;
    }

    public function gotoPage(int $page): void
    {
        $this->ensureAuthenticated();

        $this->page = (string) max(1, $page);
        $this->goTo = max(1, $page);
    }

    public function submitGoToPage(): void
    {
        $this->ensureAuthenticated();

        $this->gotoPage(max(1, (int) $this->goTo));
    }

    public function updatedSelected(mixed $value): void
    {
        if ($this->syncingSelection) {
            return;
        }

        $this->selected = $this->normalizeIds($value);
        $this->publishSelection();
    }

    public function updatedSelectAll(bool $value): void
    {
        if ($this->syncingSelection) {
            return;
        }

        $pageIds = $this->currentPageIds();

        if ($value) {
            $this->selected = array_slice(
                array_values(array_unique(array_merge($this->selected, $pageIds))),
                0,
                200
            );
        } else {
            $this->selected = array_values(array_diff($this->selected, $pageIds));
        }

        $this->publishSelection();
    }

    private function publishSelection(): void
    {
        $this->syncingSelection = true;

        $pageIds = $this->currentPageIds();
        $checked = count(array_intersect($this->selected, $pageIds));
        $this->selectAll = count($pageIds) > 0 && $checked === count($pageIds);

        $this->syncingSelection = false;

        $this->dispatch('sh-selection',
            total: count($this->selected),
            samePageChecked: $checked,
            samePageTotal: count($pageIds),
        );
    }

    /** @return array<int, int> */
    private function normalizeIds(mixed $value): array
    {
        $values = is_array($value) ? $value : [$value];
        $ids = array_values(array_unique(array_filter(
            array_map(static fn ($id) => (int) $id, $values),
            static fn (int $id) => $id > 0,
        )));

        return array_slice($ids, 0, 200);
    }

    private function ensureAuthenticated(): void
    {
        // The page route is gated by single.login; this is defense in depth so
        // /livewire/update (which does not pass that middleware) stays secure.
        if ((int) Session::get('user_id', 0) < 1) {
            $this->redirect('/login.php');
        }
    }

    private function orderByExpression(): string
    {
        if ($this->sortKey === '' || ! array_key_exists($this->sortKey, self::SORT_COLUMNS)) {
            return 'q.created_at DESC';
        }

        $dir = $this->sortDir === 'desc' ? 'DESC' : 'ASC';

        return self::SORT_COLUMNS[$this->sortKey].' '.$dir.', q.id DESC';
    }

    /** @return array{0: string, 1: array<int, mixed>} */
    private function buildWhere(): array
    {
        $conditions = [];
        $params = [];

        if ($this->department !== '' && $this->department !== 'all') {
            $conditions[] = 'd.id = ?';
            $params[] = $this->department;
        }
        if ($this->sid !== '') {
            $conditions[] = 'q.served_by = ?';
            $params[] = (int) $this->sid;
        }
        if ($this->q !== '') {
            $conditions[] = 'q.queue_number LIKE ?';
            $params[] = '%'.$this->q.'%';
        }
        if ($this->from !== '') {
            $conditions[] = 'CAST(q.created_at AS date) >= ?';
            $params[] = $this->from;
        }
        if ($this->to !== '') {
            $conditions[] = 'CAST(q.created_at AS date) <= ?';
            $params[] = $this->to;
        }

        return [
            count($conditions) > 0 ? ' AND '.implode(' AND ', $conditions) : '',
            $params,
        ];
    }

    private function totalRecords(): int
    {
        [$where, $params] = $this->buildWhere();

        $row = DB::selectOne(
            "SELECT COUNT(*) AS total FROM queue q
             JOIN departments d ON q.department_id = d.id
             LEFT JOIN users u ON q.served_by = u.user_id
             WHERE q.served_by IS NOT NULL{$where}",
            $params
        );

        return (int) ($row->total ?? 0);
    }

    /** @return array<int, object> */
    private function fetchPage(): array
    {
        [$where, $params] = $this->buildWhere();
        $params[] = (max(1, (int) $this->page) - 1) * self::PAGE_SIZE;

        return DB::select(
            "SELECT q.id, q.queue_number, q.status, q.category, q.created_at,
                    d.name AS department,
                    u.user_id AS server_id,
                    CONCAT(u.firstname, ' ', u.lastname) AS server_name
             FROM queue q
             JOIN departments d ON q.department_id = d.id
             LEFT JOIN users u ON q.served_by = u.user_id
             WHERE q.served_by IS NOT NULL{$where}
             ORDER BY {$this->orderByExpression()} OFFSET ? ROWS FETCH NEXT ".self::PAGE_SIZE.' ROWS ONLY',
            $params
        );
    }

    /** @return array<int, int> */
    private function currentPageIds(): array
    {
        return array_map(static fn ($row) => (int) $row->id, $this->fetchPage());
    }

    /** @return array<string, string> */
    private function filterQuery(): array
    {
        $query = array_filter([
            'department' => $this->department,
            'sid' => $this->sid,
            'from' => $this->from,
            'to' => $this->to,
            'q' => $this->q,
        ], static fn ($value) => $value !== '' && $value !== null);

        if ($this->sortKey !== '') {
            $query['sort'] = $this->sortKey;
            $query['dir'] = $this->sortDir;
        }

        return $query;
    }

    private function exportUrl(string $scope = 'all'): string
    {
        $query = $this->filterQuery();
        $query['export'] = 'csv';

        if ($scope === 'page') {
            $query['scope'] = 'page';
            $query['page'] = (string) max(1, (int) $this->page);
        } elseif ($scope === 'selected') {
            $query['scope'] = 'selected';
            $query['ids'] = implode(',', $this->selected);
        }

        return 'server_history.php?'.http_build_query($query);
    }
}
