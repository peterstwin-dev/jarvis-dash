#!/bin/bash
# Start Jarvis Dashboard server
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.dash.pid"
LOG_FILE="$SCRIPT_DIR/dash.log"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "⚡ Dashboard already running (PID $OLD_PID)"
    echo "   http://127.0.0.1:18791"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

cd "$SCRIPT_DIR"
nohup node server.js > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "⚡ Jarvis Dashboard started (PID $(cat "$PID_FILE"))"
echo "   http://127.0.0.1:18791"
echo "   Logs: $LOG_FILE"
