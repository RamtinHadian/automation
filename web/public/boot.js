// Runs before the app (kept as a file so the page needs no inline script: the content-security-policy allows scripts from this site only).
try { if (localStorage.getItem("app_night_mode") === "1") { document.documentElement.classList.add("night"); } } catch (e) {}
try {
  var b = JSON.parse(localStorage.getItem("app_theme_boot") || "null");
  if (b && b.bg) {
    var r = document.documentElement;
    r.style.setProperty("--theme-dark-bg", b.bg);
    r.style.backgroundColor = b.bg;
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", b.bg);
  }
} catch (e) {}
