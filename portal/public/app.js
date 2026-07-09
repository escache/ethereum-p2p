const API = window.location.origin;
const messages = new Map();

// --- Routing (simple SPA) ---
document.querySelectorAll('.nav-item').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const page = el.dataset.page;
    showPage(page);
    history.pushState({}, '', page === 'dashboard' ? '/' : `/${page}`);
  });
});

function showPage(name) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  const pageEl = document.getElementById(`page-${name}`);
  const navEl = document.querySelector(`[data-page="${name}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');
  document.getElementById('page-title').textContent =
    name.charAt(0).toUpperCase() + name.slice(1);
}

const path = window.location.pathname.replace(/^\//, '') || 'dashboard';
showPage(path === '' ? 'dashboard' : path.split('/')[0]);

// --- WebSocket live feed ---
const wsStatus = document.getElementById('ws-status');
const liveFeed = document.getElementById('live-feed');
let ws;

function connectWs() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${window.location.host}/ws`);

  ws.onopen = () => {
    wsStatus.textContent = 'live';
    wsStatus.className = 'status-pill ok';
  };

  ws.onclose = () => {
    wsStatus.textContent = 'offline';
    wsStatus.className = 'status-pill failed';
    setTimeout(connectWs, 2000);
  };

  ws.onmessage = (ev) => {
    const { event, data } = JSON.parse(ev.data);
    if (event === 'connected' && data.messages) {
      data.messages.forEach((m) => upsertMessage(m));
      render();
    }
    if (event === 'message:created' || event === 'message:updated') {
      upsertMessage(data);
      addFeedItem(data);
      render();
    }
    if (event === 'chain:heartbeat') {
      updateStats(data);
    }
  };
}

function upsertMessage(m) {
  messages.set(m.messageId, m);
}

function addFeedItem(m) {
  if (liveFeed.querySelector('.empty')) liveFeed.innerHTML = '';
  const item = document.createElement('div');
  item.className = 'feed-item';
  const time = new Date(m.updatedAt).toLocaleTimeString();
  const eth = (BigInt(m.amount) / 10n ** 18n).toString();
  item.innerHTML = `
    <span class="status-pill ${m.status}">${m.status}</span>
    <div class="feed-body">
      <code>${m.messageId.slice(0, 20)}…</code>
      ${eth} ETH → ${m.recipientOnB.slice(0, 10)}…
    </div>
    <span class="feed-time">${time}</span>
  `;
  liveFeed.prepend(item);
}

function render() {
  const tbody = document.getElementById('messages-tbody');
  const sorted = [...messages.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  document.getElementById('stat-messages').textContent = sorted.length;

  tbody.innerHTML = sorted
    .map((m) => {
      const eth = (BigInt(m.amount) / 10n ** 18n).toString();
      return `<tr>
        <td><span class="status-pill ${m.status}">${m.status}</span></td>
        <td>${m.messageId.slice(0, 22)}…</td>
        <td>${eth} ETH</td>
        <td>${m.recipientOnB.slice(0, 14)}…</td>
        <td>${new Date(m.updatedAt).toLocaleTimeString()}</td>
      </tr>`;
    })
    .join('');
}

function updateStats(data) {
  if (data.chainA) {
    document.getElementById('stat-chain-a').textContent = data.chainA.blockHeight;
    document.getElementById('chain-a-detail').textContent = JSON.stringify(data.chainA, null, 2);
  }
  if (data.chainB) {
    document.getElementById('stat-chain-b').textContent = data.chainB.blockHeight;
    document.getElementById('chain-b-detail').textContent = JSON.stringify(data.chainB, null, 2);
  }
  document.getElementById('stat-relayer').textContent = data.relayerRunning ? 'running' : 'stopped';
}

// --- Health poll ---
async function fetchHealth() {
  try {
    const res = await fetch(`${API}/api/health`);
    const health = await res.json();
    document.getElementById('security-badge').textContent = health.securityModel;
    document.getElementById('setting-api').textContent = API;
    document.getElementById('setting-security').textContent = health.securityModel;
    updateStats({
      chainA: health.chains?.[0],
      chainB: health.chains?.[1],
      relayerRunning: health.relayer,
    });
  } catch {
    document.getElementById('stat-relayer').textContent = 'offline';
  }
}

// --- Demo ---
async function runDemo() {
  const steps = ['step-lock', 'step-relay', 'step-mint'];
  steps.forEach((id) => document.getElementById(id).className = 'demo-step');
  document.getElementById('demo-result').textContent = '';

  document.getElementById('step-lock').classList.add('active');
  const res = await fetch(`${API}/api/demo/lock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const lock = await res.json();
  document.getElementById('step-lock').classList.replace('active', 'done');

  document.getElementById('step-relay').classList.add('active');
  const msg = await waitForStatus(lock.messageId, 'minted');
  document.getElementById('step-relay').classList.replace('active', 'done');
  document.getElementById('step-mint').classList.add('done');

  const result = document.getElementById('demo-result');
  if (msg?.status === 'minted') {
    result.textContent = `✓ MINTED — ${lock.messageId.slice(0, 24)}…`;
  } else {
    result.style.color = 'var(--failed)';
    result.textContent = `✗ Failed: ${msg?.error ?? 'timeout'}`;
  }
}

async function waitForStatus(messageId, target, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await fetch(`${API}/api/messages/${messageId}`);
    if (res.ok) {
      const m = await res.json();
      if (m.status === target || m.status === 'failed') return m;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

document.getElementById('btn-demo').addEventListener('click', runDemo);
document.getElementById('btn-demo-wizard').addEventListener('click', runDemo);

connectWs();
fetchHealth();
setInterval(fetchHealth, 5000);
