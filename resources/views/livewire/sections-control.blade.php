<div>
  <div class="mb-5">
    <h2 class="mb-3 text-base font-semibold text-slate-800">Admission Windows</h2>
    @include('sections._control_table', ['rows' => $admission, 'typeLabel' => 'Admission Windows', 'type' => 'admission'])
  </div>

  <div class="mb-5">
    <h2 class="mb-3 text-base font-semibold text-slate-800">Waiting Area Windows</h2>
    @include('sections._control_table', ['rows' => $waiting, 'typeLabel' => 'Waiting Area Windows', 'type' => 'waiting'])
  </div>
</div>