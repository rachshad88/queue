<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RHU Queue System - Login</title>
    @inlineCss('dist/assets/module-CdqakSoB.css')
    @inlineCss('css/fontawesome/css/all.min.css')
    @inlineCss('css/rhu-uniform.css')
</head>
<body class="login-page">

  <!-- Layered background decorations (pure CSS, no images) -->
  <div class="login-bg" aria-hidden="true">
    <div class="bg-glow glow-a"></div>
    <div class="bg-glow glow-b"></div>
    <div class="bg-glow glow-c"></div>
    <div class="bg-orb orb-a"></div>
    <div class="bg-orb orb-b"></div>
    <div class="bg-wave wave-a"></div>
    <div class="bg-wave wave-b"></div>
    <div class="bg-dots"></div>
  </div>

  <div class="login-shell">
    <!-- LEFT: branding / marketing panel -->
    <aside class="login-brand" aria-hidden="true">
      <div class="brand-head">
        <img src="/css/sol logo.jfif" alt="RHU Logo" class="brand-logo">
        <div class="brand-titles">
          <h1 class="brand-name">RHU Queueing System</h1>
          <p class="brand-tagline">Rural Health Unit</p>
        </div>
      </div>

      <div class="brand-eyebrow">
        <span class="eyebrow-label">Healthcare Made More Accessible</span>
      </div>

      <h2 class="brand-headline">
        Your Health,<br>
        <span class="headline-accent">Our Priority</span>
      </h2>

      <p class="brand-subhead">
        A faster, easier, and more convenient way<br>
        to access healthcare services at RHU.
      </p>

      <div class="brand-features">
        <div class="feature-item">
          <span class="feature-icon"><i class="fa-regular fa-clock"></i></span>
          <div>
            <h3>Less Waiting Time</h3>
            <p>Skip the long lines and save time.</p>
          </div>
        </div>
        <div class="feature-item">
          <span class="feature-icon"><i class="fa-regular fa-face-smile"></i></span>
          <div>
            <h3>Better Experience</h3>
            <p>A smoother and simpler process.</p>
          </div>
        </div>
        <div class="feature-item">
          <span class="feature-icon"><i class="fa-regular fa-heart"></i></span>
          <div>
            <h3>Healthier Community</h3>
            <p>Quality healthcare for everyone.</p>
          </div>
        </div>
      </div>

      <p class="brand-footer">RHU Queueing System &nbsp;|&nbsp; Solano, Nueva Vizcaya</p>
    </aside>

    <!-- RIGHT: login panel -->
    <main class="login-main">
      @if (request('reason') === 'another_device')
        <div class="login-alert alert-timeout" role="alert">
          <i class="fa-solid fa-circle-exclamation"></i>
          You were signed out because your account is now active on another device.
        </div>
      @elseif (request('reason') === 'inactive')
        <div class="login-alert alert-timeout" role="alert">
          <i class="fa-solid fa-clock"></i>
          You were signed out after 30 minutes of inactivity.
        </div>
      @endif

      @if (session('error'))
        <div class="login-alert alert-error" role="alert">
          <i class="fa-solid fa-circle-exclamation"></i>
          {{ session('error') }}
        </div>
      @endif

      <div class="login-card">
        <div class="card-logo-wrap">
          <img src="/css/sol logo.jfif" alt="RHU Logo" class="card-logo">
        </div>
        <h2 class="card-title">Login Form</h2>
        <p class="card-subtitle">Sign in to continue</p>

        <form method="post" id="loginForm" class="login-form">
            @csrf
          <div class="field">
            <label for="username" class="field-label"><i class="fa-solid fa-user"></i> Username</label>
            <div class="input-wrap">
              <input type="text" id="username" name="username" placeholder="Enter your username"
                     required autocomplete="username" class="login-input" value="{{ old('username') }}">
            </div>
          </div>

          <div class="field">
            <label for="password" class="field-label"><i class="fa-solid fa-lock"></i> Password</label>
            <div class="input-wrap" x-data="{ show: false }">
              <input type="password" id="password" name="password"
                     placeholder="Enter your password" required autocomplete="current-password"
                     class="login-input login-input-pw"
                     :type="show ? 'text' : 'password'">
              <button type="button" class="pw-toggle" tabindex="-1"
                      @click="show = !show"
                      :aria-label="show ? 'Hide password' : 'Show password'">
                <i class="fa-solid fa-eye" :class="show ? 'fa-eye-slash' : 'fa-eye'"></i>
              </button>
            </div>
          </div>

          <button type="submit" id="signinBtn" class="signin-btn">
            <i class="fa-solid fa-right-to-bracket"></i>
            <span id="signinText">Sign in</span>
          </button>
        </form>

        <div class="secure-divider">
          <span class="divider-line"></span>
          <span class="secure-label"><i class="fa-solid fa-shield-halved"></i> Secure Login</span>
          <span class="divider-line"></span>
        </div>

        <div class="info-panel">
          <span class="info-icon"><i class="fa-solid fa-circle-info"></i></span>
          <div>
            <h3 class="info-title">RHU Queueing System</h3>
            <p class="info-text">Providing quality healthcare for a healthier community.</p>
          </div>
        </div>
      </div>
    </main>
  </div>

  @include('partials.frontend', ['alpine' => true])
  <script src="/js/login.js" defer></script>
  <script src="/js/noinspect.js?v=20260922a" defer></script>
</body>
</html>