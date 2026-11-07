// Copyright (c) 2026 Janat Yasser. All rights reserved.
//
// Static-demo shim, injected by scripts/build-static.mjs. On GitHub Pages
// there's no Express server, so this runs the same model files in the
// browser instead:
//   - the key-value store (models/kvstore.js) with localStorage standing in for the JSON file,
//   - Huffman compression (models/huffman.js), rendered with the same EJS template,
//   - topology switching on the network page.
// The model code itself is unchanged; it's wrapped below by the build script.
(function () {
  // ---- a tiny CommonJS loader for the bundled models -------------------
  const files = {};
  const fakeFs = {
    existsSync: (p) => { try { return localStorage.getItem('sysplay:' + p) !== null; } catch { return p in files; } },
    readFileSync: (p) => { try { return localStorage.getItem('sysplay:' + p); } catch { return files[p]; } },
    writeFileSync: (p, data) => { try { localStorage.setItem('sysplay:' + p, data); } catch { files[p] = data; } },
  };
  const fakePath = { join: (...parts) => parts.join('/').replace(/\/+/g, '/') };
  const modules = {};
  window.__sysplayDefine = (name, factory) => {
    const module = { exports: {} };
    factory(module, module.exports, (dep) => (dep === 'fs' ? fakeFs : dep === 'path' ? fakePath : modules[dep.replace(/^\.\//, '')]), 'models');
    modules[name] = module.exports;
  };
  window.__sysplayModules = modules;
})();

// scripts/build-static.mjs puts the wrapped model files in place of the next line
// @@MODELS@@

window.addEventListener('DOMContentLoaded', () => {
  const { huffman, kvstore: kv } = window.__sysplayModules;

  // ---- key-value store: answer the page's fetch('/database/api') locally
  if (document.getElementById('recordsTbody')) {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, opts) => {
      if (!String(url).endsWith('/database/api')) return realFetch(url, opts);
      const { op, key, value, prefix } = JSON.parse(opts.body || '{}');
      let result;
      switch ((op || '').toUpperCase()) {
        case 'PUT': result = kv.put(key, value); break;
        case 'GET': result = kv.get(key); break;
        case 'DELETE': result = kv.del(key); break;
        case 'SCAN': result = kv.scan(prefix); break;
        case 'FLUSH': result = kv.flush(); break;
        case 'STATS': result = kv.stats(); break;
        default: result = { ok: false, error: `Unknown operation: ${op}` };
      }
      return new Response(JSON.stringify({ ...result, all: kv.getAll() }), { headers: { 'Content-Type': 'application/json' } });
    };
    if (typeof updateUI === 'function') updateUI(kv.getAll());   // show what this browser stored last time
  }

  // ---- network: switch topology between the pre-built pages
  if (typeof loadTopology === 'function') {
    window.loadTopology = (id) => { location.href = location.pathname.replace(/network\/.*$/, `network/${id}/`); };
  }
});

// ---- compression: the form submits ?text=... to this page; render the result here.
// Runs before compression.js (it's injected just above it), so the tree animation sees INPUT_TEXT.
(function () {
  const form = document.getElementById('compressForm');
  if (!form) return;
  form.method = 'get';
  form.action = location.pathname;
  const text = (new URLSearchParams(location.search).get('text') || '').slice(0, 2000);
  if (!text) return;
  const tpl = document.getElementById('compression-template').textContent;
  const result = window.__sysplayModules.huffman.compress(text);
  const html = ejs.render(tpl, { title: document.title, result, input: text });
  const page = document.querySelector('main');
  page.innerHTML = html;
  window.INPUT_TEXT = text;
  // the re-rendered form needs the same treatment
  const again = document.getElementById('compressForm');
  again.method = 'get';
  again.action = location.pathname;
})();
