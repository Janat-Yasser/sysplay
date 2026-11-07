// Copyright (c) 2026 Janat Yasser. All rights reserved.
/* Systems Playground — main.js */

// Highlight active nav link
(function () {
  // Compare resolved paths so this works at / and under a sub-path (the static demo)
  const path = window.location.pathname.replace(/\/$/, '');
  document.querySelectorAll('.nav-link').forEach(link => {
    const target = new URL(link.href).pathname.replace(/\/(index\.html)?$/, '');
    if (target && path.startsWith(target)) link.classList.add('active');
  });
})();
