const fs = require('fs');
const path = require('path');
const cluster = require('cluster');
const { createClient } = require('redis');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

// ---- Load balancing (cluster) ----------------------------------------------
// Workers all bind the SAME port (Linux round-robin accept), so nginx, PHP
// /emit and systemd need no changes. A Redis adapter fans out room emits
// across workers so every subscriber is reached exactly once.
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const numWorkers = Math.max(1, Math.min(12, parseInt(process.env.WS_WORKERS || '2', 10) || 2));

async function redisReachable() {
  try {
    const probe = createClient({ url: REDIS_URL, socket: { connectTimeout: 1500 } });
    await probe.connect();
    await probe.disconnect();
    return true;
  } catch (err) {
    return false;
  }
}

(async function main() {
  if (cluster.isPrimary) {
    const ok = await redisReachable();
    const workers = ok ? numWorkers : 1;
    if (!ok) console.warn(`Redis unreachable (${REDIS_URL}); running a single, non-clustered worker`);
    for (let i = 0; i < workers; i++) cluster.fork();
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} exited (${signal || code}); respawning`);
      cluster.fork();
    });
  } else {
    runServer();
  }
})();

async function runServer() {
  const app = express();
  const server = http.createServer(app);
  const io = socketIo(server, {
    // Polling-free by design: every consumer connects over a real WebSocket
    // (monitors and controllers both). Saves the handshake churn + duplicate
    // HTTP connections long-polling causes through the nginx proxy.
    transports: ['websocket'],
    // Replay emits missed during a brief drop so monitors don't go stale.
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
    cors: {
      // Restrict via ALLOWED_ORIGINS env (comma-separated). Default stays open
      // because LAN kiosk/display browsers connect from various hostnames/IPs.
      origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : "*",
    },
  });

  // Cross-worker room fan-out. Fail-open: if the adapter cannot attach, the
  // worker keeps serving standalone (single-worker mode is a safe baseline).
  (async () => {
    try {
      const { createAdapter } = require('@socket.io/redis-adapter');
      const pub = createClient({ url: REDIS_URL });
      const sub = pub.duplicate();
      await Promise.all([pub.connect(), sub.connect()]);
      io.adapter(createAdapter(pub, sub));
      console.log(`Worker ${process.pid}: Redis adapter attached`);
    } catch (err) {
      console.error(`Worker ${process.pid}: Redis adapter unavailable (${err.message}); serving standalone`);
    }
  })();

  // Optional shared secret for PHP->server emits and the diagnostics endpoints.
  const EMIT_TOKEN = process.env.EMIT_TOKEN || '';
  function checkEmitToken(req, res, next) {
    if (!EMIT_TOKEN) return next();
const got = req.query.token || req.headers['x-emit-token'] || req.body?.token || req.body?.payload?._token;
  if (got !== EMIT_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  next();
}

  // Redact auth tokens from log output so the emit secret never leaks to the journal.
  function redactSecrets(v) {
    if (v == null || typeof v !== 'object') return v;
    const out = { ...v };
    for (const k of ['token', '_token', 'x-emit-token']) {
      if (out[k] !== undefined) out[k] = typeof out[k] === 'string' ? '[REDACTED('.concat(out[k].length, ')]') : '[REDACTED]';
    }
    return out;
  }

  app.use(cors());

  // ---- Room-scoped delivery ------------------------------------------------
  // Clients subscribe to the department ids they display; every emit is routed
  // only to the rooms whose dept it belongs to. Unknown/no dept -> broadcast so
  // nothing is ever silently lost.
  function resolveRooms(payload) {
    const dept = payload && payload.dept != null ? payload.dept
      : payload && payload.department_id != null ? payload.department_id : null;
    if (dept === null || dept === undefined || dept === '' || dept === 'all') return null;
    if (Array.isArray(dept)) return dept.map(d => 'dept:' + Number(d)).filter(Boolean);
    const n = Number(dept);
    return Number.isFinite(n) ? ['dept:' + n] : null;
  }
  function deliver(event, payload) {
    const rooms = resolveRooms(payload);
    if (rooms) {
      rooms.forEach(room => io.to(room).emit(event, payload));
    } else {
      io.emit(event, payload);
    }
  }

  io.on('connection', (socket) => {
    socket.data.depts = [];
    socket.data.page = 'unknown';
    socket.data.label = null;
    socket.data.connectedAt = Date.now();

    // Client tells us which department cards it displays; rooms are scoped to
    // those depts so emits reach only interested clients.
    socket.on('subscribe', ({ depts, page, label } = {}) => {
      const next = new Set();
      (Array.isArray(depts) ? depts : []).forEach(d => {
        const n = Number(d);
        if (Number.isFinite(n)) next.add(n);
      });
      socket.data.depts.forEach(old => { if (!next.has(old)) socket.leave('dept:' + old); });
      next.forEach(n => { if (!socket.data.depts.includes(n)) socket.join('dept:' + n); });
      socket.data.depts = [...next];
      if (page === 'live' || page === 'controller') socket.data.page = page;
      if (typeof label === 'string' && label.trim()) socket.data.label = label.trim().slice(0, 120);
      socket.emit('subscribed', { worker: process.pid, depts: socket.data.depts });
    });

    socket.on('disconnect', () => {});
  });

  function remoteIp(socket) {
    const h = socket.handshake.headers || {};
    return h['x-real-ip'] || (h['x-forwarded-for'] ? String(h['x-forwarded-for']).split(',')[0].trim() : '') || socket.handshake.address || 'unknown';
  }
  async function allSockets() {
    try { return await io.fetchSockets(); } catch (err) { return []; }
  }

  // ---- Diagnostics: query every connection across the cluster --------------
  app.get('/stats', checkEmitToken, async (req, res) => {
    const sockets = await allSockets();
    const byPage = {}, byDept = {};
    sockets.forEach(s => {
      const p = s.data.page || 'unknown';
      byPage[p] = (byPage[p] || 0) + 1;
      (s.data.depts || []).forEach(d => { byDept[d] = (byDept[d] || 0) + 1; });
    });
    res.json({
      workers: cluster.isWorker ? 1 : undefined,
      pid: process.pid,
      uptime_s: Math.round(process.uptime()),
      socketIoVersion: JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules', 'socket.io', 'package.json'), 'utf8')).version,
      connections: sockets.length,
      by_page: byPage,
      by_dept: Object.keys(byDept).sort((a, b) => a - b).reduce((o, k) => { o[k] = byDept[k]; return o; }, {}),
      memory: process.memoryUsage(),
    });
  });

  app.get('/clients', checkEmitToken, async (req, res) => {
    const sockets = await allSockets();
    res.json(sockets.map(s => ({
      id: s.id,
      worker_pid: process.pid,
      page: s.data.page || 'unknown',
      label: s.data.label || null,
      depts: s.data.depts || [],
      ip: remoteIp(s),
      transport: s.conn && s.conn.transport ? s.conn.transport.name : 'unknown',
      connected_at: s.data.connectedAt || null,
    })));
  });

  app.get('/rooms', checkEmitToken, async (req, res) => {
    const sockets = await allSockets();
    const rooms = {};
    sockets.forEach(s => (s.data.depts || []).forEach(d => { rooms[d] = (rooms[d] || 0) + 1; }));
    res.json({ dept_rooms: rooms });
  });

  // --- Handle PHP trigger ---
  app.get('/emit', checkEmitToken, (req, res) => {
    const event = req.query.event || 'queue-updated';
    const dept = req.query.dept || 'all';
    console.log(`📢 [GET] Emitting ${event} to`, dept);
    deliver(event, { dept });
    res.json({ message: 'Event emitted successfully (GET)' });
  });

  app.post('/emit', express.json(), checkEmitToken, (req, res) => {
    const event = req.body?.event || 'queue-updated';
    const payload = req.body?.payload ?? req.body ?? {};
    console.log('📢 [POST] Emitting', event, 'payload:', redactSecrets(payload));
    deliver(event, payload);
    res.json({ message: 'Event emitted successfully (POST)' });
  });

  // --- Start server ---
  const PORT = process.env.PORT || 3000;
  // Bind loopback by default: only the nginx proxy (and PHP emits on this host)
  // should reach the relay, so /emit and /stats are never exposed on the LAN.
  const BIND_ADDR = process.env.BIND_ADDR || '127.0.0.1';
  server.listen(PORT, BIND_ADDR, () => {
    console.log(`🚀 Socket.IO worker ${process.pid} listening on ${BIND_ADDR}:${PORT}`);
  });
}