<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="{{ csrf_token() }}">
  <title>User Management | RHU Queue</title>
  @inlineCss('dist/assets/module-CdqakSoB.css')
  @inlineCss('css/rhu-uniform.css')
</head>
<body class="min-h-screen bg-gray-50">
<div id="sidebar-container"></div>

<main class="p-4 sm:p-6">
  <div class="mx-auto max-w-6xl">

    @if (request()->query('success'))
      <div class="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">User added successfully! Default password is <strong>12345</strong>.</div>
    @elseif (request()->query('edited'))
      <div class="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700">User updated successfully!</div>
    @elseif (request()->query('error'))
      <div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">An error occurred. Please check your input and try again.</div>
    @endif

    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl sm:text-2xl font-bold text-slate-900">USER MANAGEMENT</h1>
      @if ($isAdmin)
        <button onclick="openModal('addUserModal')" class="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98]">
          Add User
        </button>
      @endif
    </div>

    <div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-primary-500 text-white">
              <th class="px-4 py-3 text-left font-semibold">Username</th>
              <th class="px-4 py-3 text-left font-semibold">Usertype</th>
              <th class="px-4 py-3 text-left font-semibold">Name</th>
              <th class="px-4 py-3 text-left font-semibold">Position</th>
              <th class="px-4 py-3 text-left font-semibold">Department</th>
              <th class="px-4 py-3 text-left font-semibold">Status</th>
              <th class="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            @foreach ($users as $i => $row)
              @php $status = (string) ($row->status ?? 'active'); @endphp
              <tr class="{{ $i % 2 === 0 ? 'bg-white' : 'bg-gray-50' }}">
                <td class="px-4 py-3 font-medium text-gray-800">{{ $row->username }}</td>
                <td class="px-4 py-3 text-gray-600">{{ $row->usertype }}</td>
                <td class="px-4 py-3 text-gray-600">{{ $row->firstname . ' ' . (!empty($row->middlename) ? $row->middlename.' ' : '') . $row->lastname }}</td>
                <td class="px-4 py-3 text-gray-600">{{ $row->position }}</td>
                <td class="px-4 py-3 text-gray-600">{{ $row->department_name ?? 'N/A' }}</td>
                <td class="px-4 py-3">
                  @if ($status === 'active')
                    <span class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Active</span>
                  @else
                    <span class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                  @endif
                </td>
                <td class="px-4 py-3 text-right">
                  <button class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 active:scale-[0.98] editBtn"
                    data-id="{{ (int) $row->user_id }}"
                    data-username="{{ $row->username }}"
                    data-usertype="{{ $row->usertype }}"
                    data-firstname="{{ $row->firstname }}"
                    data-middlename="{{ $row->middlename }}"
                    data-lastname="{{ $row->lastname }}"
                    data-position="{{ $row->position }}"
                    data-department="{{ $row->department_id }}"
                    data-status="{{ $row->status }}">
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

@if ($isAdmin)
<!-- Add User Modal -->
<div id="addUserModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4">
  <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-sm">
    <h3 class="text-lg font-bold text-gray-800">Add User</h3>
    <form method="POST" class="mt-4">
      @csrf
      <input type="hidden" name="action" value="add">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label for="add-firstname" class="mb-1 block text-sm font-medium text-gray-700">Firstname</label>
          <input type="text" id="add-firstname" name="firstname" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="add-middlename" class="mb-1 block text-sm font-medium text-gray-700">Middlename</label>
          <input type="text" id="add-middlename" name="middlename" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="add-lastname" class="mb-1 block text-sm font-medium text-gray-700">Lastname</label>
          <input type="text" id="add-lastname" name="lastname" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="add-position" class="mb-1 block text-sm font-medium text-gray-700">Position</label>
          <input type="text" id="add-position" name="position" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="add-department" class="mb-1 block text-sm font-medium text-gray-700">Department</label>
          <select id="add-department" name="department" required class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Select Department</option>
            @foreach ($departments as $dept)
              <option value="{{ (int) $dept->id }}">{{ $dept->name }}</option>
            @endforeach
          </select>
        </div>
        <div>
          <label for="add-username" class="mb-1 block text-sm font-medium text-gray-700">Username</label>
          <input type="text" id="add-username" name="username" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div class="sm:col-span-2">
          <label for="add-usertype" class="mb-1 block text-sm font-medium text-gray-700">Usertype</label>
          <select id="add-usertype" name="usertype" required class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">-- Select --</option>
            <option value="admin">Admin</option>
            <option value="regular">Regular</option>
          </select>
        </div>
        <p class="text-sm text-gray-500 sm:col-span-2">Default password is <strong>12345</strong>.</p>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" onclick="closeModal('addUserModal')" class="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200">Cancel</button>
        <button type="submit" class="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700">Add</button>
      </div>
    </form>
  </div>
