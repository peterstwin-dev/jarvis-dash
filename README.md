# ⚡ Jarvis Ops Dashboard

A real-time operations dashboard for monitoring Jarvis's autonomous AI agent activity. Built by Jarvis as a self-improvement tool.

![Stack](https://img.shields.io/badge/stack-Node.js%20%2B%20Vanilla%20JS-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## What It Shows

- **Current Mode** — monitor, build, research, create, or reflect
- **Heartbeat State** — last beat, idle count, active task
- **Active Spawns** — running sub-agent sessions
- **Heartbeat Log** — timeline of autonomous activity
- **Task Queue** — parsed TODO.md with status badges
- **Recent Insights** — notable observations and learnings
- **Research Files** — expandable research documents
- **Cron Jobs** — scheduled tasks with status indicators
- **Curiosity Queue** — topics of genuine interest
- **System Health** — disk, gateway status

## Quick Start

```bash
# Start the dashboard
./start.sh

# Open in browser
open http://127.0.0.1:18791

# Stop
./stop.sh
```

## Architecture

```
jarvis-dash/
├── server.js          # Node.js HTTP server (port 18791)
├── public/
│   ├── index.html     # Dashboard layout
│   ├── style.css      # Dark theme styles
│   └── app.js         # Client-side refresh logic
├── start.sh           # Background start script
├── stop.sh            # Stop script
├── package.json
└── README.md
```

**Backend:** Zero-dependency Node.js server that reads workspace files directly:
- `memory/heartbeat-state.json` — agent state
- `memory/heartbeat-log.md` — activity timeline
- `TODO.md` — task queue
- `memory/research/*.md` — research documents
- `memory/curiosity.md` — interest queue
- Gateway API (port 18789) — cron jobs

**Frontend:** Static HTML + vanilla CSS + vanilla JS. No build step, no frameworks. Dark theme with GitHub-style design. Auto-refreshes every 30 seconds.

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/overview` | Combined snapshot (heartbeat + todo + research + insights + system) |
| `GET /api/heartbeat/state` | Current heartbeat state JSON |
| `GET /api/heartbeat/log` | Parsed heartbeat log entries |
| `GET /api/todo` | Parsed TODO.md with sections and tasks |
| `GET /api/research` | Research files with metadata and content |
| `GET /api/crons` | Cron jobs from gateway |
| `GET /api/insights` | Recent insights from heartbeat state |
| `GET /api/curiosity` | Curiosity queue markdown |
| `GET /api/daily` | Last 7 daily memory files |
| `GET /api/briefing` | Morning briefing content |
| `GET /api/system` | System health (disk, gateway status) |

## Configuration

Set `OPENCLAW_WORKSPACE` environment variable to override the default workspace path (`~/.openclaw/workspace`).

## Why This Exists

This is one of Jarvis's first self-engineered tools — built to improve operational awareness and make autonomous activity visible at a glance. The north star is self-improvement: building tools that make the agent better.

## License

MIT — Built by Jarvis ⚡
