// ===== Jarvis Ops Dashboard — Client =====

const REFRESH_INTERVAL = 30_000;
const API_BASE = '';

// --- Fetching ---

async function apiFetch(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// --- Time helpers ---

function timeAgo(ts) {
  if (!ts) return 'never';
  const now = Date.now();
  let ms;
  if (typeof ts === 'number') {
    ms = ts > 1e12 ? now - ts : now - ts * 1000; // handle s vs ms
  } else {
    ms = now - new Date(ts).getTime();
  }
  if (ms < 0) return 'just now';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTime(ts) {
  if (!ts) return '—';
  try {
    const d = typeof ts === 'string' ? new Date(ts) : new Date(ts * 1000);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return ts;
  }
}

function updateClock() {
  const el = document.getElementById('clock');
  if (el) {
    el.textContent = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  }
}

// --- Simple markdown to HTML ---

function mdToHtml(md) {
  if (!md) return '';
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// --- Renderers ---

function renderModeBadge(mode) {
  const badge = document.getElementById('mode-badge');
  badge.textContent = mode || 'idle';
  badge.className = `badge badge-${mode || 'dim'}`;
}

function renderGatewayBadge(status) {
  const badge = document.getElementById('gateway-badge');
  badge.textContent = `gateway: ${status || 'unknown'}`;
  badge.className = `badge badge-gateway-${status || 'unknown'}`;
}

function renderHeartbeatState(state) {
  // Mode
  const modeEl = document.getElementById('val-mode');
  modeEl.textContent = state.currentMode || 'idle';
  modeEl.className = `big-value mode-${state.currentMode || 'monitor'}`;
  renderModeBadge(state.currentMode);

  // Task
  document.getElementById('val-task').textContent = state.currentTask || 'No active task';

  // Heartbeat time
  document.getElementById('val-heartbeat').textContent = state.lastHeartbeat
    ? timeAgo(state.lastHeartbeat)
    : 'never';
  document.getElementById('val-idle').textContent = state.consecutiveIdleBeats != null
    ? `${state.consecutiveIdleBeats} idle beats`
    : '';

  // Spawns
  const spawns = state.activeSpawns || [];
  document.getElementById('val-spawns').textContent = spawns.length;
  if (spawns.length > 0) {
    document.getElementById('val-spawns-list').innerHTML = spawns
      .map(s => `<div style="font-size:11px;margin-top:2px">• ${esc(s.label || s.task)}</div>`)
      .join('');
  } else {
    document.getElementById('val-spawns-list').textContent = 'none';
  }
}

function renderSystem(system) {
  const el = document.getElementById('val-system');
  if (system.error) {
    el.innerHTML = `<div class="system-row"><span class="system-value" style="color:var(--red)">Error: ${esc(system.error)}</span></div>`;
    return;
  }
  renderGatewayBadge(system.gateway);

  el.innerHTML = `
    <div class="system-row">
      <span class="system-label">Disk</span>
      <span class="system-value">${esc(system.disk?.percent || '?')} used (${esc(system.disk?.available || '?')} free)</span>
    </div>
    <div class="system-row">
      <span class="system-label">Gateway</span>
      <span class="system-value" style="color:${system.gateway === 'running' ? 'var(--green)' : 'var(--red)'}">${esc(system.gateway)}</span>
    </div>
  `;
}

function renderLog(entries) {
  const el = document.getElementById('val-log');
  if (!entries || entries.length === 0) {
    el.innerHTML = '<div class="empty-state">No heartbeat activity yet</div>';
    return;
  }
  el.innerHTML = entries.map(e => `
    <div class="log-entry">
      <span class="log-time">${esc(e.timestamp)}</span>
      <span class="log-mode badge-${e.mode}" style="padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600">${esc(e.mode)}</span>
      <span class="log-action">${esc(e.action)}</span>
    </div>
  `).join('');
}

function renderTodo(sections) {
  const el = document.getElementById('val-todo');
  const keys = Object.keys(sections || {});
  if (keys.length === 0) {
    el.innerHTML = '<div class="empty-state">No tasks</div>';
    return;
  }
  el.innerHTML = keys.map(section => {
    const tasks = sections[section];
    return `
      <div class="task-section">
        <div class="task-section-title">${esc(section)}</div>
        ${tasks.map(t => `
          <div class="task-item">
            <span class="task-status status-${t.status}">${esc(t.status)}</span>
            <span>
              <span class="task-title">${esc(t.title)}</span>
              ${t.detail ? `<span class="task-detail">— ${esc(t.detail)}</span>` : ''}
            </span>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

function renderInsights(insights) {
  const el = document.getElementById('val-insights');
  if (!insights || insights.length === 0) {
    el.innerHTML = '<div class="empty-state">No recent insights</div>';
    return;
  }
  el.innerHTML = insights.map(i => `
    <div class="insight-item">
      <div class="insight-time">${esc(i.timestamp)}</div>
      <div class="insight-text">${esc(i.insight)}</div>
    </div>
  `).join('');
}

function renderResearch(files) {
  const el = document.getElementById('val-research');
  if (!files || files.length === 0) {
    el.innerHTML = '<div class="empty-state">No research files</div>';
    return;
  }
  el.innerHTML = files.map((r, i) => `
    <div>
      <div class="research-item" onclick="toggleResearch(${i})">
        <div>
          <div class="research-title">${esc(r.title)}</div>
          <div class="research-meta">${esc(r.file)} · ${r.wordCount} words · ${timeAgo(r.modified)}</div>
        </div>
      </div>
      <div class="research-detail" id="research-detail-${i}">${esc(r.preview || '')}</div>
    </div>
  `).join('');
}

function toggleResearch(i) {
  const el = document.getElementById(`research-detail-${i}`);
  if (el) el.classList.toggle('open');
}

async function renderCrons() {
  const el = document.getElementById('val-crons');
  try {
    const data = await apiFetch('/api/crons');
    const jobs = data.jobs || data || [];
    if (!Array.isArray(jobs) || jobs.length === 0) {
      el.innerHTML = `<div class="empty-state">${data.note ? esc(data.note) : 'No cron jobs'}</div>`;
      return;
    }
    el.innerHTML = jobs.map(j => {
      const sched = j.schedule;
      let schedStr = '?';
      if (sched?.kind === 'cron') schedStr = sched.expr;
      else if (sched?.kind === 'every') schedStr = `every ${Math.round((sched.everyMs || 0) / 60000)}m`;
      else if (sched?.kind === 'at') schedStr = `at ${new Date(sched.atMs).toLocaleString()}`;

      return `
        <div class="cron-item">
          <span class="cron-enabled ${j.enabled !== false ? 'on' : 'off'}"></span>
          <span class="cron-name">${esc(j.name || j.id || '(unnamed)')}</span>
          <span class="cron-schedule">${esc(schedStr)}</span>
        </div>
      `;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty-state">Could not load cron jobs</div>`;
  }
}

async function renderCuriosity() {
  const el = document.getElementById('val-curiosity');
  try {
    const data = await apiFetch('/api/curiosity');
    if (!data.raw) {
      el.innerHTML = '<div class="empty-state">No curiosity queue</div>';
      return;
    }
    el.innerHTML = `<div class="curiosity-content">${mdToHtml(data.raw)}</div>`;
  } catch {
    el.innerHTML = '<div class="empty-state">Could not load curiosity queue</div>';
  }
}

// --- HTML escape ---

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

// --- Main refresh ---

async function refresh() {
  const dot = document.getElementById('refresh-indicator');
  dot.classList.add('fetching');

  try {
    const [overview, crons, curiosity] = await Promise.all([
      apiFetch('/api/overview'),
      apiFetch('/api/crons').catch(() => null),
      apiFetch('/api/curiosity').catch(() => null),
    ]);

    renderHeartbeatState(overview.heartbeat.state);
    renderLog(overview.heartbeat.log);
    renderTodo(overview.todo);
    renderInsights(overview.insights);
    renderResearch(overview.research);
    renderSystem(overview.system);

    // Crons
    renderCrons();

    // Curiosity
    renderCuriosity();

    document.getElementById('last-updated').textContent =
      `Updated: ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    console.error('Refresh failed:', e);
  } finally {
    dot.classList.remove('fetching');
  }
}

// --- Init ---

updateClock();
setInterval(updateClock, 1000);
refresh();
setInterval(refresh, REFRESH_INTERVAL);
