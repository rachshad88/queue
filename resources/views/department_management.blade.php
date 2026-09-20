<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="{{ csrf_token() }}">
  <title>Department Management | RHU Queue</title>
  @inlineCss('dist/assets/module-CdqakSoB.css')
  @inlineCss('css/rhu-uniform.css')
  <script type="module" src="/dist/assets/app-D1tVJTnW.js"></script>
</head>
<body class="min-h-screen bg-gray-50">
  <div id="sidebar-container"></div>

  <main class="p-4 sm:p-6">
    <div class="mx-auto max-w-5xl">

      @if (request()->query('added'))
        <div class="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">Department added successfully!</div>
      @elseif (request()->query('edited'))
        <div class="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700">Department updated successfully!</div>
      @elseif (request()->query('error'))
        <div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">An error occurred. Please check your input and try again.</div>
      @endif

      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl sm:text-2xl font-bold text-slate-900">DEPARTMENT MANAGEMENT</h1>
        <button onclick="openAddModal()" class="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98]">
          Add Department
        </button>
      </div>

      <div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-primary-500 text-white">
                <th class="px-4 py-3 text-left font-semibold">Name</th>
                <th class="px-4 py-3 text-left font-semibold">Prefix</th>
                <th class="px-4 py-3 text-left font-semibold">Person In Charge</th>
                <th class="px-4 py-3 text-left font-semibold">Status</th>
                <th class="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @foreach ($departments as $i => $d)
                <tr class="{{ $i % 2 === 0 ? 'bg-white' : 'bg-gray-50' }}">
                  <td class="px-4 py-3 font-medium text-gray-800">{{ $d->name }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ $d->prefix }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ $d->server ?? '' }}</td>
                  <td class="px-4 py-3">
                    @php $deptStatus = strtolower((string) ($d->status ?? 'active')); @endphp
                    @if ($deptStatus === 'active')
                      <span class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Active</span>
                    @else
                      <span class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                    @endif
                  </td>
                  <td class="px-4 py-3 text-right">
                    <button class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 active:scale-[0.98] editDeptBtn"
                      data-id="{{ (int) $d->id }}"
                      data-name="{{ $d->name }}"
                      data-prefix="{{ $d->prefix }}"
                      data-server="{{ $d->server ?? '' }}"
                      data-status="{{ $d->status ?? 'active' }}">
                      Edit
                    </button>
                  </td>
                </tr>
              @endforeach
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <!-- Add Dept Modal -->
  <div id="addDeptModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
      <h3 class="text-lg font-bold text-gray-800">Add Department</h3>
      <form method="POST" class="mt-4 space-y-4">
        @csrf
        <input type="hidden" name="action" value="add">
        <div>
          <label for="add-name" class="mb-1 block text-sm font-medium text-gray-700">Department Name</label>
          <input type="text" id="add-name" name="name" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="add-prefix" class="mb-1 block text-sm font-medium text-gray-700">Prefix</label>
          <input type="text" id="add-prefix" name="prefix" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="add-server" class="mb-1 block text-sm font-medium text-gray-700">Person In Charge</label>
          <input type="text" id="add-server" name="server" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="add-status" class="mb-1 block text-sm font-medium text-gray-700">Status</label>
          <select id="add-status" name="status" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" onclick="closeModal('addDeptModal')" class="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200">Cancel</button>
          <button type="submit" class="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700">Add</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Edit Dept Modal -->
  <div id="editDeptModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
      <h3 class="text-lg font-bold text-gray-800">Edit Department</h3>
      <form method="POST" class="mt-4 space-y-4">
        @csrf
        <input type="hidden" name="action" value="edit">
        <input type="hidden" name="id" id="edit-dept-id">
        <div>
          <label for="edit-dept-name" class="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input type="text" id="edit-dept-name" name="name" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="edit-dept-prefix" class="mb-1 block text-sm font-medium text-gray-700">Prefix</label>
          <input type="text" id="edit-dept-prefix" name="prefix" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="edit-dept-server" class="mb-1 block text-sm font-medium text-gray-700">Person In Charge</label>
          <input type="text" id="edit-dept-server" name="server" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="edit-dept-status" class="mb-1 block text-sm font-medium text-gray-700">Status</label>
          <select id="edit-dept-status" name="status" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" onclick="closeModal('editDeptModal')" class="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200">Cancel</button>
          <button type="submit" class="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700">Update</button>
        </div>
      </form>
    </div>
  </div>

  <script src="/js/sidebar.js?v=20260917c" defer></script>
  <script>
  function openAddModal() {
    document.getElementById('addDeptModal').classList.remove('hidden');
    document.getElementById('addDeptModal').classList.add('flex');
    document.getElementById('add-name').focus();
  }
  function openEditModal(id, name, prefix, server, status) {
    document.getElementById('edit-dept-id').value = id;
    document.getElementById('edit-dept-name').value = name;
    document.getElementById('edit-dept-prefix').value = prefix;
    document.getElementById('edit-dept-server').value = server;
    document.getElementById('edit-dept-status').value = status || 'active';
    document.getElementById('editDeptModal').classList.remove('hidden');
    document.getElementById('editDeptModal').classList.add('flex');
    document.getElementById('edit-dept-name').focus();
  }
  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    document.getElementById(id).classList.remove('flex');
  }
  document.querySelectorAll('.editDeptBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      openEditModal(btn.dataset.id, btn.dataset.name, btn.dataset.prefix, btn.dataset.server, btn.dataset.status);
    });
  });
  </script>
</body>
</html>