#!/bin/bash
# Stop Jarvis Dashboard server
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.dash.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "Dashboard not running (no PID file)"
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "⚡ Dashboard stopped (PID $PID)"
else
  echo "Dashboard process $PID not found (stale PID file)"
fi
rm -f "$PID_FILE"
