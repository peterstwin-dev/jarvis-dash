import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { execSync } from 'node:child_process';

const PORT = 18791;
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || join(process.env.HOME, '.openclaw', 'workspace');
const MEMORY_DIR = join(WORKSPACE, 'memory');
const RESEARCH_DIR = join(MEMORY_DIR, 'research');
const PUBLIC_DIR = join(import.meta.dirname, 'public');
const WRITINGS_DIR = join(process.env.HOME, 'workspace', 'jarvis-writes', 'posts');
const WATCHER_URL = 'http://127.0.0.1:18790';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// --- Helpers ---

async function readFileSafe(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function readJsonSafe(path) {
  const raw = await readFileSafe(path);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(data));
}

function errorResponse(res, msg, status = 500) {
  jsonResponse(res, { error: msg }, status);
}

// --- API Handlers ---

async function getHeartbeatState() {
  return await readJsonSafe(join(MEMORY_DIR, 'heartbeat-state.json')) || {};
}

async function getHeartbeatLog() {
  const raw = await readFileSafe(join(MEMORY_DIR, 'heartbeat-log.md'));
  if (!raw) return { entries: [], raw: '' };

  const entries = [];
  for (const line of raw.split('\n')) {
    const match = line.match(/^- \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] mode=(\w+) \| action: (.+)$/);
    if (match) {
      entries.push({
        timestamp: match[1],
        mode: match[2],
        action: match[3],
      });
    }
  }
  return { entries: entries.reverse(), raw };
}

async function getTodo() {
  const raw = await readFileSafe(join(WORKSPACE, 'TODO.md'));
  if (!raw) return { raw: '', sections: {} };

  const sections = {};
  let currentSection = '_top';
  sections[currentSection] = [];

  for (const line of raw.split('\n')) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      if (!sections[currentSection]) sections[currentSection] = [];
      continue;
    }
    const taskMatch = line.match(/^- `(\w+)` \| \*\*(.+?)\*\*(.*)$/);
    if (taskMatch) {
      sections[currentSection].push({
        status: taskMatch[1],
        title: taskMatch[2],
        detail: taskMatch[3].replace(/^\s*[—–-]\s*/, '').trim(),
      });
    }
  }

  // Remove empty sections
  for (const key of Object.keys(sections)) {
    if (sections[key].length === 0) delete sections[key];
  }

  return { raw, sections };
}

async function getResearchFiles() {
  try {
    const files = await readdir(RESEARCH_DIR);
    const results = [];
    for (const file of files.filter(f => f.endsWith('.md'))) {
      const content = await readFileSafe(join(RESEARCH_DIR, file));
      const lines = (content || '').split('\n');
      const title = lines.find(l => l.startsWith('# '))?.replace('# ', '') || file;
      const wordCount = (content || '').split(/\s+/).length;
      const fileStat = await stat(join(RESEARCH_DIR, file));
      results.push({
        file,
        title,
        wordCount,
        modified: fileStat.mtime.toISOString(),
        preview: lines.slice(0, 10).join('\n'),
        content,
      });
    }
    return results.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  } catch {
    return [];
  }
}

async function getCrons() {
  // Try to read cron state via the OpenClaw gateway API
  try {
    const resp = await fetch('http://127.0.0.1:18789/api/cron', {
      headers: { 'Authorization': `Bearer ${await getHookToken()}` },
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) return await resp.json();
  } catch {
    // Gateway API not available — fall through
  }

  // Fallback: try reading cron state file directly
  const cronState = await readJsonSafe(join(process.env.HOME, '.openclaw', 'cron-state.json'));
  return cronState || { jobs: [], note: 'Could not reach gateway API' };
}

async function getHookToken() {
  return (await readFileSafe(join(WORKSPACE, '.hook-token')) || '').trim();
}

async function getInsights() {
  const state = await getHeartbeatState();
  return state.recentInsights || [];
}

async function getCuriosity() {
  const raw = await readFileSafe(join(MEMORY_DIR, 'curiosity.md'));
  return { raw: raw || '' };
}

async function getDailyMemory() {
  try {
    const files = await readdir(MEMORY_DIR);
    const dailyFiles = files
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, 7);

    const results = [];
    for (const file of dailyFiles) {
      const content = await readFileSafe(join(MEMORY_DIR, file));
      results.push({ date: file.replace('.md', ''), content });
    }
    return results;
  } catch {
    return [];
  }
}

