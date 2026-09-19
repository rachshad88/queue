document.addEventListener("DOMContentLoaded", function() {
      let savedUsername = localStorage.getItem("username");
      if (savedUsername) {
        document.querySelector("input[name='username']").value = savedUsername;
      }
    });