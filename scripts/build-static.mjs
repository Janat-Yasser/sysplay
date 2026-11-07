// Copyright (c) 2026 Janat Yasser. All rights reserved.
//
// Builds a static copy of Systems Playground in dist/ for GitHub Pages.
// Pages are rendered by the real Express app (with an empty data folder),
// links are made relative so the site works under a sub-path, and the
// server-side parts run in the browser through scripts/static-shim.js.
//
//   node scripts/build-static.mjs

import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const require = createRequire(import.meta.url);
const { getAllTopologies } = require(path.join(root, 'models/network.js'));
const PORT = 3918;

const topologies = getAllTopologies().map((t) => t.id);
const pages = [
  ['/', ''],
  ['/compression', 'compression'],
  ['/database', 'database'],
  ['/network', 'network'],
  ...topologies.map((id) => [`/network?topo=${id}`, `network/${id}`]),
];

function relativise(html, dir) {
  const up = dir ? '../'.repeat(dir.split('/').length) : './';
  return html
    .replace(/(href)="\/network\?topo=([\w-]+)"/g, `$1="${up}network/$2/"`)
    .replace(/(href|src|action)="\/([^"]*)"/g, (_, attr, p) => {
      if (p === '') return `${attr}="${up}"`;
      const isFile = /\.[a-z0-9]+(\?.*)?$/i.test(p);
      return `${attr}="${up}${p}${isFile || p.endsWith('/') ? '' : '/'}"`;
    });
}

async function bundleModels() {
  const shim = await readFile(path.join(root, 'scripts/static-shim.js'), 'utf8');
  const models = [];
  for (const name of ['huffman', 'kvstore']) {
    const src = await readFile(path.join(root, 'models', `${name}.js`), 'utf8');
    models.push(`__sysplayDefine(${JSON.stringify(name)}, function (module, exports, require, __dirname) {\n${src}\n});`);
  }
  if (!shim.includes('// @@MODELS@@')) throw new Error('static-shim.js lost its @@MODELS@@ marker');
  return shim.replace('// @@MODELS@@', () => models.join('\n\n'));
}

// Run the server from a copy so the build never touches (or ships) your own data/kvstore.json
const work = await mkdtemp(path.join(tmpdir(), 'sysplay-build-'));
await cp(root, work, { recursive: true, filter: (src) => !/[\\/](dist|data|\.git)([\\/]|$)/.test(src.slice(root.length)) });
const server = spawn(process.execPath, ['server.js'], { cwd: work, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
try {
  for (let i = 0; ; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/`); break; }
    catch { if (i > 50) throw new Error('server did not start'); await new Promise((r) => setTimeout(r, 100)); }
  }
  await rm(out, { recursive: true, force: true });
  await cp(path.join(root, 'public'), out, { recursive: true });
  await mkdir(path.join(out, 'js/vendor'), { recursive: true });
  await cp(require.resolve('ejs/ejs.min.js'), path.join(out, 'js/vendor/ejs.min.js'));
  await writeFile(path.join(out, 'js/static-shim.js'), await bundleModels());
  const template = await readFile(path.join(root, 'views/compression.ejs'), 'utf8');

  for (const [url, dir] of pages) {
    const res = await fetch(`http://127.0.0.1:${PORT}${url}`);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    let html = relativise(await res.text(), dir);
    const up = dir ? '../'.repeat(dir.split('/').length) : './';
    // the shim goes right before the page's own script, so it can prepare the page first
    const shim = (dir === 'compression'
      ? `<script type="text/plain" id="compression-template">${template.replace(/<\/script/gi, '<\\/script')}</script>\n<script src="${up}js/vendor/ejs.min.js"></script>\n`
      : '') + `<script src="${up}js/static-shim.js"></script>\n`;
    html = html.replace(/(<script src="[^"]*js\/(compression|database|network)\.js"><\/script>)/, `${shim}$1`);
    if (!html.includes('static-shim.js')) html = html.replace('</body>', `${shim}</body>`);
    await mkdir(path.join(out, dir), { recursive: true });
    await writeFile(path.join(out, dir, 'index.html'), html);
  }
  const missing = await fetch(`http://127.0.0.1:${PORT}/__missing__`);
  await writeFile(path.join(out, '404.html'), relativise(await missing.text(), '').replace(/="\.\//g, '="/sysplay/'));
  await writeFile(path.join(out, '.nojekyll'), '');
  console.log(`Built ${pages.length} pages into dist/`);
} finally {
  server.kill();
  await rm(work, { recursive: true, force: true });
}
