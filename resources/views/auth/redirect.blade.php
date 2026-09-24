<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecting…</title>
</head>
<body>
<script>
    localStorage.setItem('username', @json($username));
    window.location.href = @json($destination);
</script>
  <script src="/js/noinspect.js?v=20260922a" defer></script>
</body>
</html>