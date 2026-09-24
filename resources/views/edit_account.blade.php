<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit Account | RHU Queue</title>
    @inlineCss('dist/assets/module-CdqakSoB.css')
    @inlineCss('css/rhu-uniform.css')
</head>
<body class="min-h-screen bg-gray-50 page-report">
    <x-hospital-background />
    <div id="sidebar-container"></div>

    <main class="p-4 sm:p-6">
        <div class="mx-auto max-w-2xl">
            <h1 class="mb-5 text-xl sm:text-2xl font-bold text-slate-900">EDIT ACCOUNT</h1>

            <div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                @if (! empty($error))
                    <div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                        {{ $error }}
                    </div>
                @endif

                @if (request()->query('success'))
                    <div class="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                        Account updated successfully.
                    </div>
                @endif

                <form method="post" novalidate>
                    @csrf
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label for="firstname" class="mb-1 block text-sm font-medium text-gray-700">First Name <span class="text-red-500">*</span></label>
                            <input type="text" id="firstname" name="firstname" required
                                   value="{{ $user->firstname ?? '' }}"
                                   class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
                        </div>

                        <div>
                            <label for="middlename" class="mb-1 block text-sm font-medium text-gray-700">Middle Name</label>
                            <input type="text" id="middlename" name="middlename"
                                   value="{{ $user->middlename ?? '' }}"
                                   class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
                        </div>

                        <div>
                            <label for="lastname" class="mb-1 block text-sm font-medium text-gray-700">Last Name <span class="text-red-500">*</span></label>
                            <input type="text" id="lastname" name="lastname" required
                                   value="{{ $user->lastname ?? '' }}"
                                   class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
                        </div>

                        <div>
                            <label for="username" class="mb-1 block text-sm font-medium text-gray-700">Username <span class="text-red-500">*</span></label>
                            <input type="text" id="username" name="username" required
                                   value="{{ $user->username ?? '' }}"
                                   class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
                        </div>

                        <div>
                            <label for="position" class="mb-1 block text-sm font-medium text-gray-700">Position</label>
                            <input type="text" id="position" name="position"
                                   value="{{ $user->position ?? '' }}"
                                   class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500">
                        </div>

                        <div>
                            <label class="mb-1 block text-sm font-medium text-gray-700">Department</label>
                            <div class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                {{ $user->department ?? (isset($user->department_id) ? 'Department #'.$user->department_id : '—') }}
                            </div>
                            <p class="mt-1 text-xs text-gray-400">Department cannot be changed here.</p>
                        </div>
                    </div>

                    <div class="mt-6">
                        <button type="submit"
                                class="w-full rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98]">
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </main>

    <script src="/js/sidebar.js?v=20260923a" defer></script>
  <script src="/js/noinspect.js?v=20260922a" defer></script>
</body>
</html>