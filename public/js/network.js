// Copyright (c) 2026 Janat Yasser. All rights reserved.
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
// drawn at device resolution so traces stay sharp; LW x LH is the size in CSS pixels
let LW = 760, LH = 420;
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  LW = canvas.parentElement.clientWidth - 24;
  LH = Math.round(Math.min(460, Math.max(300, LW * 0.56)));
  canvas.width = LW * dpr; canvas.height = LH * dpr;
  canvas.style.height = LH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawNetwork();
}
window.addEventListener('resize', resizeCanvas);

// ── Look: a circuit board ──────────────────────
// hosts are round copper pads, routers and servers are chips, cables are traces
const C = {
  board: '#FFFFFF', trace: '#D6D3D1', traceHi: '#F59E0B', cut: '#DC2626',
  copper: '#B45309', copperHi: '#B45309', chip: '#1C1917', chipEdge: '#1C1917',
  silk: '#1C1917', silk2: '#57534E', silk3: '#A8A29E', blue: '#16A34A'
};
const NODE_STYLES = {
  host:     { shape: 'pad',  r: 17 },
  router:   { shape: 'chip', w: 46, h: 30 },
  server:   { shape: 'chip', w: 50, h: 34, led: C.blue },
  isp:      { shape: 'chip', w: 52, h: 34 },
  backbone: { shape: 'chip', w: 58, h: 36 }
};
let cutEdges = new Set();          // "A|R1" keys of cables that are down
let trails = [];                   // fading glow where packets have been
const edgeKey = (a, b) => [a, b].sort().join('|');
const isCut = (a, b) => cutEdges.has(edgeKey(a, b));

function scaleFns() {
  const sx = LW / 780, sy = LH / 470;
  return [(x) => x * sx, (y) => y * sy];
}

function drawNetwork() {
  if (!canvas || !ctx) return;
  const [nx, ny] = scaleFns();
  const now = performance.now();
  ctx.clearRect(0, 0, LW, LH);
  ctx.lineCap = 'round';

  // traces
  topo.edges.forEach((edge) => {
    const from = topo.nodes.find((n) => n.id === edge.from);
    const to = topo.nodes.find((n) => n.id === edge.to);
    if (!from || !to) return;
    const x1 = nx(from.x), y1 = ny(from.y), x2 = nx(to.x), y2 = ny(to.y);
    const cut = isCut(edge.from, edge.to);
    const active = highlightedEdges.has(`${edge.from}-${edge.to}`) || highlightedEdges.has(`${edge.to}-${edge.from}`);
    ctx.setLineDash(cut ? [10, 9] : []);
    ctx.strokeStyle = cut ? C.cut : C.trace;
    ctx.lineWidth = cut ? 2 : 2.5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
    if (active && !cut) {
      ctx.save();
      ctx.shadowColor = C.traceHi; ctx.shadowBlur = 10;
      ctx.strokeStyle = C.traceHi; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
    }
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    if (cut) {
      ctx.strokeStyle = C.cut; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(mx - 7, my - 7); ctx.lineTo(mx + 7, my + 7); ctx.moveTo(mx + 7, my - 7); ctx.lineTo(mx - 7, my + 7); ctx.stroke();
    } else {
      ctx.fillStyle = C.silk3;
      ctx.font = '500 12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(edge.weight, mx, my - 9);
    }
  });

  // trails: copper glow that fades over 1.6 s
  trails = trails.filter((t) => now - t.t < 1600);
  trails.forEach((t) => {
    const a = topo.nodes.find((n) => n.id === t.from), b = topo.nodes.find((n) => n.id === t.to);
    if (!a || !b) return;
    const p = Math.min(1, t.p);
    ctx.save();
    ctx.globalAlpha = 1 - (now - t.t) / 1600;
    ctx.strokeStyle = t.color; ctx.lineWidth = 3; ctx.shadowColor = t.color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(nx(a.x), ny(a.y)); ctx.lineTo(nx(a.x) + (nx(b.x) - nx(a.x)) * p, ny(a.y) + (ny(b.y) - ny(a.y)) * p); ctx.stroke();
    ctx.restore();
  });

  // parts
  topo.nodes.forEach((node) => {
    const st = NODE_STYLES[node.type] || NODE_STYLES.router;
    const x = nx(node.x), y = ny(node.y);
    const onPath = highlightedPath.includes(node.id);
    let bottom;
    if (st.shape === 'pad') {
      ctx.beginPath(); ctx.arc(x, y, st.r, 0, Math.PI * 2);
      ctx.fillStyle = onPath ? '#FEF3C7' : '#FFFFFF'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = C.copper; ctx.stroke();
      ctx.fillStyle = C.copper; ctx.font = '600 11px "IBM Plex Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(node.id, x, y + 1);
      bottom = y + st.r;
    } else {
      const w = st.w, h = st.h;
      ctx.fillStyle = node.type === 'server' ? '#16A34A' : C.chip;
      ctx.strokeStyle = onPath ? C.traceHi : 'transparent'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, 7) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 12px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(node.id, x, y + 1);
      bottom = y + h / 2 + 5;
    }
    ctx.fillStyle = onPath ? C.silk : C.silk2;
    ctx.font = '500 12px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(node.label, x, bottom + 5);
  });

  packets.forEach((p) => drawPacket(p, nx, ny));
  ctx.textBaseline = 'alphabetic';
  if (trails.length && !packets.length) requestAnimationFrame(drawNetwork); // let trails fade out
}

