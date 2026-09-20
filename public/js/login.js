document.addEventListener("DOMContentLoaded", function() {
  let savedUsername = localStorage.getItem("username");
  if (savedUsername) {
    document.querySelector("input[name='username']").value = savedUsername;
  }

  const toggle = document.getElementById("pwToggle");
  const pwInput = document.getElementById("password");
  const pwIcon = document.getElementById("pwIcon");
  if (toggle && pwInput && pwIcon) {
    toggle.addEventListener("click", function() {
      const show = pwInput.type === "password";
      pwInput.type = show ? "text" : "password";
      pwIcon.className = show ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
      toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  }

  const form = document.getElementById("loginForm");
  const signinBtn = document.getElementById("signinBtn");
  if (form && signinBtn) {
    form.addEventListener("submit", function() {
      signinBtn.disabled = true;
      const label = document.getElementById("signinText");
      if (label) label.textContent = "Signing in...";
    });
  }
});