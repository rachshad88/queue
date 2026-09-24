// Shared-screen deterrents: raise the bar for casual tampering on clinic
// kiosks and staff terminals (right-click menus, DevTools shortcuts).
//
// NOT security and never presented as such: DevTools cannot be disabled from
// a web page. View Source, curl, another browser, the browser menu, or simply
// disabling JavaScript all bypass this file completely. Real protection is
// server-side (session auth on every operator endpoint, ownership checks,
// superadmin gates, no secrets in frontend code) and is unaffected by this.
//
// Deliberately preserves staff workflows: text selection still works (queue
// numbers/codes stay copyable) and right-click still works inside form
// fields (paste). Uses capture-phase listeners so page handlers cannot
// accidentally re-enable what this suppresses.
(function () {
  'use strict';

  function inEditable(el) {
    if (!el || !el.closest) {
      return false;
    }

    return !!el.closest('input, textarea, select, [contenteditable="true"]');
  }

  // 1) Context menu: suppress everywhere except form fields.
  document.addEventListener('contextmenu', function (e) {
    if (!inEditable(e.target)) {
      e.preventDefault();
    }
  }, true);

  // 2) DevTools / bypass shortcuts. Normal typing is untouched.
  document.addEventListener('keydown', function (e) {
    const k = String(e.key || '').toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    // F12.
    if (e.key === 'F12') {
      e.preventDefault();
      e.stopPropagation();

      return;
    }

    // Ctrl/Cmd+Shift+I/J/C and macOS Cmd+Opt+I/J.
    if ((mod && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
        (mod && e.altKey && (k === 'i' || k === 'j'))) {
      e.preventDefault();
      e.stopPropagation();

      return;
    }

    // Ctrl/Cmd+U (view source) and Ctrl/Cmd+S (save dialog kiosk accidents).
    if (mod && !e.shiftKey && !e.altKey && (k === 'u' || k === 's')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // 3) Dragging content/images out of kiosk screens.
  document.addEventListener('dragstart', function (e) {
    e.preventDefault();
  }, true);
})();
