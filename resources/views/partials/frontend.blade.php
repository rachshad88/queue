@if (($alpine ?? false) || ($livewire ?? false))
@php($__rhuManifest = json_decode((string) file_get_contents(public_path('dist/manifest.json')), true))
@if ($livewire ?? false)
@livewireStyles
@livewireScripts
@endif
@if ($alpine ?? false)
<script defer src="/dist/{{ $__rhuManifest['resources/js/alpine.js']['file'] ?? 'assets/rhu-alpine.D-UBER0k.js' }}"></script>
@endif
@endif