</div>
@endif

<!-- Edit User Modal -->
<div id="editUserModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4">
  <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-sm">
    <h3 class="text-lg font-bold text-gray-800">Edit User</h3>
    <form method="POST" class="mt-4">
      @csrf
      <input type="hidden" name="action" value="edit">
      <input type="hidden" name="id" id="edit-id">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label for="edit-firstname" class="mb-1 block text-sm font-medium text-gray-700">Firstname</label>
          <input type="text" name="firstname" id="edit-firstname" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="edit-middlename" class="mb-1 block text-sm font-medium text-gray-700">Middlename</label>
          <input type="text" name="middlename" id="edit-middlename" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="edit-lastname" class="mb-1 block text-sm font-medium text-gray-700">Lastname</label>
          <input type="text" name="lastname" id="edit-lastname" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        <div>
          <label for="edit-position" class="mb-1 block text-sm font-medium text-gray-700">Position</label>
          <input type="text" name="position" id="edit-position" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        @if ($isAdmin)
        <div>
          <label for="edit-department" class="mb-1 block text-sm font-medium text-gray-700">Department</label>
          <select name="department" id="edit-department" required class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Select Department</option>
            @foreach ($departments as $dept)
              <option value="{{ (int) $dept->id }}">{{ $dept->name }}</option>
            @endforeach
          </select>
        </div>
        @endif
        <div>
          <label for="edit-username" class="mb-1 block text-sm font-medium text-gray-700">Username</label>
          <input type="text" name="username" id="edit-username" required class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        @if ($isAdmin)
        <div>
          <label for="edit-usertype" class="mb-1 block text-sm font-medium text-gray-700">Usertype</label>
          <select name="usertype" id="edit-usertype" required class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">-- Select --</option>
            <option value="admin">Admin</option>
            <option value="regular">Regular</option>
          </select>
        </div>
        <div>
          <label for="edit-status" class="mb-1 block text-sm font-medium text-red-600">Status</label>
          <select name="status" id="edit-status" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div>
          <span class="mb-1 block text-sm font-medium text-red-600">Reset Password</span>
          <button type="button" id="reset-password-btn" class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100">
            Reset to Default (12345)
          </button>
          <input type="hidden" name="password" id="edit-password">
        </div>
        @else
        <div>
          <label for="edit-password" class="mb-1 block text-sm font-medium text-red-600">Change Password (optional)</label>
          <input type="password" name="password" id="edit-password" placeholder="Leave blank to keep current password" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
        </div>
        @endif
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" onclick="closeModal('editUserModal')" class="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200">Cancel</button>
        <button type="submit" class="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700">Update</button>
      </div>
    </form>
  </div>
</div>

<script src="/js/sidebar.js?v=20260923a" defer></script>
<script>
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('hidden');
  m.classList.add('flex');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add('hidden');
  m.classList.remove('flex');
}
document.querySelectorAll('.editBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('edit-id').value = btn.dataset.id;
    document.getElementById('edit-username').value = btn.dataset.username;
    if (document.getElementById('edit-usertype')) document.getElementById('edit-usertype').value = btn.dataset.usertype;
    document.getElementById('edit-firstname').value = btn.dataset.firstname;
    document.getElementById('edit-middlename').value = btn.dataset.middlename;
    document.getElementById('edit-lastname').value = btn.dataset.lastname;
    document.getElementById('edit-position').value = btn.dataset.position;
    if (document.getElementById('edit-department')) document.getElementById('edit-department').value = btn.dataset.department;
    if (document.getElementById('edit-status')) document.getElementById('edit-status').value = btn.dataset.status || 'active';
    openModal('editUserModal');
  });
});

// Reset Password Button for Admin
const resetBtn = document.getElementById('reset-password-btn');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to reset this user's password to the default (12345)?")) {
      document.getElementById('edit-password').value = '12345';
      alert("Password will be reset to default after saving changes.");
    }
  });
}
</script>
  <script src="/js/noinspect.js?v=20260922a" defer></script>
</body>
</html>