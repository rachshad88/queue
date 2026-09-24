<div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-primary-500 text-white">
          <th class="px-4 py-3 text-left font-semibold">Window / Section</th>
          <th class="px-4 py-3 text-left font-semibold">Occupied By</th>
          <th class="px-4 py-3 text-left font-semibold">Status</th>
          <th class="px-4 py-3 text-right font-semibold">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        @foreach ($rows as $i => $row)
          @php($occupied = !empty($row->occupied_by) && (int) $row->status === 1)
          @php($name = $occupied ? ($row->occupant_name ?: ($row->occupant_user ?: ('User #' . (int) $row->occupied_by))) : null)
          <tr class="{{ $i % 2 === 0 ? 'bg-white' : 'bg-gray-50' }}">
            <td class="px-4 py-3 font-medium text-gray-800">{{ $row->section_name }}</td>
            <td class="px-4 py-3 text-gray-600">
              {!! $occupied ? e($name) : '<span class="italic text-gray-400">Free</span>' !!}
            </td>
            <td class="px-4 py-3">
              @if ($occupied)
                <span class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Logged In</span>
              @else
                <span class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Free</span>
              @endif
            </td>
            <td class="px-4 py-3 text-right">
              @if ($occupied)
                <button class="release-btn rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 active:scale-[0.98]"
                        wire:click="release('{{ $type }}', {{ (int) $row->id }})"
                        wire:confirm="Force logout staff from '{{ $row->section_name }}'? The station will become free immediately.">Logout</button>
              @else
                <button class="cursor-not-allowed rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-400" disabled>Logout</button>
              @endif
            </td>
          </tr>
        @endforeach
      </tbody>
    </table>
  </div>
</div>