// ── A packet in flight: a glowing LED with its TTL ──
function drawPacket(p, nx, ny) {
  const from = topo.nodes.find((n) => n.id === p.fromId);
  const to = topo.nodes.find((n) => n.id === p.toId);
  if (!from || !to) return;
  const x = nx(from.x) + (nx(to.x) - nx(from.x)) * p.progress;
  const y = ny(from.y) + (ny(to.y) - ny(from.y)) * p.progress;
  const g = ctx.createRadialGradient(x, y, 0, x, y, 22);
  g.addColorStop(0, p.color + 'AA'); g.addColorStop(1, p.color + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = p.color; ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 10px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(p.ttl, x, y + .5);
  ctx.textBaseline = 'alphabetic';
}

// ── Click a cable to cut it (or repair it) ──────
function edgeAt(px, py) {
  const [nx, ny] = scaleFns();
  let best = null, bestD = 12;
  topo.edges.forEach((e) => {
    const a = topo.nodes.find((n) => n.id === e.from), b = topo.nodes.find((n) => n.id === e.to);
    const x1 = nx(a.x), y1 = ny(a.y), x2 = nx(b.x), y2 = ny(b.y);
    const L = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / L));
    const d = Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    if (d < bestD && t > .12 && t < .88) { best = e; bestD = d; }
  });
  return best;
}

canvas.addEventListener('click', (ev) => {
  const r = canvas.getBoundingClientRect();
  const e = edgeAt((ev.clientX - r.left) * LW / r.width, (ev.clientY - r.top) * LH / r.height);
  if (!e) return;
  const k = edgeKey(e.from, e.to);
  const down = !cutEdges.has(k);
  if (down) cutEdges.add(k); else cutEdges.delete(k);
  routeCache = {};
  logNote(`${down ? 'Cut' : 'Repaired'} the cable ${e.from} to ${e.to}`, down ? 'dropped' : 'delivered');
  const src = document.getElementById('sourceNode')?.value;
  if (src) updateRoutingTable(src, dijkstra(src));
  drawNetwork();
});
canvas.addEventListener('mousemove', (ev) => {
  const r = canvas.getBoundingClientRect();
  canvas.style.cursor = edgeAt((ev.clientX - r.left) * LW / r.width, (ev.clientY - r.top) * LH / r.height) ? 'pointer' : 'default';
});

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
    if (isCut(e.from, e.to)) return; // that cable is down
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

    // the next cable was cut while we were in flight: re-route from here
    if (isCut(path[hopIdx], path[hopIdx + 1])) {
      const here = path[hopIdx];
      const fresh = dijkstra(here).paths[path[path.length - 1]];
      if (!fresh) {
        stats.dropped++; updateStats();
        logPacket('dropped', pktType, path.slice(0, hopIdx + 1), hopIdx, totalDist, 'no route left');
        highlightedPath = []; highlightedEdges = new Set(); drawNetwork();
        return;
      }
      path = path.slice(0, hopIdx).concat(fresh);
      highlightedPath = path; highlightedEdges = new Set();
      for (let i = 0; i < path.length - 1; i++) { highlightedEdges.add(`${path[i]}-${path[i+1]}`); highlightedEdges.add(`${path[i+1]}-${path[i]}`); }
      logNote(`Packet re-routed at ${here}: ${fresh.join(' → ')}`, 'ttl');
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
    const trail = { from: fromId, to: toId, color: pktType.color, t: performance.now(), p: 0 };
    trails.push(trail);

    const duration = Math.max(200, 800 - (speed - 1) * 80);
    const start    = performance.now();

    function tick(now) {
      const elapsed  = now - start;
      pkt.progress   = Math.min(1, elapsed / duration);
      trail.p = pkt.progress; trail.t = now;
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
  cutEdges        = new Set();
  trails          = [];
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
function logPacket(type, pktType, path, hops, dist, why) {
  const log = document.getElementById('packetLog');
  if (!log) return;

  const empty = log.querySelector('.log-empty');
  if (empty) empty.remove();

  const labels = {
    delivered: { badge: 'DELIVERED', cls: 'plog-delivered badge-delivered' },
    dropped:   { badge: 'DROPPED',   cls: 'plog-dropped   badge-dropped'   },
    ttl:       { badge: 'TTL',       cls: 'plog-ttl       badge-ttl'       }
  };
  const { badge, cls } = labels[type] || labels.delivered;
  const [entryCls, badgeCls] = cls.trim().split(/\s+/);

  const entry = document.createElement('div');
  entry.className = `plog-entry ${entryCls}`;
  entry.innerHTML = `
    <div class="plog-title">
      <span class="plog-badge ${badgeCls}">${badge}</span>
      ${pktType.label}
    </div>
    <div class="plog-path">${path.join(' → ')}, ${hops} hop${hops !== 1 ? 's' : ''}${why ? ', ' + why : `, cost ${dist}`}</div>
  `;

  log.insertBefore(entry, log.firstChild);
  if (log.children.length > 20) log.removeChild(log.lastChild);
}

function logNote(text, kind) {
  const log = document.getElementById('packetLog');
  if (!log) return;
  log.querySelector('.log-empty')?.remove();
  const entry = document.createElement('div');
  entry.className = 'plog-entry';
  entry.innerHTML = `<div class="plog-title"><span class="plog-badge badge-${kind}">${kind === 'dropped' ? 'LINK' : kind === 'ttl' ? 'ROUTE' : 'LINK'}</span>${text}</div>`;
  log.insertBefore(entry, log.firstChild);
}

// Send several packets in a row, to see what loss does to a stream
function sendBurst(n = 10) {
  for (let i = 0; i < n; i++) setTimeout(sendPacket, i * 260);
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
