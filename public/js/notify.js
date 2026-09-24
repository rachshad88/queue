// Lightweight notification helper (toasts + confirm/prompt fallbacks)
(function(){
  // create container
  const container = document.createElement('div');
  container.id = 'toast-container';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(container));

  function toast(msg, type = 'info', timeout = 3000) {
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 300);
    }, timeout);
  }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      const ok = confirm(message);
      resolve(ok);
    });
  }

  function promptDialog(message, placeholder = '') {
    return new Promise((resolve) => {
      const r = prompt(message, placeholder);
      resolve(r);
    });
  }

  window.Notify = {
    toast,
    confirm: confirmDialog,
    prompt: promptDialog
  };
})();