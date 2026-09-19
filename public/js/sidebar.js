document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("sidebar-container");
  if (!container) return;

  try {
    const resp = await fetch("sidebar.php", { cache: "no-store" });
    if (resp.status === 401) {
      // Session expired: navigate the top page to login (fragment can't redirect)
      window.location.href = "login.php";
      return;
    }
    if (!resp.ok) throw new Error("Failed to load sidebar");

    const html = await resp.text();
    container.innerHTML = html;

    // Wait for sidebar to render before initializing
    requestAnimationFrame(setupSidebar);
  } catch (e) {
    console.error("Sidebar load failed:", e);
  }

  function setupSidebar() {
    const sidebar = document.getElementById("app-sidebar");
    if (!sidebar) {
      console.warn("Sidebar not found, skipping setup.");
      return;
    }

    // --- Solid persistent highlight on nav links ---
    const SOLID_KEY = "sidebar-active-link";
    const path = (window.location.pathname || "").split("/").filter(Boolean).pop() || "";

    function applySolidActive(link) {
      sidebar.querySelectorAll(".sidebar-link").forEach(a => {
        a.classList.remove("sidebar-link-active");
        a.removeAttribute("aria-current");
      });
      if (link) {
        link.classList.add("sidebar-link-active");
        link.setAttribute("aria-current", "page");
      }
    }

    function linkForHref(href) {
      let el = null;
      sidebar.querySelectorAll(".sidebar-link").forEach(a => {
        if (el) return;
        const h = (a.getAttribute("href") || "").split("?")[0].split("/").pop();
        if (h === href) el = a;
      });
      return el;
    }

    // 1) Stored click from a previous page load wins (cross-page handoff)
    const stored = sessionStorage.getItem(SOLID_KEY);
    let activeLink = stored ? linkForHref(stored) : null;
    // 2) Otherwise fall back to matching the current URL path
    if (!activeLink && path) activeLink = linkForHref(path);
    applySolidActive(activeLink);

    // --- Mobile drawer ---
    const showBtn = document.getElementById("show-sidebar");
    if (showBtn && sidebar) {
      let backdrop = document.querySelector(".sidebar-backdrop");
      if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.className = "sidebar-backdrop";
        document.body.appendChild(backdrop);
      }

      const close = () => {
        sidebar.classList.remove("open");
        backdrop.classList.remove("active");
        showBtn.style.display = "flex";
      };

      showBtn.addEventListener("click", () => {
        sidebar.classList.add("open");
        backdrop.classList.add("active");
        showBtn.style.display = "none";
      });
      backdrop.addEventListener("click", close);
    }

    // --- Nav link click: instant solid highlight that survives reload ---
    const nav = sidebar.querySelector("nav");
    if (nav) {
      nav.addEventListener("click", (e) => {
        const link = e.target.closest(".sidebar-link");
        if (!link || !link.getAttribute("href")) return;
        applySolidActive(link);
        sessionStorage.setItem(SOLID_KEY, link.getAttribute("href").split("?")[0].split("/").pop());
        // If the mobile drawer is open, close it (the page will navigate anyway)
        if (typeof close === "function") close();
      });
    }

    // Change Password UI & AJAX handling
    const changeBtn = document.getElementById('change-password-btn');
    const changeForm = document.getElementById('change-password-form');
    const cancelBtn = document.getElementById('cancel-change-password');
    const submitBtn = document.getElementById('submit-change-password');
    const feedback = document.getElementById('change-password-feedback');

    function showFeedback(msg, type = 'error') {
      if (!feedback) return;
      feedback.style.display = 'block';
      feedback.style.color = type === 'success' ? '#34d399' : '#f87171';
      feedback.textContent = msg;
      setTimeout(() => { feedback.style.display = 'none'; }, 5000);
    }

    if (changeBtn && changeForm) {
      changeBtn.addEventListener('click', () => {
        const open = changeForm.classList.toggle('hidden');
        changeBtn.setAttribute('aria-expanded', String(!open));
      });
    }

    if (cancelBtn && changeForm) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        changeForm.classList.add('hidden');
        if (changeBtn) changeBtn.setAttribute('aria-expanded', 'false');
        changeForm.querySelectorAll('input').forEach(i => i.value = '');
      });
    }

    if (submitBtn && changeForm) {
      submitBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const oldPw = document.getElementById('old-password').value || '';
        const newPw = document.getElementById('new-password').value || '';
        const confirmPw = document.getElementById('confirm-password').value || '';

        if (!oldPw.trim() || !newPw.trim() || !confirmPw.trim()) {
          showFeedback('Please fill all fields');
          if (window.Notify && typeof Notify.toast === 'function') Notify.toast('Please fill all fields', 'error');
          return;
        }
        if (newPw.length < 5) {
          showFeedback('New password must be at least 5 characters');
          if (window.Notify && typeof Notify.toast === 'function') Notify.toast('New password must be at least 5 characters', 'error');
          return;
        }
        if (newPw !== confirmPw) {
          showFeedback('New password and confirmation do not match');
          if (window.Notify && typeof Notify.toast === 'function') Notify.toast('New password and confirmation do not match', 'error');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        const resetForm = () => {
          changeForm.classList.add('hidden');
          if (changeBtn) changeBtn.setAttribute('aria-expanded', 'false');
          changeForm.querySelectorAll('input').forEach(i => i.value = '');
        };

        try {
          const form = new URLSearchParams();
          form.append('old_password', oldPw);
          form.append('new_password', newPw);
          const m = document.querySelector('meta[name="csrf-token"]');
          if (m && m.content) form.append('csrf_token', m.content);

          const resp = await fetch('update_password.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
          });
          const data = await resp.json();
          if (data && data.success) {
            showFeedback('Password updated', 'success');
            if (window.Notify && typeof Notify.toast === 'function') Notify.toast('Password updated', 'success');
            resetForm();
          } else {
            const msg = data && data.message ? data.message : 'Update failed';
            showFeedback(msg);
            if (window.Notify && typeof Notify.toast === 'function') Notify.toast(msg, 'error');
          }
        } catch (err) {
          console.error(err);
          showFeedback('Network error');
          if (window.Notify && typeof Notify.toast === 'function') Notify.toast('Network error', 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save';
        }
      });
    }
  }
});

// ========== Department Management ==========
function openAddDepartment() {
  // Redirect to the Department Management page where admins can add/edit departments
  window.location.href = 'department_management.php';
}

function loadDepartments() {
  const sel = document.getElementById("department");
  if (!sel) return;

  fetch("get_departments.php")
    .then(r => r.json())
    .then(depts => {
      sel.innerHTML = "";
      depts.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = d.name;
        sel.appendChild(opt);
      });
    })
    .catch(err => console.error("Failed to load departments:", err));
}

function syncDepartmentSelect() {
  const sel = document.getElementById("department");
  if (!sel) return;
  // These globals only exist on the queue-controller page; skip elsewhere
  // instead of throwing a ReferenceError.
  if (typeof fetchQueue !== 'function') return;

  sel.addEventListener("change", () => {
    try {
      currentDept = sel.value;
    } catch (e) {
      console.warn("currentDept not available:", e);
    }
    fetchQueue();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(syncDepartmentSelect, 300);
});
