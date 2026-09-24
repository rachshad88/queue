@props(['href', 'file', 'current', 'label'])
@php($isCurrent = $current === $file)
<li>
    <a href="{{ $href }}" title="{{ $label }}"
       class="sidebar-link sb2-link{{ $isCurrent ? ' sb2-active' : '' }}"
       @if ($isCurrent) aria-current="page" @endif>
        <span class="sb2-ic" aria-hidden="true">{{ $slot }}</span>
        <span class="sb2-label">{{ $label }}</span>
    </a>
</li>
