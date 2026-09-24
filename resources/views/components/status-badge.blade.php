@props(['status' => ''])
@php($state = strtolower((string) $status))
@switch($state)
    @case('done')
        <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-emerald-700">
            <svg class="h-3 w-3 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
            <span class="sr-only">Status: </span>Completed
        </span>
        @break
    @case('serving')
        <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-blue-700">
            <svg class="h-3 w-3 flex-none" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
            <span class="sr-only">Status: </span>Serving
        </span>
        @break
    @case('waiting')
        <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-amber-700">
            <svg class="h-3 w-3 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
            <span class="sr-only">Status: </span>Waiting
        </span>
        @break
    @case('cancelled')
        <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-red-700">
            <svg class="h-3 w-3 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            <span class="sr-only">Status: </span>Cancelled
        </span>
        @break
    @default
        <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-slate-600">
            <span class="h-1.5 w-1.5 flex-none rounded-full bg-slate-400" aria-hidden="true"></span>
            <span class="sr-only">Status: </span>{{ ucfirst(strtolower((string) $status)) }}
        </span>
@endswitch