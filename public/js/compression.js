/* =============================================
   COMPRESSION — Client JS
   Renders the Huffman tree as SVG and handles
   sample text injection + char counter
   ============================================= */

// ── Sample texts ───────────────────────────────
const SAMPLES = {
  lorem: `The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!`,
  english: `It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.`,
  code: `function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\nconsole.log(fibonacci(10));`,
  repeated: `aaaaaaaaabbbbbbbcccccddddeeefghijklmnopqrstuvwxyz`
};

function loadSample(key) {
  const el = document.getElementById('compressInput');
  if (!el) return;
  el.value = SAMPLES[key] || '';
  updateCount();
  el.focus();
}

// ── Char counter ───────────────────────────────
function updateCount() {
  const el   = document.getElementById('compressInput');
  const span = document.getElementById('charCount');
  if (el && span) span.textContent = el.value.length;
}

document.getElementById('compressInput')?.addEventListener('input', updateCount);

// ── Huffman build, ported from models/huffman.js so the step-by-step
//    playback ends on exactly the tree the server computed ──────────────
let _nid = 0;
function hnode(char, freq, left = null, right = null) { return { id: 'n' + (_nid++), char, freq, left, right, isLeaf: !left && !right }; }

function buildSnapshots(text) {
  const freq = {};
  for (const ch of text) freq[ch] = (freq[ch] || 0) + 1;
  let nodes = Object.entries({ ...freq }).map(([c, f]) => hnode(c, f)).sort((a, b) => a.freq - b.freq);
  const snaps = [{ roots: [...nodes], merged: null }];
  while (nodes.length > 1) {
    nodes.sort((a, b) => a.freq - b.freq);
    const left = nodes.shift(), right = nodes.shift();
    const parent = hnode(null, left.freq + right.freq, left, right);
    nodes.push(parent);
    snaps.push({ roots: [...nodes].sort((a, b) => a.freq - b.freq), merged: parent, left, right });
  }
  return snaps;
}

const show = (c) => (c === ' ' ? 'SPC' : c === '\n' ? 'NL' : c === '\t' ? 'TAB' : c);

// ── Tree renderer: draws a forest (one tree per item still in the queue) ──
const COL = { zero: '#94A3B8', one: '#2563EB', leaf: '#2563EB', leafHi: '#2563EB', chip: '#FFFFFF', chipEdge: '#94A3B8', silk: '#0F172A', silk3: '#64748B', amber: '#D97706' };