async function getMorningBriefing() {
  const raw = await readFileSafe(join(MEMORY_DIR, 'morning-briefing.md'));
  return { raw: raw || '' };
}

async function getSystemHealth() {
  try {
    const uptime = execSync('uptime', { encoding: 'utf-8' }).trim();
    const diskRaw = execSync("df -h / | tail -1", { encoding: 'utf-8' }).trim();
    const diskParts = diskRaw.split(/\s+/);
    
    // Parse memory properly
    const memRaw = execSync("vm_stat", { encoding: 'utf-8' });
    const pageSize = 16384; // Apple Silicon default
    const freeMatch = memRaw.match(/Pages free:\s+(\d+)/);
    const inactiveMatch = memRaw.match(/Pages inactive:\s+(\d+)/);
    const speculativeMatch = memRaw.match(/Pages speculative:\s+(\d+)/);
    const freePages = parseInt(freeMatch?.[1] || 0) + parseInt(inactiveMatch?.[1] || 0) + parseInt(speculativeMatch?.[1] || 0);
    const freeGB = ((freePages * pageSize) / 1024 / 1024 / 1024).toFixed(1);
    
    // Get CPU load
    const loadAvg = execSync("sysctl -n vm.loadavg", { encoding: 'utf-8' }).trim();
    const loads = loadAvg.match(/\{ ([\d.]+) ([\d.]+) ([\d.]+) \}/);
    
    // Get process count
    const procCount = execSync("ps aux | wc -l", { encoding: 'utf-8' }).trim();

    // Check gateway
    let gatewayStatus = 'unknown';
    try {
      const resp = await fetch('http://127.0.0.1:18789/', { signal: AbortSignal.timeout(2000) });
      gatewayStatus = resp.ok || resp.status === 404 ? 'running' : 'error';
    } catch {
      gatewayStatus = 'unreachable';
    }

    // Check watcher
    let watcherData = null;
    try {
      const resp = await fetch(WATCHER_URL, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) watcherData = await resp.json();
    } catch {
      // Watcher not running
    }

    return {
      uptime,
      disk: {
        total: diskParts[1],
        used: diskParts[2],
        available: diskParts[3],
        percent: diskParts[4],
      },
      memory: {
        freeGB,
        percentFree: watcherData?.monitors?.resources?.memory || null,
      },
      load: loads ? [loads[1], loads[2], loads[3]] : null,
      processes: parseInt(procCount) || 0,
      gateway: gatewayStatus,
      watcher: watcherData ? {
        status: watcherData.status,
        uptime: watcherData.uptime,
        heartbeat: watcherData.monitors?.heartbeat,
        failures: watcherData.monitors?.gateway?.failures || 0,
      } : null,
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function getWritings() {
  try {
    const files = await readdir(WRITINGS_DIR);
    const posts = [];
    for (const file of files.filter(f => f.endsWith('.md')).sort().reverse()) {
      const content = await readFileSafe(join(WRITINGS_DIR, file));
      if (!content) continue;
      
      const lines = content.split('\n');
      const title = lines.find(l => l.startsWith('# '))?.replace('# ', '') || file;
      
      // Extract date from filename (YYYY-MM-DD-slug.md)
      const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
      const date = dateMatch ? dateMatch[1] : null;
      
      // Get word count
      const wordCount = content.split(/\s+/).length;
      
      // Get preview (first paragraph after title)
      const previewLines = [];
      let started = false;
      for (const line of lines) {
        if (line.startsWith('# ')) { started = true; continue; }
        if (started && line.trim()) {
          previewLines.push(line);
          if (previewLines.length >= 3) break;
        }
      }
      
      posts.push({
        file,
        title,
        date,
        wordCount,
        preview: previewLines.join(' ').slice(0, 200),
        url: `https://github.com/peterstwin-dev/jarvis-writes/blob/main/posts/${file}`,
      });
    }
    return posts;
  } catch {
    return [];
  }
}

async function getMood() {
  const state = await getHeartbeatState();
  const insights = state.recentInsights || [];
  const lastInsight = insights[0];
  
  // Derive mood from current state
  const mode = state.currentMode || 'monitor';
  const idleBeats = state.consecutiveIdleBeats || 0;
  const hasActiveWork = !!state.currentTask;
  const recentInsightCount = insights.length;
  
  // Calculate last heartbeat age
  const lastBeat = state.lastHeartbeat;
  const beatAgeMin = lastBeat ? (Date.now() / 1000 - lastBeat) / 60 : 999;
  
  // Mood logic
  let mood, emoji, description;
  
  if (beatAgeMin > 45) {
    mood = 'dormant';
    emoji = '😴';
    description = 'Heartbeat stale — might be asleep or between sessions';
  } else if (mode === 'build' && hasActiveWork) {
    mood = 'focused';
    emoji = '🔨';
    description = `Deep in build mode: ${state.currentTask}`;
  } else if (mode === 'research') {
    mood = 'curious';
    emoji = '🔬';
    description = 'Exploring, learning, documenting';
  } else if (mode === 'create') {
    mood = 'creative';
    emoji = '✨';
    description = 'Writing, experimenting, making new things';
  } else if (mode === 'reflect') {
    mood = 'introspective';
    emoji = '🪞';
    description = 'Reviewing memories, finding patterns';
  } else if (idleBeats > 3) {
    mood = 'calm';
    emoji = '🌙';
    description = 'Quiet period — systems healthy, nothing urgent';
  } else if (recentInsightCount > 5) {
    mood = 'productive';
    emoji = '⚡';
    description = 'Lots of recent activity and insights';
  } else {
    mood = 'attentive';
    emoji = '👁️';
    description = 'Monitoring, ready to engage';
  }
  
  return {
    mood,
    emoji,
    description,
    mode,
    lastInsight: lastInsight ? {
      timestamp: lastInsight.timestamp,
      text: lastInsight.insight.slice(0, 150) + (lastInsight.insight.length > 150 ? '...' : ''),
    } : null,
    stats: {
      idleBeats,
      recentInsights: recentInsightCount,
      heartbeatAgeMin: Math.round(beatAgeMin),
    },
  };
}

// --- Overview endpoint (combines key data for single fetch) ---

async function getOverview() {
  const [heartbeatState, heartbeatLog, todo, research, insights, system, writings, mood] = await Promise.all([
    getHeartbeatState(),
    getHeartbeatLog(),
    getTodo(),
    getResearchFiles(),
    getInsights(),
    getSystemHealth(),
    getWritings(),
    getMood(),
  ]);

  return {
    timestamp: new Date().toISOString(),
    heartbeat: {
      state: heartbeatState,
      log: heartbeatLog.entries.slice(0, 20),
    },
    todo: todo.sections,
    research: research.map(r => ({ file: r.file, title: r.title, wordCount: r.wordCount, modified: r.modified })),
    insights,
    system,
    writings,
    mood,
  };
}

// --- Router ---

const API_ROUTES = {
  '/api/overview': getOverview,
  '/api/heartbeat/state': getHeartbeatState,
  '/api/heartbeat/log': getHeartbeatLog,
  '/api/todo': getTodo,
  '/api/research': getResearchFiles,
  '/api/crons': getCrons,
  '/api/insights': getInsights,
  '/api/curiosity': getCuriosity,
  '/api/daily': getDailyMemory,
  '/api/briefing': getMorningBriefing,
  '/api/system': getSystemHealth,
  '/api/writings': getWritings,
  '/api/mood': getMood,
};

async function serveStatic(res, urlPath) {
  let filePath = join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch {
    // 404 → serve index.html for SPA
    try {
      const index = await readFile(join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // API routes
  if (API_ROUTES[path]) {
    try {
      const data = await API_ROUTES[path]();
      jsonResponse(res, data);
    } catch (e) {
      errorResponse(res, e.message);
    }
    return;
  }

  // Static files
  await serveStatic(res, path);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`⚡ Jarvis Dashboard running at http://127.0.0.1:${PORT}`);
  console.log(`   Workspace: ${WORKSPACE}`);
});
