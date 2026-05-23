/* =============================================
   NETWORK VISUALIZER — Client JS
   Canvas-based with Dijkstra routing,
   animated packet travel, TTL, packet loss
   ============================================= */

const canvas  = document.getElementById('networkCanvas');
const ctx     = canvas.getContext('2d');

// ── State ──────────────────────────────────────
let topo        = TOPOLOGY;
let selectedPkt = PACKET_TYPES[0];
let packets     = [];   // active animated packets
let animId      = null;
let stats       = { sent: 0, delivered: 0, dropped: 0, ttl: 0, totalHops: 0, deliveredCount: 0 };
let routeCache  = {};   // Dijkstra results
let highlightedEdges = new Set();
let highlightedPath  = [];

// ── Canvas sizing ──────────────────────────────
function resizeCanvas() {
  const wrap = canvas.parentElement;
  canvas.width  = wrap.clientWidth  - 24;
  canvas.height = 400;
  drawNetwork();
}
window.addEventListener('resize', resizeCanvas);

// ── Node type styles ───────────────────────────
const NODE_STYLES = {
  host:     { fill: '#3b82f6', stroke: '#1d4ed8', r: 20, label: '#fff' },
  router:   { fill: '#93c5fd', stroke: '#3b82f6', r: 16, label: '#1e40af' },
  server:   { fill: '#059669', stroke: '#047857', r: 20, label: '#fff' },
  isp:      { fill: '#8b5cf6', stroke: '#6d28d9', r: 18, label: '#fff' },
  backbone: { fill: '#f59e0b', stroke: '#d97706', r: 18, label: '#fff' }
};

// ── Draw the network ───────────────────────────
function drawNetwork() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Scale node positions to canvas size
  const scaleX = canvas.width  / 780;
  const scaleY = canvas.height / 470;

  function nx(x) { return x * scaleX; }
  function ny(y) { return y * scaleY; }

  // Draw edges
  topo.edges.forEach(edge => {
    const from = topo.nodes.find(n => n.id === edge.from);
    const to   = topo.nodes.find(n => n.id === edge.to);
    if (!from || !to) return;

    const isActive = highlightedEdges.has(`${edge.from}-${edge.to}`) ||
                     highlightedEdges.has(`${edge.to}-${edge.from}`);

    ctx.beginPath();
    ctx.moveTo(nx(from.x), ny(from.y));
    ctx.lineTo(nx(to.x),   ny(to.y));
    ctx.strokeStyle = isActive ? '#10b981' : '#cbd5e1';
    ctx.lineWidth   = isActive ? 3 : 1.5;
    ctx.setLineDash(isActive ? [] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    // Edge weight label
    const mx = (nx(from.x) + nx(to.x)) / 2;
    const my = (ny(from.y) + ny(to.y)) / 2;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(edge.weight, mx, my - 5);
  });

  // Draw nodes
  topo.nodes.forEach(node => {
    const style   = NODE_STYLES[node.type] || NODE_STYLES.router;
    const x = nx(node.x);
    const y = ny(node.y);
    const isOnPath = highlightedPath.includes(node.id);

    // Glow if on path
    if (isOnPath) {
      ctx.beginPath();
      ctx.arc(x, y, style.r + 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16,185,129,0.15)';
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(x, y, style.r, 0, Math.PI * 2);
    ctx.fillStyle   = isOnPath ? '#10b981' : style.fill;
    ctx.strokeStyle = isOnPath ? '#047857' : style.stroke;
    ctx.lineWidth   = 2.5;
    ctx.fill();
    ctx.stroke();

    // Node label inside
    ctx.fillStyle  = isOnPath ? '#fff' : style.label;
    ctx.font       = `700 10px Inter, sans-serif`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.id, x, y);

    // Node name below
    ctx.fillStyle    = '#475569';
    ctx.font         = '11px Inter, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(node.label, x, y + style.r + 5);
  });

  // Draw active packets
  packets.forEach(p => drawPacket(p, nx, ny));

  ctx.textBaseline = 'alphabetic';
}

