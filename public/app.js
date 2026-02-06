// ===== Jarvis Ops Dashboard — Client =====

const REFRESH_INTERVAL = 30_000;
const API_BASE = '';

// Store full data for drill-down
let cachedData = {};

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
    ms = ts > 1e12 ? now - ts : now - ts * 1000;
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

function updateClock() {
  const el = document.getElementById('clock');
  if (el) {
    el.textContent = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  }
}

// --- Markdown to HTML with links ---

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
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>')
    .replace(/\n/g, '<br>');
}

// --- Modal for detailed view ---

function showModal(title, content, isMarkdown = false) {
  // Remove existing modal
  const existing = document.getElementById('detail-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'detail-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>${esc(title)}</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body ${isMarkdown ? 'markdown-content' : ''}">
        ${isMarkdown ? mdToHtml(content) : esc(content)}
      </div>
    </div>
  `;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('open'), 10);
}

function closeModal() {
  const modal = document.getElementById('detail-modal');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => modal.remove(), 200);
  }
}

// --- Renderers ---

function renderMoodBadge(mood) {
  const badge = document.getElementById('mood-badge');
  badge.textContent = `${mood.emoji} ${mood.mood}`;
  badge.className = `badge badge-mood mood-${mood.mood}`;
}

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

function renderMood(mood) {
  if (!mood) return;
  
  document.getElementById('mood-emoji').textContent = mood.emoji;
  document.getElementById('mood-title').textContent = mood.mood.charAt(0).toUpperCase() + mood.mood.slice(1);
  document.getElementById('mood-desc').textContent = mood.description;
  
  const thoughtEl = document.getElementById('latest-thought');
  if (mood.lastInsight) {
    thoughtEl.textContent = mood.lastInsight.text;
    thoughtEl.style.cursor = 'pointer';
    thoughtEl.onclick = () => {
      const fullInsight = cachedData.insights?.find(i => i.timestamp === mood.lastInsight.timestamp);
      showModal('Latest Insight', fullInsight?.insight || mood.lastInsight.text);
    };
  } else {
    thoughtEl.textContent = 'No recent insights';
    thoughtEl.style.cursor = 'default';
    thoughtEl.onclick = null;
  }
  
  renderMoodBadge(mood);
  renderModeBadge(mood.mode);
}

function renderHeartbeatState(state, mood) {
  const hbEl = document.getElementById('val-heartbeat');
  hbEl.textContent = state.lastHeartbeat ? timeAgo(state.lastHeartbeat) : 'never';
  hbEl.style.cursor = 'pointer';
  hbEl.onclick = () => {
    const checks = state.lastChecks || {};
    const checkList = Object.entries(checks)
      .filter(([_, ts]) => ts)
      .sort(([, a], [, b]) => (b || 0) - (a || 0))
      .map(([name, ts]) => `• ${name}: ${timeAgo(ts)}`)
      .join('\n');
    showModal('Heartbeat Details', `Last Beat: ${timeAgo(state.lastHeartbeat)}\nMode: ${state.currentMode || 'idle'}\nTask: ${state.currentTask || 'none'}\nIdle Beats: ${state.consecutiveIdleBeats || 0}\n\nLast Checks:\n${checkList || 'none'}`);
  };
  
  document.getElementById('val-idle').textContent = mood?.stats?.idleBeats != null 
    ? `${mood.stats.idleBeats} idle beats` : '';

  const spawns = state.activeSpawns || [];
  document.getElementById('val-spawns').textContent = spawns.length;
  const spawnsList = document.getElementById('val-spawns-list');
  if (spawns.length > 0) {
    spawnsList.innerHTML = spawns
      .map((s, i) => `<div class="spawn-item" onclick="showSpawnDetail(${i})">${esc(s.label || s.task?.slice(0, 30) || 'spawn')}</div>`)
      .join('');
  } else {
    spawnsList.textContent = 'none';
  }
}

window.showSpawnDetail = function(i) {
  const spawn = cachedData.heartbeat?.state?.activeSpawns?.[i];
  if (spawn) {
    showModal('Active Spawn', `Label: ${spawn.label || 'none'}\nTask: ${spawn.task || 'unknown'}\nStarted: ${spawn.started ? timeAgo(spawn.started) : 'unknown'}`);
  }
};

function renderSystem(system) {
  const el = document.getElementById('val-system');
  if (system.error) {
    el.innerHTML = `<div class="system-row error">${esc(system.error)}</div>`;
    return;
  }
  renderGatewayBadge(system.gateway);

  const watcherStatus = system.watcher?.status || 'offline';
  const watcherUptime = system.watcher?.uptime ? `${Math.round(system.watcher.uptime / 60)}m` : '—';
  const memFree = system.memory?.freeGB ? `${system.memory.freeGB}GB` : 
                  (system.memory?.percentFree ? `${system.memory.percentFree}%` : '?');
  const load = system.load ? system.load[0] : '?';

  el.innerHTML = `
    <div class="system-row clickable" onclick="showSystemDetail()">
      <span class="system-label">Disk</span>
      <span class="system-value">${esc(system.disk?.percent || '?')}</span>
    </div>
    <div class="system-row clickable" onclick="showSystemDetail()">
      <span class="system-label">Memory</span>
      <span class="system-value">${memFree}</span>
    </div>
    <div class="system-row clickable" onclick="showSystemDetail()">
      <span class="system-label">Load</span>
      <span class="system-value">${load}</span>
    </div>
    <div class="system-row clickable" onclick="showSystemDetail()">
      <span class="system-label">Watcher</span>
      <span class="system-value" style="color:${watcherStatus === 'running' ? 'var(--green)' : 'var(--red)'}">
        ${watcherStatus === 'running' ? '✓' : '✗'} ${watcherUptime}
      </span>
    </div>
  `;
}

window.showSystemDetail = function() {
  const s = cachedData.system;
  if (!s) return;
  const content = `Uptime: ${s.uptime || 'unknown'}

Disk:
  Total: ${s.disk?.total || '?'}
  Used: ${s.disk?.used || '?'} (${s.disk?.percent || '?'})
  Free: ${s.disk?.available || '?'}

Memory:
  Free: ${s.memory?.freeGB || '?'} GB (${s.memory?.percentFree || '?'}%)

CPU Load: ${s.load ? s.load.join(' / ') : 'unknown'}
Processes: ${s.processes || '?'}

Gateway: ${s.gateway || 'unknown'}
Watcher: ${s.watcher?.status || 'offline'} (uptime: ${s.watcher?.uptime ? Math.round(s.watcher.uptime / 60) + 'm' : '—'})
  Failures: ${s.watcher?.failures || 0}
  Heartbeat Stale: ${s.watcher?.heartbeat?.stale ? 'YES' : 'no'}`;
  showModal('System Details', content);
};

function renderWritings(writings) {
  const el = document.getElementById('val-writings');
  if (!writings || writings.length === 0) {
    el.innerHTML = '<div class="empty-state">No writings yet</div>';
    return;
  }
  
  el.innerHTML = writings.map(w => `
    <a href="${esc(w.url)}" target="_blank" class="writing-item">
      <div class="writing-header">
        <span class="writing-date">${esc(w.date || '—')}</span>
        <span class="writing-words">${w.wordCount} words</span>
      </div>
      <div class="writing-title">${esc(w.title)}</div>
      <div class="writing-preview">${esc(w.preview)}</div>
    </a>
  `).join('');
}

function renderLog(entries) {
  const el = document.getElementById('val-log');
  if (!entries || entries.length === 0) {
    el.innerHTML = '<div class="empty-state">No heartbeat activity yet</div>';
    return;
  }
  el.innerHTML = entries.map((e, i) => `
    <div class="log-entry clickable" onclick="showLogDetail(${i})">
      <span class="log-time">${esc(e.timestamp)}</span>
      <span class="log-mode badge-${e.mode}">${esc(e.mode)}</span>
      <span class="log-action">${esc(e.action.length > 80 ? e.action.slice(0, 80) + '...' : e.action)}</span>
    </div>
  `).join('');
}

window.showLogDetail = function(i) {
  const entry = cachedData.heartbeat?.log?.[i];
  if (entry) {
    showModal(`Heartbeat: ${entry.timestamp}`, `Mode: ${entry.mode}\n\n${entry.action}`);
  }
};

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
        ${tasks.map((t, i) => `
          <div class="task-item clickable" onclick="showTaskDetail('${esc(section)}', ${i})">
            <span class="task-status status-${t.status}">${esc(t.status)}</span>
            <span>
              <span class="task-title">${esc(t.title)}</span>
              ${t.detail ? `<span class="task-detail">— ${esc(t.detail.slice(0, 60))}${t.detail.length > 60 ? '...' : ''}</span>` : ''}
            </span>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

window.showTaskDetail = function(section, i) {
  const task = cachedData.todo?.[section]?.[i];
  if (task) {
    showModal(task.title, `Status: ${task.status}\n\n${task.detail || 'No additional details'}`);
  }
};

function renderInsights(insights) {
  const el = document.getElementById('val-insights');
  if (!insights || insights.length === 0) {
    el.innerHTML = '<div class="empty-state">No recent insights</div>';
    return;
  }
  el.innerHTML = insights.map((insight, i) => `
    <div class="insight-item clickable" onclick="showInsightDetail(${i})">
      <div class="insight-time">${esc(insight.timestamp)}</div>
      <div class="insight-text">${esc(insight.insight.length > 150 ? insight.insight.slice(0, 150) + '...' : insight.insight)}</div>
    </div>
  `).join('');
}

window.showInsightDetail = function(i) {
  const insight = cachedData.insights?.[i];
  if (insight) {
    showModal(`Insight: ${insight.timestamp}`, insight.insight);
  }
};

function renderResearch(files) {
  const el = document.getElementById('val-research');
  if (!files || files.length === 0) {
    el.innerHTML = '<div class="empty-state">No research files</div>';
    return;
  }
  el.innerHTML = files.map((r, i) => `
    <div>
      <div class="research-item clickable" onclick="toggleResearch(${i})">
        <div>
          <div class="research-title">${esc(r.title)}</div>
          <div class="research-meta">${esc(r.file)} · ${r.wordCount} words · ${timeAgo(r.modified)}</div>
        </div>
        <span class="expand-icon">▶</span>
      </div>
      <div class="research-detail" id="research-detail-${i}">${esc(r.preview || '')}</div>
    </div>
  `).join('');
}

window.toggleResearch = function(i) {
  const el = document.getElementById(`research-detail-${i}`);
  const item = el?.previousElementSibling;
  if (el) {
    el.classList.toggle('open');
    if (item) {
      const icon = item.querySelector('.expand-icon');
      if (icon) icon.textContent = el.classList.contains('open') ? '▼' : '▶';
    }
  }
};

async function renderCrons() {
  const el = document.getElementById('val-crons');
  try {
    const data = await apiFetch('/api/crons');
    cachedData.crons = data;
    const jobs = data.jobs || data || [];
    if (!Array.isArray(jobs) || jobs.length === 0) {
      el.innerHTML = `<div class="empty-state">${data.note ? esc(data.note) : 'No cron jobs'}</div>`;
      return;
    }
    el.innerHTML = jobs.map((j, i) => {
      const sched = j.schedule;
      let schedStr = '?';
      if (sched?.kind === 'cron') schedStr = sched.expr;
      else if (sched?.kind === 'every') schedStr = `every ${Math.round((sched.everyMs || 0) / 60000)}m`;
      else if (sched?.kind === 'at') schedStr = `at ${new Date(sched.atMs).toLocaleString()}`;

      return `
        <div class="cron-item clickable" onclick="showCronDetail(${i})">
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

window.showCronDetail = function(i) {
  const jobs = cachedData.crons?.jobs || cachedData.crons || [];
  const job = jobs[i];
  if (!job) return;
  
  const sched = job.schedule;
  let schedStr = JSON.stringify(sched, null, 2);
  const payload = job.payload;
  let payloadStr = JSON.stringify(payload, null, 2);
  
  showModal(job.name || job.id || 'Cron Job', `ID: ${job.id || 'unknown'}
Name: ${job.name || 'unnamed'}
Enabled: ${job.enabled !== false ? 'yes' : 'no'}
Session Target: ${job.sessionTarget || 'unknown'}

Schedule:
${schedStr}

Payload:
${payloadStr}`);
};

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
    const overview = await apiFetch('/api/overview');
    
    // Cache data for drill-down
    cachedData = {
      ...overview,
      todo: overview.todo,
      insights: overview.insights,
      heartbeat: overview.heartbeat,
      system: overview.system,
    };

    renderMood(overview.mood);
    renderHeartbeatState(overview.heartbeat.state, overview.mood);
    renderLog(overview.heartbeat.log);
    renderTodo(overview.todo);
    renderInsights(overview.insights);
    renderResearch(overview.research);
    renderSystem(overview.system);
    renderWritings(overview.writings);

    renderCrons();
    renderCuriosity();

    document.getElementById('last-updated').textContent =
      `Updated: ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    console.error('Refresh failed:', e);
  } finally {
    dot.classList.remove('fetching');
  }
}

// --- Keyboard shortcuts ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'r' && !e.metaKey && !e.ctrlKey) refresh();
});

// --- Init ---

updateClock();
setInterval(updateClock, 1000);
refresh();
setInterval(refresh, REFRESH_INTERVAL);
