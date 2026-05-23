/* =============================================
   COMPRESSION — Client JS
   Renders the Huffman tree as SVG and handles
   sample text injection + char counter
   ============================================= */

// ── Sample texts ───────────────────────────────
const SAMPLES = {
  lorem: `The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!`,
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

// ── Tree renderer ──────────────────────────────
if (typeof TREE_DATA !== 'undefined' && TREE_DATA) {
  renderHuffmanTree(TREE_DATA, CODE_TABLE);
}

function renderHuffmanTree(root, codeTable) {
  const svg = document.getElementById('huffmanTree');
  if (!svg || !root) return;

  const NODE_R   = 22;
  const H_GAP    = 48;
  const V_GAP    = 70;
  const PAD      = 40;

  // ── Layout: assign (x, y) via in-order traversal ──
  let counter = 0;
  function assignX(node) {
    if (!node) return;
    assignX(node.left);
    node._x = counter++;
    assignX(node.right);
  }
  assignX(root);

  const total  = counter;
  const depth  = getDepth(root);
  const W      = Math.max(total * H_GAP + PAD * 2, 500);
  const H      = depth * V_GAP + PAD * 2 + NODE_R * 2;

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width',  W);
  svg.setAttribute('height', H);
  svg.innerHTML = '';

  const xStep  = (W - PAD * 2) / Math.max(total - 1, 1);

  function pos(node, d) {
    return {
      x: PAD + node._x * xStep,
      y: PAD + NODE_R + d * V_GAP
    };
  }

  // ── Draw edges first ───────────────────────────
  function drawEdges(node, depth) {
    if (!node) return;
    if (node.left) {
      const p = pos(node, depth);
      const c = pos(node.left,  depth + 1);
      const line = makeSVG('line', {
        x1: p.x, y1: p.y, x2: c.x, y2: c.y,
        stroke: '#bfdbfe', 'stroke-width': 2,
        class: 'tree-edge-line'
      });
      svg.appendChild(line);

      // Edge label "0"
      const lx = (p.x + c.x) / 2 - 10;
      const ly = (p.y + c.y) / 2;
      svg.appendChild(edgeLabel('0', lx, ly, '#60a5fa'));

      drawEdges(node.left,  depth + 1);
    }
    if (node.right) {
      const p = pos(node, depth);
      const c = pos(node.right, depth + 1);
      const line = makeSVG('line', {
        x1: p.x, y1: p.y, x2: c.x, y2: c.y,
        stroke: '#3b82f6', 'stroke-width': 2,
        class: 'tree-edge-line'
      });
      svg.appendChild(line);

      const lx = (p.x + c.x) / 2 + 4;
      const ly = (p.y + c.y) / 2;
      svg.appendChild(edgeLabel('1', lx, ly, '#1d4ed8'));

      drawEdges(node.right, depth + 1);
    }
  }

  // ── Draw nodes ─────────────────────────────────
  function drawNodes(node, depth) {
    if (!node) return;
    const { x, y } = pos(node, depth);
    const isLeaf    = node.isLeaf;

    const g = makeSVG('g', { class: 'tree-node-g', 'data-char': node.char || '' });

    // Circle
    const circle = makeSVG('circle', {
      cx: x, cy: y, r: NODE_R,
      fill:   isLeaf ? '#3b82f6' : '#dbeafe',
      stroke: isLeaf ? '#1d4ed8' : '#93c5fd',
      'stroke-width': 2,
      class: 'tree-node-circle'
    });
    g.appendChild(circle);

    // Char label (leaf) or freq (internal)
    const label = isLeaf
      ? (node.char === ' ' ? 'SPC' : node.char === '\n' ? 'NL' : node.char)
      : String(node.freq);

    const text = makeSVG('text', {
      x, y: y + 1,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: isLeaf ? 'white' : '#1d4ed8',
      'font-size': isLeaf && label.length > 1 ? '9' : '11',
      'font-weight': '700',
      'font-family': 'JetBrains Mono, monospace',
      'pointer-events': 'none'
    });
    text.textContent = label;
    g.appendChild(text);

    // Freq label below leaf
    if (isLeaf) {
      const freq = makeSVG('text', {
        x, y: y + NODE_R + 12,
        'text-anchor': 'middle',
        fill: '#64748b',
        'font-size': '9',
        'font-family': 'JetBrains Mono, monospace',
        'pointer-events': 'none'
      });
      freq.textContent = node.freq;
      g.appendChild(freq);
    }

    // Hover highlight
    if (isLeaf && node.char !== null) {
      g.style.cursor = 'pointer';
      g.addEventListener('mouseenter', () => highlightChar(node.char));
      g.addEventListener('mouseleave', clearHighlight);
    }

    svg.appendChild(g);
    drawNodes(node.left,  depth + 1);
    drawNodes(node.right, depth + 1);
  }

  drawEdges(root, 0);
  drawNodes(root, 0);
}

function getDepth(node) {
  if (!node) return 0;
  return 1 + Math.max(getDepth(node.left), getDepth(node.right));
}

function edgeLabel(text, x, y, color) {
  const t = makeSVG('text', {
    x, y,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    fill: color,
    'font-size': '10',
    'font-weight': '700',
    'font-family': 'JetBrains Mono, monospace'
  });
  t.textContent = text;
  return t;
}

function makeSVG(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
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
