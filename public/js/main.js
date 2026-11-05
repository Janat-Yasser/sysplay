// Copyright (c) 2026 Janat Yasser. All rights reserved.
/* Systems Playground — main.js */

// Highlight active nav link
(function () {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && path.startsWith(href)) link.classList.add('active');
  });
})();
