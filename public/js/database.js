/* =============================================
   DATABASE — Client JS
   Terminal interface for the KV store
   ============================================= */

const input = document.getElementById('terminalInput');
const output = document.getElementById('terminalOutput');
const history = [];
let histIdx = -1;

// ── Boot message ───────────────────────────────
addLine('Ready. Type a command or click a Quick Action above.', 't-info');
addLine('', '');

// ── Keyboard handler ───────────────────────────
input?.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const cmd = input.value.trim();
    if (!cmd) return;
    history.unshift(cmd);
    histIdx = -1;
    input.value = '';
    await runCommand(cmd);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (histIdx < history.length - 1) {
      histIdx++;
      input.value = history[histIdx];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (histIdx > 0) { histIdx--; input.value = history[histIdx]; }
    else { histIdx = -1; input.value = ''; }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    autocomplete(input.value);
  }
});

// ── Autocomplete ───────────────────────────────
const COMMANDS = ['PUT', 'GET', 'DELETE', 'SCAN', 'STATS', 'FLUSH', 'HELP'];
function autocomplete(val) {
  const upper = val.toUpperCase();
  const match = COMMANDS.find(c => c.startsWith(upper));
  if (match) input.value = match + ' ';
}

// ── Run command ────────────────────────────────
async function runCommand(cmd) {
  addLine(`$ ${cmd}`, 't-cmd');

  const parts = cmd.trim().split(/\s+/);
  const op    = parts[0].toUpperCase();

  let body = {};
  switch (op) {
    case 'PUT':
      if (parts.length < 3) { addLine('Usage: PUT <key> <value>', 't-err'); return; }
      body = { op: 'PUT', key: parts[1], value: parts.slice(2).join(' ') };
      break;
    case 'GET':
      if (parts.length < 2) { addLine('Usage: GET <key>', 't-err'); return; }
      body = { op: 'GET', key: parts[1] };
      break;
    case 'DELETE':
    case 'DEL':
      if (parts.length < 2) { addLine('Usage: DELETE <key>', 't-err'); return; }
      body = { op: 'DELETE', key: parts[1] };
      break;
    case 'SCAN':
      body = { op: 'SCAN', prefix: parts[1] || '' };
      break;
    case 'FLUSH':
      body = { op: 'FLUSH' };
      break;
    case 'STATS':
      body = { op: 'STATS' };
      break;
    case 'HELP':
      printHelp();
      return;
    case 'CLEAR':
      output.innerHTML = '';
      return;
    default:
      addLine(`Unknown command: ${op}. Type HELP for usage.`, 't-err');
      return;
  }

  try {
    const res  = await fetch('/database/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    renderResult(op, data);
    if (data.all) updateUI(data.all);
  } catch (err) {
    addLine(`Network error: ${err.message}`, 't-err');
  }

  scrollTerminal();
}

// ── Render result ──────────────────────────────
function renderResult(op, data) {
  if (!data.ok) {
    addLine(`  ERROR: ${data.error}`, 't-err');
    return;
  }

  switch (op) {
    case 'PUT':
      addLine(`  ${data.existed ? 'UPDATED' : 'SET'} ${data.key} = "${data.value}"`, 't-ok');
      break;

    case 'GET':
      addLine(`  "${data.key}"`, 't-key');
      addLine(`   => ${data.value}`, 't-val');
      addLine(`   created: ${fmt(data.createdAt)}  updated: ${fmt(data.updatedAt)}`, 't-ts');
      break;

    case 'DELETE':
      addLine(`  DELETED "${data.key}" (was: ${data.value})`, 't-ok');
      break;

    case 'SCAN':
      if (data.count === 0) {
        addLine('  (no matching keys)', 't-dim');
      } else {
        addLine(`  ${data.count} key(s) found:`, 't-info');
        (data.records || []).forEach(r => {
          addLine(`    ${pad(r.key, 20)} => ${String(r.value).slice(0, 40)}`, 't-val');
        });
      }
      break;

    case 'FLUSH':
      addLine('  All records deleted.', 't-ok');
      break;

    case 'STATS':
      addLine(`  Records:     ${data.count}`, 't-info');
      addLine(`  Total bytes: ${data.totalBytes}`, 't-info');
      addLine(`  Avg bytes:   ${data.avgBytes}`, 't-info');
      addLine(`  File:        data/kvstore.json`, 't-dim');
      break;
  }
  addLine('', '');
}

function printHelp() {
  const lines = [
    ['PUT <key> <value>', 'Insert or update a record'],
    ['GET <key>',         'Retrieve a record by key'],
    ['DELETE <key>',      'Remove a record'],
    ['SCAN [prefix]',     'List keys matching prefix'],
    ['STATS',             'Show database statistics'],
    ['FLUSH',             'Delete all records'],
    ['CLEAR',             'Clear terminal output'],
  ];
  addLine('  Available commands:', 't-info');
  lines.forEach(([cmd, desc]) => {
    addLine(`    ${pad(cmd, 22)} ${desc}`, 't-dim');
  });
  addLine('', '');
}

// ── Update UI table + stats ────────────────────
function updateUI({ records, log }) {
  // Table
  const tbody = document.getElementById('recordsTbody');
  const countEl = document.getElementById('recordCount');
  if (tbody) {
    if (records.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No records yet. Use PUT to add some.</td></tr>';
    } else {
      tbody.innerHTML = records.map(r => `
        <tr class="record-row" id="row-${safeId(r.key)}">
          <td class="key-cell"><code>${esc(r.key)}</code></td>
          <td class="val-cell">${esc(String(r.value).slice(0, 60))}${String(r.value).length > 60 ? '...' : ''}</td>
          <td class="ts-cell">${new Date(r.createdAt).toLocaleTimeString()}</td>
          <td class="ts-cell">${new Date(r.updatedAt).toLocaleTimeString()}</td>
          <td class="action-cell">
            <button class="tbl-btn" onclick="runCommand('GET ${esc(r.key)}')">GET</button>
            <button class="tbl-btn tbl-danger" onclick="runCommand('DELETE ${esc(r.key)}')">DEL</button>
          </td>
        </tr>
      `).join('');
    }
    if (countEl) countEl.textContent = `${records.length} records`;
  }

  // Stats
  const statsRes = { count: records.length, totalBytes: records.reduce((a, r) => a + r.key.length + String(r.value).length, 0) };
  const statEls = {
    statCount: statsRes.count,
    statBytes: `${statsRes.totalBytes} bytes`,
    statAvg:   statsRes.count ? `${Math.round(statsRes.totalBytes / statsRes.count)} bytes` : '0 bytes',
  };
  for (const [id, val] of Object.entries(statEls)) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  const svBar = document.getElementById('svBar');
  if (svBar) svBar.style.width = `${Math.min(100, statsRes.totalBytes / 10)}%`;
  const svBytes = document.getElementById('svBytes');
  if (svBytes) svBytes.textContent = `${statsRes.totalBytes} bytes stored`;

  // Op log
  const logEl = document.getElementById('opLog');
  if (logEl && log) {
    logEl.innerHTML = log.slice(0, 20).map(entry => `
      <div class="log-entry log-${entry.op.toLowerCase()}">
        <span class="log-op">${entry.op}</span>
        <span class="log-key">${esc(entry.key)}</span>
        <span class="log-ts">${new Date(entry.ts).toLocaleTimeString()}</span>
      </div>
    `).join('') || '<div class="log-empty">No operations yet</div>';
  }
}

// ── Flush confirm ──────────────────────────────
function confirmFlush() {
  if (confirm('Delete ALL records? This cannot be undone.')) runCommand('FLUSH');
}

// ── Helpers ────────────────────────────────────
function addLine(text, cls) {
  const div = document.createElement('div');
  div.className = `t-output-line ${cls}`;
  div.textContent = text;
  output.appendChild(div);
}

function scrollTerminal() {
  const body = document.getElementById('terminalBody');
  if (body) body.scrollTop = body.scrollHeight;
}

function fmt(ts) {
  return ts ? new Date(ts).toLocaleString() : '—';
}

function pad(str, len) {
  return str.padEnd(len, ' ');
}

function safeId(key) {
  return key.replace(/[^a-zA-Z0-9]/g, '_');
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Focus terminal input on page load
document.addEventListener('DOMContentLoaded', () => {
  input?.focus();
});