function renderForest(roots, opts = {}) {
  const svg = document.getElementById('huffmanTree');
  if (!svg || !roots.length) return;
  const R = 16, H_GAP = 40, V_GAP = 64, PAD = 30;
  let counter = 0;
  const place = (n, d) => { if (!n) return; place(n.left, d + 1); n._x = counter++; n._d = d; place(n.right, d + 1); };
  const depthOf = (n) => (n ? 1 + Math.max(depthOf(n.left), depthOf(n.right)) : 0);
  roots.forEach((r) => { place(r, 0); counter += 0.6; });
  const maxDepth = Math.max(...roots.map(depthOf));
  const W = Math.max(counter * H_GAP + PAD * 2, 520);
  const Hh = (maxDepth - 1) * V_GAP + PAD * 2 + R * 2 + 18;
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
  svg.setAttribute('width', W); svg.setAttribute('height', Hh);
  svg.innerHTML = '';
  const xy = (n) => ({ x: PAD + n._x * H_GAP + R, y: PAD + R + n._d * V_GAP });
  const hot = new Set(opts.hot || []);

  const edges = (n) => {
    if (!n || n.isLeaf) return;
    for (const [child, bit] of [[n.left, '0'], [n.right, '1']]) {
      const a = xy(n), b = xy(child);
      // a trace with one 45-degree bend, like a board layout
      const midY = a.y + (b.y - a.y) * 0.45;
      const dx = Math.sign(b.x - a.x) * Math.min(Math.abs(b.x - a.x), b.y - midY);
      svg.appendChild(mk('path', { d: `M ${a.x} ${a.y} V ${midY} H ${b.x - dx} L ${b.x} ${b.y}`, fill: 'none', stroke: bit === '1' ? COL.one : COL.zero, 'stroke-width': 2, 'stroke-linejoin': 'round', opacity: bit === '1' ? .85 : .7 }));
      svg.appendChild(mk('text', { x: (a.x + b.x) / 2 + (bit === '0' ? -8 : 8), y: midY - 5, 'text-anchor': 'middle', fill: bit === '1' ? COL.one : COL.zero, 'font-size': 11, 'font-family': 'JetBrains Mono, monospace' }, bit));
      edges(child);
    }
  };
  const nodes = (n) => {
    if (!n) return;
    const { x, y } = xy(n);
    const g = mk('g', { 'data-char': n.char ?? '' });
    const isHot = hot.has(n.id);
    if (n.isLeaf) {
      g.appendChild(mk('circle', { cx: x, cy: y, r: R, fill: COL.leaf, stroke: isHot ? COL.amber : COL.leafHi, 'stroke-width': isHot ? 3 : 2 }));
      const lab = show(n.char);
      g.appendChild(mk('text', { x, y: y + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#FFFFFF', 'font-size': lab.length > 1 ? 9 : 13, 'font-weight': 700, 'font-family': 'JetBrains Mono, monospace', 'pointer-events': 'none' }, lab));
      g.appendChild(mk('text', { x, y: y + R + 13, 'text-anchor': 'middle', fill: COL.silk3, 'font-size': 10, 'font-family': 'JetBrains Mono, monospace', 'pointer-events': 'none' }, String(n.freq)));
      g.style.cursor = 'pointer';
      g.addEventListener('mouseenter', () => highlightChar(n.char));
      g.addEventListener('mouseleave', clearHighlight);
    } else {
      g.appendChild(mk('rect', { x: x - R, y: y - R + 3, width: R * 2, height: R * 2 - 6, rx: 3, fill: COL.chip, stroke: isHot ? COL.amber : COL.chipEdge, 'stroke-width': isHot ? 3 : 1.5 }));
      g.appendChild(mk('text', { x, y: y + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: COL.silk, 'font-size': 11, 'font-weight': 600, 'font-family': 'JetBrains Mono, monospace', 'pointer-events': 'none' }, String(n.freq)));
    }
    svg.appendChild(g);
    nodes(n.left); nodes(n.right);
  };
  roots.forEach((r) => { edges(r); });
  roots.forEach((r) => { nodes(r); });
  // keep the node that was just merged in view when the forest is wider than the panel
  const all = []; const walk = (n) => { if (n) { all.push(n); walk(n.left); walk(n.right); } }; roots.forEach(walk);
  const h = all.find((n) => hot.has(n.id));
  const wrap = svg.parentElement;
  if (h && wrap && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, xy(h).x - wrap.clientWidth / 2);
}

function mk(tag, attrs, text) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

// ── Step-by-step playback ──────────────────────
const Build = { snaps: [], i: 0, timer: null };

function showStep(i) {
  const s = Build.snaps[i];
  Build.i = i;
  renderForest(s.roots, { hot: s.merged ? [s.merged.id] : [] });
  const next = Build.snaps[i + 1];
  const pq = document.getElementById('pq');
  if (pq) pq.innerHTML = s.roots.map((n, k) => `<span class="${next && k < 2 ? 'take' : ''}">${n.isLeaf ? esc(show(n.char)) + ' ' : ''}${n.freq}</span>`).join('');
  const txt = document.getElementById('stepText');
  if (txt) {
    if (i === 0) txt.innerHTML = `Start: one leaf per character, sorted by count. The two smallest (outlined) get merged first.`;
    else if (!next) txt.innerHTML = `Done after <b>${i}</b> merges. Read a character's code by walking down from the top: left is 0, right is 1.`;
    else txt.innerHTML = `Merge <b>${i}</b> of ${Build.snaps.length - 1}: ${label(s.left)} + ${label(s.right)} make a node of <b>${s.merged.freq}</b>.`;
  }
  const btn = document.getElementById('buildPlay');
  if (btn && !next) { btn.textContent = 'Replay'; stopBuild(false); }
}
const label = (n) => (n.isLeaf ? `"${esc(show(n.char))}" (${n.freq})` : `a ${n.freq} node`);
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function playBuild() {
  const btn = document.getElementById('buildPlay');
  if (Build.timer) { stopBuild(); return; }
  if (Build.i >= Build.snaps.length - 1) showStep(0);
  btn.textContent = 'Pause';
  const per = Math.max(180, Math.min(900, 12000 / Build.snaps.length));
  Build.timer = setInterval(() => showStep(Math.min(Build.i + 1, Build.snaps.length - 1)), per);
}
function stopBuild(resetLabel = true) {
  clearInterval(Build.timer); Build.timer = null;
  const btn = document.getElementById('buildPlay');
  if (btn && resetLabel) btn.textContent = 'Play';
}
function stepBuild() { stopBuild(); showStep(Math.min(Build.i + 1, Build.snaps.length - 1)); }
function finishBuild() { stopBuild(); showStep(Build.snaps.length - 1); }

if (typeof INPUT_TEXT !== 'undefined' && INPUT_TEXT) {
  Build.snaps = buildSnapshots(INPUT_TEXT);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || Build.snaps.length < 3) finishBuild();
  else { showStep(0); setTimeout(playBuild, 500); }
}

// ── Highlight char in table on hover ──────────
function highlightChar(char) {
  document.querySelectorAll('.code-row').forEach(row => {
    row.classList.toggle('highlighted', row.dataset.char === char);
  });
}
function clearHighlight() {
  document.querySelectorAll('.code-row').forEach(r => r.classList.remove('highlighted'));
}

// ── Animate freq bars on load ──────────────────
window.addEventListener('load', () => {
  document.querySelectorAll('.freq-bar').forEach(bar => {
    const target = bar.style.width;
    bar.style.width = '0%';
    requestAnimationFrame(() => {
      setTimeout(() => { bar.style.width = target; }, 80);
    });
  });
});