// ── Draw a packet in transit ───────────────────
function drawPacket(p, nx, ny) {
  const from = topo.nodes.find(n => n.id === p.fromId);
  const to   = topo.nodes.find(n => n.id === p.toId);
  if (!from || !to) return;

  const x = nx(from.x) + (nx(to.x) - nx(from.x)) * p.progress;
  const y = ny(from.y) + (ny(to.y) - ny(from.y)) * p.progress;

  // Shadow
  ctx.beginPath();
  ctx.arc(x, y + 3, 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fill();

  // Packet dot
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle   = p.color;
  ctx.strokeStyle = 'white';
  ctx.lineWidth   = 2;
  ctx.fill();
  ctx.stroke();

  // TTL label
  ctx.fillStyle    = 'white';
  ctx.font         = '700 8px JetBrains Mono, monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.ttl, x, y);
  ctx.textBaseline = 'alphabetic';
}

// ── Dijkstra's Algorithm ───────────────────────
function dijkstra(sourceId) {
  const dist  = {};
  const prev  = {};
  const visited = new Set();
  const nodes = topo.nodes.map(n => n.id);

  nodes.forEach(id => { dist[id] = Infinity; prev[id] = null; });
  dist[sourceId] = 0;

  // Build adjacency
  const adj = {};
  nodes.forEach(id => { adj[id] = []; });
  topo.edges.forEach(e => {
    adj[e.from].push({ to: e.to, w: e.weight });
    adj[e.to].push({ to: e.from, w: e.weight });
  });

  while (visited.size < nodes.length) {
    // Pick unvisited with min dist
    let u = null;
    nodes.forEach(id => {
      if (!visited.has(id) && (u === null || dist[id] < dist[u])) u = id;
    });
    if (u === null || dist[u] === Infinity) break;
    visited.add(u);

    adj[u].forEach(({ to, w }) => {
      const alt = dist[u] + w;
      if (alt < dist[to]) {
        dist[to] = alt;
        prev[to]  = u;
      }
    });
  }

  // Reconstruct paths
  const paths = {};
  nodes.forEach(id => {
    if (id === sourceId) { paths[id] = [sourceId]; return; }
    const path = [];
    let cur = id;
    while (cur) { path.unshift(cur); cur = prev[cur]; }
    paths[id] = path[0] === sourceId ? path : null;
  });

  return { dist, prev, paths };
}

// ── Send a packet ──────────────────────────────
function sendPacket() {
  const srcId  = document.getElementById('sourceNode')?.value;
  const dstId  = document.getElementById('destNode')?.value;
  const loss   = parseInt(document.getElementById('lossRate')?.value || '0');

  if (!srcId || !dstId || srcId === dstId) {
    showOverlay('Select different source and destination nodes.');
    setTimeout(hideOverlay, 2000);
    return;
  }

  const key = srcId;
  if (!routeCache[key]) routeCache[key] = dijkstra(srcId);
  const { dist, paths } = routeCache[key];

  const path = paths[dstId];
  if (!path || path.length < 2) {
    showOverlay('No path found between these nodes.');
    setTimeout(hideOverlay, 2000);
    return;
  }

  // Update routing table
  updateRoutingTable(srcId, routeCache[key]);

  // Highlight the path
  highlightedPath  = path;
  highlightedEdges = new Set();
  for (let i = 0; i < path.length - 1; i++) {
    highlightedEdges.add(`${path[i]}-${path[i+1]}`);
    highlightedEdges.add(`${path[i+1]}-${path[i]}`);
  }

  stats.sent++;
  updateStats();

  const speed = parseInt(document.getElementById('animSpeed')?.value || '5');
  animatePacketAlongPath(path, selectedPkt, loss, dist[dstId], speed);
}

// ── Animate packet hop by hop ──────────────────
function animatePacketAlongPath(path, pktType, lossRate, totalDist, speed) {
  let hopIdx = 0;
  let ttl    = pktType.ttl;
  const hopLog = [];

  function nextHop() {
    if (hopIdx >= path.length - 1) {
      // Delivered!
      stats.delivered++;
      stats.totalHops += hopLog.length;
      stats.deliveredCount++;
      updateStats();
      logPacket('delivered', pktType, path, hopLog.length, totalDist);
      setTimeout(() => {
        highlightedPath  = [];
        highlightedEdges = new Set();
        drawNetwork();
      }, 1200);
      return;
    }

    // TTL check
    if (ttl <= 0) {
      stats.ttl++;
      updateStats();
      logPacket('ttl', pktType, path.slice(0, hopIdx + 1), hopIdx, totalDist);
      highlightedPath  = [];
      highlightedEdges = new Set();
      drawNetwork();
      return;
    }

    // Loss check
    if (lossRate > 0 && Math.random() * 100 < lossRate) {
      stats.dropped++;
      updateStats();
      logPacket('dropped', pktType, path.slice(0, hopIdx + 1), hopIdx, totalDist);
      highlightedPath  = [];
      highlightedEdges = new Set();
      drawNetwork();
      return;
    }

    const fromId = path[hopIdx];
    const toId   = path[hopIdx + 1];
    ttl--;
    hopLog.push(toId);
    hopIdx++;

    // Animate this hop
    const pkt = {
      fromId,
      toId,
      color:    pktType.color,
      progress: 0,
      ttl
    };
    packets.push(pkt);

    const duration = Math.max(200, 800 - (speed - 1) * 80);
    const start    = performance.now();

    function tick(now) {
      const elapsed  = now - start;
      pkt.progress   = Math.min(1, elapsed / duration);
      drawNetwork();

      if (pkt.progress < 1) {
        requestAnimationFrame(tick);
      } else {
        packets.splice(packets.indexOf(pkt), 1);
        drawNetwork();
        setTimeout(nextHop, 80);
      }
    }
    requestAnimationFrame(tick);
  }

  nextHop();
}

// ── Routing table ──────────────────────────────
function updateRoutingTable(srcId, result) {
  const tbody = document.getElementById('routingTbody');
  if (!tbody) return;

  const rows = topo.nodes
    .filter(n => n.id !== srcId)
    .map(n => {
      const path = result.paths[n.id];
      const dist = result.dist[n.id];
      const nextHop = path && path.length > 1 ? path[1] : '—';
      return `
        <tr>
          <td><strong>${n.label}</strong> (${n.id})</td>
          <td><code>${nextHop}</code></td>
          <td><code>${path ? path.join(' → ') : 'unreachable'}</code></td>
          <td>${dist === Infinity ? '∞' : dist}</td>
        </tr>
      `;
    });
  tbody.innerHTML = rows.join('');
}

// ── Packet type selection ──────────────────────
function selectPacketType(id) {
  selectedPkt = PACKET_TYPES.find(p => p.id === id) || PACKET_TYPES[0];
  document.querySelectorAll('.packet-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === id);
  });
}

