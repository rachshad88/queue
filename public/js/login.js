document.addEventListener("DOMContentLoaded", function() {
  let savedUsername = localStorage.getItem("username");
  if (savedUsername) {
    document.querySelector("input[name='username']").value = savedUsername;
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