// Lightweight notification helper (toasts + confirm/prompt fallbacks)
(function(){
  // create container
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.style.position = 'fixed';
  container.style.right = '16px';
  container.style.top = '16px'; 
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(container));

  function toast(msg, type = 'info', timeout = 3000) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    el.style.marginTop = '8px';
    el.style.padding = '10px 14px';
    el.style.borderRadius = '6px';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    el.style.color = '#111';
    el.style.background = type === 'error' ? '#ffcccc' : (type === 'success' ? '#ccffdd' : '#ffffff');
    container.appendChild(el);  
    setTimeout(() => { el.style.opacity = '0'; setTimeout(()=>el.remove(),300); }, timeout);
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