// ── Topology switching ─────────────────────────
function loadTopology(id) {
  window.location.href = `/network?topo=${id}`;
}

// ── Reset ──────────────────────────────────────
function resetNetwork() {
  packets         = [];
  highlightedPath  = [];
  highlightedEdges = new Set();
  routeCache      = {};
  stats           = { sent: 0, delivered: 0, dropped: 0, ttl: 0, totalHops: 0, deliveredCount: 0 };
  updateStats();
  clearLog();
  hideOverlay();
  drawNetwork();
}

// ── Stats ──────────────────────────────────────
function updateStats() {
  setText('statSent',      stats.sent);
  setText('statDelivered', stats.delivered);
  setText('statDropped',   stats.dropped);
  setText('statTTL',       stats.ttl);
  setText('statHops',      stats.deliveredCount
    ? (stats.totalHops / stats.deliveredCount).toFixed(1)
    : '—');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Packet log ──────────────────────────────────
function logPacket(type, pktType, path, hops, dist) {
  const log = document.getElementById('packetLog');
  if (!log) return;

  const empty = log.querySelector('.log-empty');
  if (empty) empty.remove();

  const labels = {
    delivered: { badge: 'DELIVERED', cls: 'plog-delivered badge-delivered' },
    dropped:   { badge: 'DROPPED',   cls: 'plog-dropped   badge-dropped'   },
    ttl:       { badge: 'TTL EXPIRE',cls: 'plog-ttl       badge-ttl'       }
  };
  const { badge, cls } = labels[type] || labels.delivered;
  const [badgeCls, entryCls] = cls.trim().split(/\s+/);

  const entry = document.createElement('div');
  entry.className = `plog-entry ${entryCls}`;
  entry.innerHTML = `
    <div class="plog-title">
      <span class="plog-badge ${badgeCls}">${badge}</span>
      ${pktType.label}
    </div>
    <div class="plog-path">${path.join(' → ')} &nbsp;·&nbsp; ${hops} hop${hops !== 1 ? 's' : ''} &nbsp;·&nbsp; cost ${dist}</div>
  `;

  log.insertBefore(entry, log.firstChild);
  if (log.children.length > 20) log.removeChild(log.lastChild);
}

function clearLog() {
  const log = document.getElementById('packetLog');
  if (log) log.innerHTML = '<div class="log-empty">No packets sent yet</div>';
}

// ── Overlay ────────────────────────────────────
function showOverlay(msg) {
  const o = document.getElementById('canvasOverlay');
  const m = document.getElementById('overlayMsg');
  if (o) o.style.display = 'flex';
  if (m) m.textContent   = msg;
}
function hideOverlay() {
  const o = document.getElementById('canvasOverlay');
  if (o) o.style.display = 'none';
}

// ── Init ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  drawNetwork();

  // Set correct initial packet button
  document.querySelectorAll('.packet-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === 0);
  });
});
